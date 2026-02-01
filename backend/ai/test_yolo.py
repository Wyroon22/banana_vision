from ultralytics import YOLO
import cv2
import os

model = YOLO("yolov8n.pt")

img_path = "test_images/bunch.jpg"
img = cv2.imread(img_path)
assert img is not None, "อ่านรูปไม่เจอ: ตรวจชื่อไฟล์/พาธ test_images/bunch.jpg"

results = model(img)
annotated = results[0].plot()

os.makedirs("runs", exist_ok=True)
out_path = "runs/yolo_result.jpg"
cv2.imwrite(out_path, annotated)

print("Saved:", out_path)
