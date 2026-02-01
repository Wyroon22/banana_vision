from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from ultralytics import YOLO
from fastapi.staticfiles import StaticFiles
import os, uuid

app = FastAPI(title="BananaVision API")

app.mount("/runs_api", StaticFiles(directory="runs_api"), name="runs_api")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


# โหลดโมเดลครั้งเดียวตอนเริ่มเซิร์ฟเวอร์ (เร็วกว่าโหลดทุก request)
model = YOLO("yolov8n.pt")

UPLOAD_DIR = "uploads"
OUT_DIR = "runs_api"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUT_DIR, exist_ok=True)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    # 1) เซฟไฟล์อัปโหลด
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        ext = ".jpg"  # กันชื่อแปลก ๆ

    fname = f"{uuid.uuid4().hex}{ext}"
    in_path = os.path.join(UPLOAD_DIR, fname)

    content = await file.read()
    with open(in_path, "wb") as f:
        f.write(content)

    # 2) รัน YOLO
    results = model(in_path)
    r0 = results[0]

    # 3) เซฟรูปผลลัพธ์ (กรอบ + label)
    out_name = f"result_{fname}.jpg"
    out_path = os.path.join(OUT_DIR, out_name)
    r0.save(filename=out_path)

    # 4) สร้าง JSON ผลลัพธ์ (boxes + conf + class id)
    detections = []
    if r0.boxes is not None:
        for b in r0.boxes:
            detections.append({
                "cls": int(b.cls[0]),
                "conf": float(b.conf[0]),
                "xyxy": [float(x) for x in b.xyxy[0]]
            })

    return JSONResponse({
        "input_path": in_path,
        "result_path": out_path,
        "detections": detections
    })

# (Option) endpoint สำหรับ “เปิดรูปผลลัพธ์” จากเบราว์เซอร์
@app.get("/result/{filename}")
def get_result(filename: str):
    path = os.path.join(OUT_DIR, filename)
    if not os.path.exists(path):
        return JSONResponse({"error": "file not found"}, status_code=404)
    return FileResponse(path)
