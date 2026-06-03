from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# [STEP 9] เพิ่ม BaseModel, Field สำหรับรับข้อมูล Feedback แบบ JSON
from pydantic import BaseModel, Field

from app.ai.infer import YOLOService
from app.utils.io import save_upload_bytes, load_image_bgr, ensure_dir
from app.services.scan_service import save_scan_result_to_supabase

# [STEP 9] เพิ่ม supabase client เพื่อบันทึก Feedback ลงตาราง feedback
from app.supabase_client import supabase

APP_NAME = "BananaVision Backend"

UPLOAD_DIR = "uploads"
RESULT_DIR = "results"

# ใช้โมเดลจาก backend/models/
DETECT_MODEL_PATH = os.getenv("DETECT_MODEL_PATH", "models/banana_finger_detect.pt")
CLS_MODEL_PATH = os.getenv("CLS_MODEL_PATH", "models/banana_ripeness_cls_4cls.pt")

DEFAULT_CONF = float(os.getenv("CONF", "0.25"))

# สร้างโฟลเดอร์ก่อน mount
ensure_dir(UPLOAD_DIR)
ensure_dir(RESULT_DIR)

app = FastAPI(title=APP_NAME)

# Static serving
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/results", StaticFiles(directory=RESULT_DIR), name="results")

# CORS สำหรับ React Native / browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

yolo_service: Optional[YOLOService] = None


# [STEP 9] Model สำหรับรับ Feedback จาก Mobile
# ใช้กับ Guest ก่อน เพราะตอนนี้ยังไม่มี Login/Register
class FeedbackRequest(BaseModel):
    scan_id: str = Field(..., min_length=1)
    guest_id: Optional[str] = "guest"
    rating: int = Field(..., ge=1, le=5)
    is_correct: Optional[bool] = None
    comment: Optional[str] = None


@app.on_event("startup")
def on_startup():
    global yolo_service

    if not Path(DETECT_MODEL_PATH).exists():
        raise RuntimeError(f"Detection model not found at: {DETECT_MODEL_PATH}")

    if not Path(CLS_MODEL_PATH).exists():
        raise RuntimeError(f"Classification model not found at: {CLS_MODEL_PATH}")

    # โหลด 2 โมเดลครั้งเดียวตอน backend start
    yolo_service = YOLOService(
        model_path=DETECT_MODEL_PATH,
        cls_model_path=CLS_MODEL_PATH,
    )

    print(f"[startup] Detection model loaded: {DETECT_MODEL_PATH}")
    print(f"[startup] Classification model loaded: {CLS_MODEL_PATH}")


@app.get("/")
def root():
    return {
        "message": "BananaVision Backend running",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": APP_NAME,
        "detect_model_path": DETECT_MODEL_PATH,
        "cls_model_path": CLS_MODEL_PATH,
    }


@app.post("/detect")
async def detect(file: UploadFile = File(...), conf: Optional[float] = None):
    global yolo_service

    if yolo_service is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    # validate content type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content_type: {file.content_type}",
        )

    image_bytes = await file.read()

    print(
        "[detect]",
        "filename:", file.filename,
        "content_type:", file.content_type,
        "bytes:", len(image_bytes),
    )

    if not image_bytes or len(image_bytes) < 1000:
        raise HTTPException(status_code=400, detail="Empty or too small image payload")

    # เช็กว่า bytes เป็นรูปจริง
    npbuf = np.frombuffer(image_bytes, dtype=np.uint8)
    img_check = cv2.imdecode(npbuf, cv2.IMREAD_COLOR)

    if img_check is None:
        raise HTTPException(
            status_code=400,
            detail="Cannot decode image bytes (invalid/unsupported format)",
        )

    try:
        # เซฟรูปต้นฉบับลง uploads/
        saved_path = save_upload_bytes(
            image_bytes,
            UPLOAD_DIR,
            ext=_guess_ext(file.filename),
        )
        saved_name = Path(saved_path).name

        # โหลดภาพ BGR
        img = load_image_bgr(saved_path)
        if img is None:
            img = img_check

        t0 = time.time()

        # Model 1 + Model 2 pipeline
        result = yolo_service.predict(
            img,
            conf=conf if conf is not None else DEFAULT_CONF,
        )

        dt_ms = int((time.time() - t0) * 1000)

        if result is None:
            result = {}

        # ดึงรูป annotated ที่ infer.py วาดไว้แล้ว
        annotated_image = result.pop("annotated_image", None)

        result_name = f"result_{saved_name}"
        result_path = str(Path(RESULT_DIR) / result_name)

        if annotated_image is not None:
            cv2.imwrite(result_path, annotated_image)
        else:
            # fallback ถ้าไม่มีรูป annotated
            cv2.imwrite(result_path, img)

        detections = result.get("detections", [])
        if not isinstance(detections, list):
            detections = []

        summary = result.get(
            "summary",
            {
                "green": 0,
                "breaker": 0,
                "ripe": 0,
                "overripe": 0,
            },
        )

        # กัน key หาย
        summary.setdefault("green", 0)
        summary.setdefault("breaker", 0)
        summary.setdefault("ripe", 0)
        summary.setdefault("overripe", 0)
        summary.setdefault("total", len(detections))

        # ==============================
        # Save to Supabase
        # ==============================
        scan_id = None
        supabase_original_url = None
        supabase_result_url = None
        supabase_saved = False
        supabase_error = None

        try:
            saved_scan = save_scan_result_to_supabase(
                original_path=saved_path,
                result_path=result_path,
                detections=detections,
                summary=summary,
                inference_ms=dt_ms,
                user_id=None,       # ตอนนี้ยังไม่มี Login/Register
                guest_id="guest",   # ใช้ Guest ไปก่อน
            )

            scan_id = saved_scan.get("scan_id")
            supabase_original_url = saved_scan.get("original_image_url")
            supabase_result_url = saved_scan.get("result_image_url")
            supabase_saved = True

        except Exception as e:
            # ไม่ให้ detect พัง ถ้า Supabase มีปัญหา
            supabase_error = str(e)
            print("[supabase] save scan failed:", repr(e))

        return {
            "ok": True,
            "filename": file.filename,
            "content_type": file.content_type,

            "saved_path": saved_path,
            "saved_url": f"/uploads/{saved_name}",

            "result_path": result_path,
            "result_url": f"/results/{result_name}",

            "inference_ms": dt_ms,

            # สำหรับ UI ใช้ง่าย
            "count": len(detections),
            "total_detections": len(detections),
            "summary": summary,
            "detections": detections,

            # Supabase
            "scan_id": scan_id,
            "supabase_saved": supabase_saved,
            "supabase_error": supabase_error,
            "supabase_original_url": supabase_original_url,
            "supabase_result_url": supabase_result_url,

            # ข้อมูลเสริมจาก infer.py
            "image_width": result.get("image_width"),
            "image_height": result.get("image_height"),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# [STEP 9] Endpoint สำหรับรับคะแนนดาว + ความคิดเห็นจาก Guest/Member
# ตอนนี้ใช้ Guest ก่อน เพราะยังไม่มี Login/Register
@app.post("/feedback")
def submit_feedback(payload: FeedbackRequest):
    try:
        feedback_row = {
            "user_id": None,  # ยังไม่มี Login/Register จึงยังไม่ผูก user_id
            "guest_id": payload.guest_id or "guest",
            "scan_id": payload.scan_id,
            "rating": payload.rating,
            "is_correct": payload.is_correct,
            "comment": payload.comment.strip() if payload.comment else None,
        }

        response = (
            supabase.table("feedback")
            .insert(feedback_row)
            .execute()
        )

        if not response.data:
            raise RuntimeError("Cannot insert feedback")

        return {
            "ok": True,
            "feedback_id": response.data[0]["id"],
            "message": "Feedback saved successfully",
        }

    except Exception as e:
        print("[feedback] save failed:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


def _guess_ext(filename: Optional[str]) -> str:
    if not filename:
        return ".jpg"

    lower = filename.lower()

    for ext in [".jpg", ".jpeg", ".png", ".webp"]:
        if lower.endswith(ext):
            return ext

    return ".jpg"