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

from app.ai.infer import YOLOService
from app.utils.io import save_upload_bytes, load_image_bgr, ensure_dir

APP_NAME = "BananaVision Backend"

UPLOAD_DIR = "uploads"
RESULT_DIR = "results"

# ใช้โมเดลจาก backend/models/
DETECT_MODEL_PATH = os.getenv("DETECT_MODEL_PATH", "models/banana_finger_detect.pt")
CLS_MODEL_PATH = os.getenv("CLS_MODEL_PATH", "models/banana_ripeness_cls.pt")

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

        summary = result.get("summary", {
            "green": 0,
            "breaker": 0,
            "ripe": 0,
        })

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

            # ข้อมูลเสริมจาก infer.py
            "image_width": result.get("image_width"),
            "image_height": result.get("image_height"),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _guess_ext(filename: Optional[str]) -> str:
    if not filename:
        return ".jpg"

    lower = filename.lower()

    for ext in [".jpg", ".jpeg", ".png", ".webp"]:
        if lower.endswith(ext):
            return ext

    return ".jpg"