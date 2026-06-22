from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from urllib.parse import quote

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
# Step 5.5 ค่อยเพิ่ม user_id ให้ Feedback
class FeedbackRequest(BaseModel):
    scan_id: str = Field(..., min_length=1)
    # [STEP 5.5] ถ้า Login อยู่ Mobile จะส่ง user_id มา
    user_id: Optional[str] = None

    # [STEP 5.5] ถ้าเป็น Guest จะส่ง guest_id = "guest"
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

@app.get("/auth/reset-bridge", response_class=HTMLResponse)
async def reset_bridge(
    token_hash: Optional[str] = Query(None),
    reset_type: str = Query("recovery", alias="type"),
):
    if not token_hash:
        return HTMLResponse(
            content="""
            <!DOCTYPE html>
            <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <title>Reset Password Error</title>
                </head>
                <body style="font-family: Arial; padding: 32px; background: #FBF7E3;">
                    <h2>Reset Password Error</h2>
                    <p>ไม่พบ token_hash จากลิงก์ กรุณาขอ Reset Password ใหม่อีกครั้ง</p>
                </body>
            </html>
            """,
            status_code=400,
        )

    expo_url = (
        "exp://172.20.10.2:8081/--/reset-password"
        f"?token_hash={quote(token_hash, safe='')}"
        f"&type={quote(reset_type, safe='')}"
    )

    html = f"""
    <!DOCTYPE html>
    <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Open BananaVision</title>
        </head>

        <body style="font-family: Arial; padding: 32px; background: #FBF7E3;">
            <h2>Reset Password</h2>

            <p>กดปุ่มด้านล่างเพื่อเปิดแอป BananaVision และตั้งรหัสผ่านใหม่</p>

            <a
                href="{expo_url}"
                style="
                    display: inline-block;
                    padding: 16px 24px;
                    background: #27AE60;
                    color: white;
                    border-radius: 999px;
                    text-decoration: none;
                    font-weight: bold;
                    font-size: 18px;
            "
            >
                Open BananaVision
            </a>

            <p style="margin-top: 24px; color: #666;">
                ถ้าปุ่มไม่ทำงาน ให้ copy ลิงก์นี้ไปเปิด:
            </p>

            <p style="word-break: break-all;">
                {expo_url}
            </p>
        </body>
    </html>
    """

    return HTMLResponse(content=html)

# ตรงนี้คือ API/detect ที่ Mobile ส่งรูปเข้ามาให้ Backend วิเคราะห์
@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    conf: Optional[float] = None,

    # [STEP 5.2] รับ user_id / guest_id จาก Mobile FormData
    # ถ้า Login แล้ว Mobile จะส่ง user_id มา
    # ถ้าเป็น Guest จะส่ง guest_id = "guest" มา
    user_id: Optional[str] = Form(None),
    guest_id: Optional[str] = Form(None),
):
    global yolo_service

    if yolo_service is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    # validate content type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content_type: {file.content_type}",
        )
    # Backend อ่านไฟล์รูปที่ Mobile ส่งเข้ามา
    image_bytes = await file.read()

    print(
        "[detect]",
        "filename:", file.filename,
        "content_type:", file.content_type,
        "bytes:", len(image_bytes),
    )

    # [STEP 5.2] Debug ดูว่า Mobile ส่ง user_id / guest_id มาถึง Backend ไหม
    print(
        "[detect auth raw]",
        "user_id:", user_id,
        "guest_id:", guest_id,
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

        # Model 1 + Model 2 pipeline main.py ส่งรูปไปให้ AI ใน infer.py วิเคราะห์
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
        # หลังจาก AI วาดกรอบและใส่ผลลัพธ์แล้ว Backend จะเซฟรูปผลลัพธ์ไว้ในโฟลเดอร์ result
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

        # [STEP 5.2] ตัดสินว่า scan นี้เป็นของ Member หรือ Guest
        # ถ้ามี user_id = Member
        # ถ้าไม่มี user_id = Guest
        final_user_id = user_id.strip() if user_id else None
        final_guest_id = None if final_user_id else (guest_id.strip() if guest_id else "guest")

        print(
            "[detect auth]",
            "user_id:", final_user_id,
            "guest_id:", final_guest_id,
        )

        try:
            saved_scan = save_scan_result_to_supabase(
                original_path=saved_path,
                result_path=result_path,
                detections=detections,
                summary=summary,
                inference_ms=dt_ms,

                # [STEP 5.2] ส่ง user_id / guest_id จริงไปให้ scan_service บันทึกลง scan_history
                user_id=final_user_id,
                guest_id=final_guest_id,
            )

            scan_id = saved_scan.get("scan_id")
            supabase_original_url = saved_scan.get("original_image_url")
            supabase_result_url = saved_scan.get("result_image_url")
            supabase_saved = True

        except Exception as e:
            # ไม่ให้ detect พัง ถ้า Supabase มีปัญหา
            supabase_error = str(e)
            print("[supabase] save scan failed:", repr(e))
        #Backend ส่งผลกลับไปให้ Mobile เป็น JSON มีทั้งรูปผลลัพธ์, สรุปจำนวนกล้วยแต่ละระดับ และ รายละเอียดรายลูก
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

            # [STEP 5.2] ส่งกลับไปให้ Mobile Debug ดูว่า Backend รับ owner ถูกไหม
            "user_id": final_user_id,
            "guest_id": final_guest_id,

            # ข้อมูลเสริมจาก infer.py
            "image_width": result.get("image_width"),
            "image_height": result.get("image_height"),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# [STEP 9] Endpoint สำหรับรับคะแนนดาว + ความคิดเห็นจาก Guest/Member
# [STEP 5.5] รับ user_id จาก Mobile แล้วบันทึก feedback ให้ตรงเจ้าของ
@app.post("/feedback")
def submit_feedback(payload: FeedbackRequest):
    try:
        # [STEP 5.5] ถ้ามี user_id = Member
        # ถ้าไม่มี user_id = Guest
        final_user_id = payload.user_id.strip() if payload.user_id else None
        final_guest_id = None if final_user_id else (payload.guest_id or "guest")

        print(
            "[feedback auth]",
            "scan_id:", payload.scan_id,
            "user_id:", final_user_id,
            "guest_id:", final_guest_id,
        )

        feedback_row = {
            # [STEP 5.5] ถ้าเป็น Member จะบันทึก user_id จริง
            "user_id": final_user_id,

            # [STEP 5.5] ถ้าเป็น Member ให้ guest_id เป็น NULL
            # ถ้าเป็น Guest ให้ guest_id = "guest"
            "guest_id": final_guest_id,

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

            # [STEP 5.5] ส่งกลับให้ Mobile/debug ดูว่า feedback ถูกผูกกับใคร
            "user_id": final_user_id,
            "guest_id": final_guest_id,
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