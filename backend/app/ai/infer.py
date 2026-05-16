from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import cv2
import numpy as np
from ultralytics import YOLO


@dataclass
class Detection:
    cls: int
    conf: float
    bbox_xyxy: List[float]  # [x1, y1, x2, y2]


# infer.py อยู่ที่ backend/app/ai/infer.py
# parents[2] = backend/
BASE_DIR = Path(__file__).resolve().parents[2]

DEFAULT_DETECT_MODEL_PATH = BASE_DIR / "models" / "banana_finger_detect.pt"
DEFAULT_CLS_MODEL_PATH = BASE_DIR / "models" / "banana_ripeness_cls.pt"


THAI_LABELS = {
    "green": "ดิบ",
    "breaker": "ห่าม",
    "ripe": "สุก",
}

# สีเป็น BGR เพราะ OpenCV ใช้ BGR
BOX_COLORS = {
    "green": (0, 255, 0),       # เขียว
    "breaker": (0, 200, 255),   # เหลือง/ส้ม
    "ripe": (0, 128, 255),      # ส้มเข้ม
}


class YOLOService:
    def __init__(
        self,
        model_path: str | None = None,
        cls_model_path: str | None = None,
    ):
        """
        model_path = Model 1 Detection
        cls_model_path = Model 2 Classification
        """

        detect_path = model_path or str(DEFAULT_DETECT_MODEL_PATH)
        cls_path = cls_model_path or str(DEFAULT_CLS_MODEL_PATH)

        print(f"[YOLOService] Loading detection model: {detect_path}")
        self.detect_model = YOLO(detect_path)

        print(f"[YOLOService] Loading classification model: {cls_path}")
        self.cls_model = YOLO(cls_path)

    def predict(self, image_bgr: np.ndarray, conf: float = 0.25) -> Dict[str, Any]:
        """
        Pipeline:
        1. Detect banana fingers from bunch image
        2. Crop each detected banana finger
        3. Classify ripeness per crop
        4. Sort detections from left to right
        5. Return JSON-friendly dict + annotated image
        """

        h, w = image_bgr.shape[:2]

        results = self.detect_model.predict(
            source=image_bgr,
            conf=conf,
            verbose=False,
        )

        r = results[0]
        detections: List[Dict[str, Any]] = []

        annotated = image_bgr.copy()

        if r.boxes is not None and len(r.boxes) > 0:
            boxes = r.boxes.xyxy.cpu().numpy()
            confs = r.boxes.conf.cpu().numpy()
            clss = r.boxes.cls.cpu().numpy()

            # ✅ รอบแรก: detect + classify + เก็บข้อมูลก่อน ยังไม่วาดกรอบ
            for i, ((x1, y1, x2, y2), det_conf, cls_id_raw) in enumerate(
                zip(boxes, confs, clss),
                start=1,
            ):
                cls_id = int(cls_id_raw)
                class_name = self.detect_model.names.get(cls_id, str(cls_id))

                # กัน bbox หลุดขอบภาพ
                x1_i = max(0, int(x1))
                y1_i = max(0, int(y1))
                x2_i = min(w, int(x2))
                y2_i = min(h, int(y2))

                crop = image_bgr[y1_i:y2_i, x1_i:x2_i]

                if crop.size == 0:
                    continue

                # Model 2 classify ความสุกจาก crop รายลูก
                cls_result = self.cls_model.predict(
                    source=crop,
                    imgsz=224,
                    verbose=False,
                )[0]

                probs = cls_result.probs
                top1_idx = int(probs.top1)
                ripeness = cls_result.names[top1_idx]
                ripeness_conf = float(probs.top1conf)

                ripeness_th = THAI_LABELS.get(ripeness, ripeness)

                detections.append({
                    # index เดี๋ยวจะ re-index ใหม่หลัง sort
                    "index": i,

                    # ใช้สำหรับ sort ซ้ายไปขวา
                    "_center_x": float((x1_i + x2_i) / 2),

                    # ข้อมูลจาก Model 1
                    "class_id": cls_id,
                    "class_name": class_name,
                    "conf": float(det_conf),
                    "det_conf": round(float(det_conf), 4),
                    "bbox_xyxy": [
                        float(x1_i),
                        float(y1_i),
                        float(x2_i),
                        float(y2_i),
                    ],

                    # ข้อมูลจาก Model 2
                    "ripeness": ripeness,
                    "ripeness_th": ripeness_th,
                    "ripeness_conf": round(ripeness_conf, 4),
                })

        # ✅ เรียงจากซ้ายไปขวา ตามแกน X กลางของ bbox
        detections.sort(key=lambda d: d["_center_x"])

        # ✅ re-index ใหม่หลังเรียงแล้ว
        for new_index, d in enumerate(detections, start=1):
            d["index"] = new_index

        # ✅ รอบสอง: วาดกรอบหลัง sort แล้ว เพื่อให้เลขบนภาพตรงกับรายละเอียดรายลูก
        for d in detections:
            x1_i, y1_i, x2_i, y2_i = map(int, d["bbox_xyxy"])

            ripeness = d["ripeness"]
            ripeness_conf = float(d["ripeness_conf"])
            color = BOX_COLORS.get(ripeness, (0, 255, 0))

            # label ภาษาอังกฤษ เพื่อกัน OpenCV ขึ้น ???? กับภาษาไทย
            label = f'{d["index"]}. {ripeness.upper()} {ripeness_conf:.2f}'

            # วาดกรอบ
            cv2.rectangle(
                annotated,
                (x1_i, y1_i),
                (x2_i, y2_i),
                color,
                2,
            )

            # ตำแหน่งข้อความ
            text_x = x1_i
            text_y = max(25, y1_i - 8)

            cv2.putText(
                annotated,
                label,
                (text_x, text_y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                color,
                2,
                cv2.LINE_AA,
            )

        # ✅ ลบ field ภายในออกก่อนส่ง JSON กลับไป
        for d in detections:
            d.pop("_center_x", None)

        summary = {
            "green": sum(1 for d in detections if d["ripeness"] == "green"),
            "breaker": sum(1 for d in detections if d["ripeness"] == "breaker"),
            "ripe": sum(1 for d in detections if d["ripeness"] == "ripe"),
        }

        return {
            "image_width": int(w),
            "image_height": int(h),

            # compatible กับของเดิม
            "total_detections": len(detections),
            "detections": detections,

            # ของใหม่สำหรับ UI
            "count": len(detections),
            "summary": summary,

            # main.py จะเอาตัวนี้ไป cv2.imwrite เป็นรูปผลลัพธ์
            "annotated_image": annotated,
        }
