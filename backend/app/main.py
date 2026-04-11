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
MODEL_PATH = os.getenv("MODEL_PATH", "runs/detect/train10/weights/best.pt")
DEFAULT_CONF = float(os.getenv("CONF", "0.25"))

# ✅ [ADD] mapping id -> ชื่อจริง (ตอนนี้ใช้ COCO: 46 = banana)
# ถ้าเปลี่ยนเป็นโมเดลที่เทรนเอง ให้แก้ dict นี้ให้ตรงกับคลาสของเรา
CLASS_NAMES = {
    0: "banana_finger",
}

# ✅ สร้างโฟลเดอร์ก่อน mount (กัน StaticFiles พังตอนเริ่มรัน)
ensure_dir(UPLOAD_DIR)
ensure_dir(RESULT_DIR)

app = FastAPI(title=APP_NAME)

# Static serving
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/results", StaticFiles(directory=RESULT_DIR), name="results")

# CORS (เรียกจาก RN / browser)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # โปรดักชันค่อยล็อก
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

yolo_service: Optional[YOLOService] = None


@app.on_event("startup")
def on_startup():
    global yolo_service

    if not Path(MODEL_PATH).exists():
        raise RuntimeError(f"Model not found at: {MODEL_PATH}")

    # โหลดครั้งเดียวตอน start
    yolo_service = YOLOService(MODEL_PATH)
    print(f"[startup] YOLO loaded: {MODEL_PATH}")


@app.get("/")
def root():
    return {"message": "BananaVision Backend running"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": APP_NAME,
        "model_path": MODEL_PATH,
    }


@app.post("/detect")
async def detect(file: UploadFile = File(...), conf: Optional[float] = None):
    global yolo_service
    if yolo_service is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    # ✅ validate content type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail=f"Invalid content_type: {file.content_type}")

    image_bytes = await file.read()

    print(
        "[detect]",
        "filename:", file.filename,
        "content_type:", file.content_type,
        "bytes:", len(image_bytes)
    )

    if not image_bytes or len(image_bytes) < 1000:
        raise HTTPException(status_code=400, detail="Empty or too small image payload")

    # ✅ ตรวจว่า bytes เป็นรูปจริงก่อน
    npbuf = np.frombuffer(image_bytes, dtype=np.uint8)
    img_check = cv2.imdecode(npbuf, cv2.IMREAD_COLOR)
    if img_check is None:
        raise HTTPException(status_code=400, detail="Cannot decode image bytes (invalid/unsupported format)")

    try:
        # ✅ เซฟไฟล์ลง uploads/
        saved_path = save_upload_bytes(image_bytes, UPLOAD_DIR, ext=_guess_ext(file.filename))
        saved_name = Path(saved_path).name

        # ✅ โหลดภาพจากไฟล์ (fallback เป็น img_check)
        img = load_image_bgr(saved_path)
        if img is None:  # ✅ FIX: is None (แก้จาก in None / กันพัง)
            img = img_check

        t0 = time.time()
        result = yolo_service.predict(img, conf=conf if conf is not None else DEFAULT_CONF)
        dt_ms = int((time.time() - t0) * 1000)

        if result is None:
            result = {}

        # ---- save annotated image ----
        result_name = f"result_{saved_name}"
        result_path = str(Path(RESULT_DIR) / result_name)

        # ✅ กัน result["detections"] = None
        detections = result.get("detections", None)
        if not isinstance(detections, list):
            detections = []

        img_anno = img.copy()

        for d in detections:
            bbox = d.get("bbox_xyxy")
            if not bbox or len(bbox) != 4:
                continue

            x1, y1, x2, y2 = map(int, bbox)

            cv2.rectangle(img_anno, (x1, y1), (x2, y2), (0, 255, 0), 2)

            # ✅ [CHANGE] แปลง class_id -> ชื่อจริง (banana) แทนการโชว์เลข 46
            class_id = d.get("class_id", None)
            label = CLASS_NAMES.get(class_id, str(class_id))  # fallback เป็นเลข ถ้าไม่เจอใน dict

            cv2.putText(
                img_anno,
                f"{label}:{float(d.get('conf', 0)):.2f}",  # ✅ [CHANGE] ใช้ label แทน class_id
                (x1, max(0, y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 0),
                2,
                cv2.LINE_AA,
            )

        cv2.imwrite(result_path, img_anno)

        return {
            "ok": True,
            "filename": file.filename,
            "content_type": file.content_type,
            "saved_path": saved_path,
            "saved_url": f"/uploads/{saved_name}",
            "result_path": result_path,
            "result_url": f"/results/{result_name}",
            "inference_ms": dt_ms,
            **result,
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