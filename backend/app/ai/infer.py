from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

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
DEFAULT_CLS_MODEL_PATH = BASE_DIR / "models" / "banana_ripeness_cls_4cls.pt"


THAI_LABELS = {
    "green": "ดิบ",
    "breaker": "ห่าม",
    "ripe": "สุก",
    "overripe": "งอม",
}

# สีเป็น BGR เพราะ OpenCV ใช้ BGR
BOX_COLORS = {
    "green": (0, 255, 0),       # เขียว
    "breaker": (0, 200, 255),   # เหลือง/ส้ม
    "ripe": (0, 128, 255),      # ส้มเข้ม
    "overripe": (0, 0, 255),     # แดง
}


# ✅ ปรับตรงนี้ได้ ถ้าแบ่งแถว/หวีผิด
# ค่าน้อยลง = แยกหวีง่ายขึ้น
# ค่ามากขึ้น = รวมเป็นหวีเดียวมากขึ้น
ROW_GAP_RATIO = 0.12
MIN_ROW_GAP_PX = 80


def sort_detections_by_bunch_rows(
    detections: List[Dict[str, Any]],
    image_height: int,
) -> List[Dict[str, Any]]:
    """
    เรียงผลลัพธ์แบบ:
    1. แบ่งเป็นกลุ่ม/แถวตามตำแหน่ง Y
    2. กลุ่มบนมาก่อน
    3. ในแต่ละกลุ่ม เรียงซ้ายไปขวา
    """

    if not detections:
        return detections

    # เรียงจากบนลงล่างก่อน เพื่อหา gap ระหว่างหวี
    dets = sorted(detections, key=lambda d: d["_center_y"])

    box_heights = [
        d["_box_h"]
        for d in dets
        if "_box_h" in d and d["_box_h"] > 0
    ]

    median_box_h = float(np.median(box_heights)) if box_heights else 0

    # ระยะห่าง Y ที่ใช้ตัดว่าเป็นคนละหวี/คนละแถว
    row_gap = max(
        MIN_ROW_GAP_PX,
        image_height * ROW_GAP_RATIO,
        median_box_h * 0.45,
    )

    rows: List[List[Dict[str, Any]]] = []
    current_row: List[Dict[str, Any]] = [dets[0]]
    prev_y = dets[0]["_center_y"]

    for d in dets[1:]:
        cy = d["_center_y"]

        # ถ้าห่างจากตัวก่อนหน้าเยอะมาก ถือว่าเริ่มหวี/แถวใหม่
        if abs(cy - prev_y) > row_gap:
            rows.append(current_row)
            current_row = [d]
        else:
            current_row.append(d)

        prev_y = cy

    rows.append(current_row)

    # เรียงกลุ่มจากบนลงล่าง
    rows.sort(
        key=lambda row: float(np.mean([d["_center_y"] for d in row]))
    )

    ordered: List[Dict[str, Any]] = []

    # ในแต่ละหวี/แถว เรียงซ้ายไปขวา
    for row in rows:
        row.sort(key=lambda d: d["_center_x"])
        ordered.extend(row)

    return ordered


class YOLOService:
    def __init__(
        self,
        model_path: Optional[str] = None,
        cls_model_path: Optional[str] = None,
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
        4. Sort by bunch row:
            - upper bunch left to right
            - lower bunch left to right
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

                center_x = float((x1_i + x2_i) / 2)
                center_y = float((y1_i + y2_i) / 2)
                box_h = float(y2_i - y1_i)

                detections.append({
                    # index จะ re-index ใหม่หลัง sort
                    "index": i,

                    # field ภายใน ใช้ sort
                    "_center_x": center_x,
                    "_center_y": center_y,
                    "_box_h": box_h,

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

        # ✅ เรียงแบบ หวีบนซ้าย→ขวา แล้วหวีล่างซ้าย→ขวา
        detections = sort_detections_by_bunch_rows(detections, image_height=h)

        # ✅ re-index ใหม่หลังเรียงแล้ว
        for new_index, d in enumerate(detections, start=1):
            d["index"] = new_index

        # ✅ รอบสอง: วาดกรอบหลัง sort แล้ว
        # เลขบนภาพจะตรงกับรายละเอียดรายลูกใน UI
        for d in detections:
            x1_i, y1_i, x2_i, y2_i = map(int, d["bbox_xyxy"])

            ripeness = d["ripeness"]
            ripeness_conf = float(d["ripeness_conf"])
            color = BOX_COLORS.get(ripeness, (0, 255, 0))

            # ใช้ภาษาอังกฤษ กัน OpenCV แสดง ???? กับภาษาไทย
            label = f'{d["index"]}. {ripeness.upper()} {ripeness_conf:.2f}'

            cv2.rectangle(
                annotated,
                (x1_i, y1_i),
                (x2_i, y2_i),
                color,
                2,
            )

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
            d.pop("_center_y", None)
            d.pop("_box_h", None)

        summary = {
            "green": sum(1 for d in detections if d["ripeness"] == "green"),
            "breaker": sum(1 for d in detections if d["ripeness"] == "breaker"),
            "ripe": sum(1 for d in detections if d["ripeness"] == "ripe"),
            "overripe": sum(1 for d in detections if d["ripeness"] == "overripe"),
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