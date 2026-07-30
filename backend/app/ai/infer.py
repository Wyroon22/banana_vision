from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from ultralytics import YOLO


# infer.py อยู่ที่ backend/app/ai/infer.py
# parents[2] = backend/
BASE_DIR = Path(__file__).resolve().parents[2]

DEFAULT_MODEL_PATH = (
    BASE_DIR
    / "models"
    / "banana_seg_4cls_v1_best.pt"
)


THAI_LABELS = {
    "green": "ดิบ",
    "breaker": "ห่าม",
    "ripe": "สุก",
    "overripe": "งอม",
}


# สี BGR สำหรับ OpenCV
MASK_COLORS = {
    "green": (34, 197, 94),
    "breaker": (0, 165, 255),
    "ripe": (0, 215, 255),
    "overripe": (48, 48, 220),
}


# การทำนาย
MIN_CONFIDENCE = 0.45
NMS_IOU_THRESHOLD = 0.35
MAX_DETECTIONS = 30
MODEL_IMAGE_SIZE = 640

# กรอง Mask ที่เล็กผิดปกติ
MIN_MASK_AREA_RATIO = 0.0005
MASK_THRESHOLD = 0.50

# ลดจำนวนจุด Polygon แต่ยังคงรูปร่าง
CONTOUR_EPSILON_RATIO = 0.002

# การแสดง Label
LABEL_FONT_SCALE = 0.46
LABEL_FONT_THICKNESS = 1
LABEL_PADDING_X = 5
LABEL_PADDING_Y = 4
LABEL_ANCHOR_GAP = 7
LABEL_COLLISION_GAP = 4
LABEL_SEARCH_ATTEMPTS = 12


def get_class_name(
    names: Any,
    class_id: int,
) -> str:
    """
    รองรับ result.names ทั้งแบบ dict และ list
    """
    if isinstance(names, dict):
        value = names.get(
            class_id,
            str(class_id),
        )

    elif isinstance(names, (list, tuple)):
        if 0 <= class_id < len(names):
            value = names[class_id]
        else:
            value = str(class_id)

    else:
        value = str(class_id)

    return str(value).strip().lower()


def normalize_polygon(
    polygon: np.ndarray,
    width: int,
    height: int,
) -> List[List[float]]:
    """
    แปลง Polygon จาก Pixel เป็นช่วง 0-1
    """
    normalized: List[List[float]] = []

    for point in polygon:
        x = float(point[0])
        y = float(point[1])

        normalized.append(
            [
                round(
                    x / max(width, 1),
                    6,
                ),
                round(
                    y / max(height, 1),
                    6,
                ),
            ]
        )

    return normalized


def extract_largest_contour(
    raw_mask: np.ndarray,
    width: int,
    height: int,
) -> Optional[np.ndarray]:
    """
    แปลง Mask ของ YOLO เป็น Polygon หลักหนึ่งเส้น

    ช่วยลดปัญหา:
    - เส้น Polygon ไขว้
    - เศษ Mask ภายใน
    - เส้นเชื่อมข้ามพื้นที่
    """
    if raw_mask is None or raw_mask.size == 0:
        return None

    # retina_masks=True มักได้ Mask ขนาดใกล้ภาพจริง
    # แต่ Resize ซ้ำเพื่อรับประกันว่าตรงกับภาพต้นฉบับ
    resized_mask = cv2.resize(
        raw_mask,
        (width, height),
        interpolation=cv2.INTER_LINEAR,
    )

    binary_mask = (
        resized_mask >= MASK_THRESHOLD
    ).astype(np.uint8) * 255

    contours, _ = cv2.findContours(
        binary_mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    if not contours:
        return None

    valid_contours = [
        contour
        for contour in contours
        if contour is not None
        and len(contour) >= 3
    ]

    if not valid_contours:
        return None

    largest_contour = max(
        valid_contours,
        key=cv2.contourArea,
    )

    contour_area = float(
        cv2.contourArea(
            largest_contour
        )
    )

    minimum_area = (
        width
        * height
        * MIN_MASK_AREA_RATIO
    )

    if contour_area < minimum_area:
        return None

    perimeter = float(
        cv2.arcLength(
            largest_contour,
            True,
        )
    )

    epsilon = max(
        1.0,
        perimeter
        * CONTOUR_EPSILON_RATIO,
    )

    simplified_contour = cv2.approxPolyDP(
        largest_contour,
        epsilon,
        True,
    )

    if (
        simplified_contour is None
        or len(simplified_contour) < 3
    ):
        simplified_contour = largest_contour

    polygon = (
        simplified_contour
        .reshape(-1, 2)
        .astype(np.float32)
    )

    if len(polygon) < 3:
        return None

    return polygon


def get_polygon_geometry(
    polygon: List[List[float]],
    bbox: List[float],
) -> Dict[str, float]:
    """
    คืนค่าตำแหน่งสำคัญของกล้วยแต่ละลูก

    sort_x:
        ใช้เรียงจากซ้ายไปขวา

    sort_y:
        ใช้เป็นตัวตัดสินรอง หากแกน X ใกล้กัน

    anchor_x, anchor_y:
        จุดสำหรับเชื่อม Label กับหัวกล้วย
    """
    if len(polygon) >= 3:
        points = np.asarray(
            polygon,
            dtype=np.float32,
        )

        min_x = float(
            np.min(points[:, 0])
        )
        max_x = float(
            np.max(points[:, 0])
        )
        min_y = float(
            np.min(points[:, 1])
        )
        max_y = float(
            np.max(points[:, 1])
        )

        polygon_width = max(
            max_x - min_x,
            1.0,
        )
        polygon_height = max(
            max_y - min_y,
            1.0,
        )

        # ใช้จุดกึ่งกลางของขอบเขต Polygon
        # เสถียรกว่าค่าเฉลี่ยจุดเมื่อจำนวนจุดแต่ละด้านไม่เท่ากัน
        sort_x = float(
            (min_x + max_x) / 2
        )
        sort_y = float(
            (min_y + max_y) / 2
        )

        # เลือกกลุ่มจุดส่วนบนสุดประมาณ 18%
        top_band_height = max(
            10.0,
            polygon_height * 0.18,
        )

        top_points = points[
            points[:, 1]
            <= min_y + top_band_height
        ]

        if len(top_points) > 0:
            anchor_x = float(
                np.median(
                    top_points[:, 0]
                )
            )

            anchor_y = float(
                np.min(
                    top_points[:, 1]
                )
            )
        else:
            anchor_x = sort_x
            anchor_y = min_y

        return {
            "sort_x": sort_x,
            "sort_y": sort_y,
            "anchor_x": anchor_x,
            "anchor_y": anchor_y,
            "polygon_width": polygon_width,
            "polygon_height": polygon_height,
        }

    x1, y1, x2, y2 = bbox

    return {
        "sort_x": float(
            (x1 + x2) / 2
        ),
        "sort_y": float(
            (y1 + y2) / 2
        ),
        "anchor_x": float(
            (x1 + x2) / 2
        ),
        "anchor_y": float(y1),
        "polygon_width": float(
            max(x2 - x1, 1)
        ),
        "polygon_height": float(
            max(y2 - y1, 1)
        ),
    }


def sort_detections_left_to_right(
    detections: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    เรียงหมายเลขกล้วยจากซ้ายไปขวา

    หากตำแหน่ง X ใกล้กัน จะใช้ตำแหน่ง Y เป็นตัวเรียงรอง
    """
    return sorted(
        detections,
        key=lambda item: (
            float(
                item.get(
                    "_sort_x",
                    0.0,
                )
            ),
            float(
                item.get(
                    "_sort_y",
                    0.0,
                )
            ),
        ),
    )


def rectangles_overlap(
    first: tuple[int, int, int, int],
    second: tuple[int, int, int, int],
) -> bool:
    """
    ตรวจว่ากล่อง Label สองกล่องซ้อนกันหรือไม่
    """
    first_x1, first_y1, first_x2, first_y2 = first
    second_x1, second_y1, second_x2, second_y2 = second

    return not (
        first_x2 + LABEL_COLLISION_GAP
        <= second_x1
        or first_x1
        >= second_x2 + LABEL_COLLISION_GAP
        or first_y2 + LABEL_COLLISION_GAP
        <= second_y1
        or first_y1
        >= second_y2 + LABEL_COLLISION_GAP
    )


def clamp_rectangle(
    rectangle: tuple[int, int, int, int],
    image_width: int,
    image_height: int,
) -> tuple[int, int, int, int]:
    """
    บังคับกล่องให้อยู่ภายในภาพ
    """
    x1, y1, x2, y2 = rectangle

    box_width = max(
        x2 - x1,
        1,
    )
    box_height = max(
        y2 - y1,
        1,
    )

    x1 = max(
        0,
        min(
            x1,
            max(
                image_width
                - box_width,
                0,
            ),
        ),
    )

    y1 = max(
        0,
        min(
            y1,
            max(
                image_height
                - box_height,
                0,
            ),
        ),
    )

    return (
        x1,
        y1,
        x1 + box_width,
        y1 + box_height,
    )


def find_label_rectangle(
    *,
    anchor_x: int,
    anchor_y: int,
    text_width: int,
    text_height: int,
    baseline: int,
    image_width: int,
    image_height: int,
    occupied_rectangles: List[
        tuple[int, int, int, int]
    ],
) -> tuple[int, int, int, int]:
    """
    หาตำแหน่ง Label ที่สัมพันธ์กับกล้วยลูกนั้น

    ลำดับการค้นหา:
    1. เหนือหัวกล้วย
    2. ขยับสูงขึ้นเพื่อหลบ Label ก่อนหน้า
    3. ขยับซ้ายหรือขวา
    4. วางใต้ Anchor เป็นทางเลือกสุดท้าย
    """
    box_width = (
        text_width
        + LABEL_PADDING_X * 2
    )

    box_height = (
        text_height
        + baseline
        + LABEL_PADDING_Y * 2
    )

    center_x = int(
        np.clip(
            anchor_x,
            0,
            max(
                image_width - 1,
                0,
            ),
        )
    )

    first_x1 = (
        center_x
        - box_width // 2
    )

    first_y1 = (
        anchor_y
        - LABEL_ANCHOR_GAP
        - box_height
    )

    candidates: List[
        tuple[int, int, int, int]
    ] = []

    # ลองวางเหนือ Anchor และขยับขึ้นเรื่อย ๆ
    for level in range(
        LABEL_SEARCH_ATTEMPTS
    ):
        candidate_y1 = (
            first_y1
            - level
            * (
                box_height
                + LABEL_COLLISION_GAP
            )
        )

        candidates.append(
            (
                first_x1,
                candidate_y1,
                first_x1 + box_width,
                candidate_y1 + box_height,
            )
        )

    # ลองเยื้องซ้ายและขวา
    horizontal_offset = max(
        box_width // 2,
        12,
    )

    for direction in (-1, 1):
        shifted_x1 = (
            first_x1
            + direction
            * horizontal_offset
        )

        for level in range(4):
            shifted_y1 = (
                first_y1
                - level
                * (
                    box_height
                    + LABEL_COLLISION_GAP
                )
            )

            candidates.append(
                (
                    shifted_x1,
                    shifted_y1,
                    shifted_x1 + box_width,
                    shifted_y1 + box_height,
                )
            )

    # ลองใต้ Anchor
    below_y1 = (
        anchor_y
        + LABEL_ANCHOR_GAP
    )

    candidates.append(
        (
            first_x1,
            below_y1,
            first_x1 + box_width,
            below_y1 + box_height,
        )
    )

    for candidate in candidates:
        candidate = clamp_rectangle(
            candidate,
            image_width,
            image_height,
        )

        collision = any(
            rectangles_overlap(
                candidate,
                occupied,
            )
            for occupied
            in occupied_rectangles
        )

        if not collision:
            return candidate

    # กรณีพื้นที่แคบมาก ยอมให้ใกล้กัน
    return clamp_rectangle(
        (
            first_x1,
            first_y1,
            first_x1 + box_width,
            first_y1 + box_height,
        ),
        image_width,
        image_height,
    )


def get_line_start_point(
    label_rect: tuple[int, int, int, int],
    anchor_x: int,
    anchor_y: int,
) -> tuple[int, int]:
    """
    เลือกจุดเริ่มเส้นชี้บนขอบ Label ที่ใกล้ Anchor ที่สุด
    """
    x1, y1, x2, y2 = label_rect

    center_x = int(
        (x1 + x2) / 2
    )
    center_y = int(
        (y1 + y2) / 2
    )

    if anchor_y >= y2:
        return center_x, y2

    if anchor_y <= y1:
        return center_x, y1

    if anchor_x < x1:
        return x1, center_y

    return x2, center_y


class YOLOService:
    """
    YOLO Instance Segmentation 4 คลาส

    ขั้นตอน:
    1. ทำนาย Mask และคลาสความสุก
    2. แปลง Mask เป็น Contour หลัก
    3. เรียงกล้วยจากซ้ายไปขวา
    4. กำหนด index และ banana_index
    5. วาด Polygon พร้อม Label เฉพาะลูก
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
    ) -> None:
        resolved_path = (
            Path(model_path)
            if model_path
            else DEFAULT_MODEL_PATH
        )

        if not resolved_path.is_absolute():
            resolved_path = (
                BASE_DIR
                / resolved_path
            )

        resolved_path = (
            resolved_path.resolve()
        )

        if not resolved_path.exists():
            raise FileNotFoundError(
                "Segmentation model not found: "
                f"{resolved_path}"
            )

        self.model_path = resolved_path

        print(
            "[YOLOService] "
            "Loading segmentation model:",
            self.model_path,
        )

        self.model = YOLO(
            str(self.model_path)
        )

        print(
            "[YOLOService] Model task:",
            self.model.task,
        )

        print(
            "[YOLOService] Model names:",
            self.model.names,
        )

        if self.model.task != "segment":
            raise RuntimeError(
                "โมเดลนี้ไม่ใช่ "
                "Segmentation Model "
                f"(task={self.model.task})"
            )

    def predict(
        self,
        image_bgr: np.ndarray,
        conf: float = MIN_CONFIDENCE,
    ) -> Dict[str, Any]:
        if (
            image_bgr is None
            or image_bgr.size == 0
        ):
            raise ValueError(
                "Input image is empty"
            )

        height, width = (
            image_bgr.shape[:2]
        )

        actual_confidence = max(
            float(conf),
            MIN_CONFIDENCE,
        )

        results = self.model.predict(
            source=image_bgr,
            imgsz=MODEL_IMAGE_SIZE,
            conf=actual_confidence,
            iou=NMS_IOU_THRESHOLD,

            # กรองผลซ้ำข้ามคลาส
            agnostic_nms=True,

            max_det=MAX_DETECTIONS,

            # ให้ Mask มีความละเอียดสัมพันธ์กับภาพต้นฉบับ
            retina_masks=True,

            verbose=False,
        )

        if not results:
            return self._empty_result(
                image_bgr=image_bgr,
                width=width,
                height=height,
                confidence_threshold=(
                    actual_confidence
                ),
            )

        result = results[0]

        detections: List[
            Dict[str, Any]
        ] = []

        boxes = result.boxes
        masks = result.masks

        if (
            boxes is not None
            and len(boxes) > 0
            and masks is not None
        ):
            xyxy_array = (
                boxes.xyxy
                .detach()
                .cpu()
                .numpy()
            )

            confidence_array = (
                boxes.conf
                .detach()
                .cpu()
                .numpy()
            )

            class_id_array = (
                boxes.cls
                .detach()
                .cpu()
                .numpy()
            )

            mask_data = (
                masks.data
                .detach()
                .cpu()
                .numpy()
            )

            available_count = min(
                len(xyxy_array),
                len(confidence_array),
                len(class_id_array),
                len(mask_data),
            )

            for detection_index in range(
                available_count
            ):
                bbox = (
                    xyxy_array[
                        detection_index
                    ]
                )

                score = float(
                    confidence_array[
                        detection_index
                    ]
                )

                class_id = int(
                    class_id_array[
                        detection_index
                    ]
                )

                class_name = get_class_name(
                    result.names,
                    class_id,
                )

                if class_name not in THAI_LABELS:
                    continue

                x1, y1, x2, y2 = bbox

                x1_i = max(
                    0,
                    min(
                        width - 1,
                        int(round(x1)),
                    ),
                )

                y1_i = max(
                    0,
                    min(
                        height - 1,
                        int(round(y1)),
                    ),
                )

                x2_i = max(
                    0,
                    min(
                        width,
                        int(round(x2)),
                    ),
                )

                y2_i = max(
                    0,
                    min(
                        height,
                        int(round(y2)),
                    ),
                )

                if (
                    x2_i <= x1_i
                    or y2_i <= y1_i
                ):
                    continue

                raw_mask = (
                    mask_data[
                        detection_index
                    ]
                )

                polygon_array = (
                    extract_largest_contour(
                        raw_mask=raw_mask,
                        width=width,
                        height=height,
                    )
                )

                # ไม่เก็บ Detection ที่ไม่มี Mask ใช้งานได้
                # เพื่อให้จำนวน Label ตรงกับจำนวน Polygon จริง
                if polygon_array is None:
                    continue

                polygon_px = [
                    [
                        round(
                            float(point[0]),
                            2,
                        ),
                        round(
                            float(point[1]),
                            2,
                        ),
                    ]
                    for point in polygon_array
                ]

                polygon_normalized = (
                    normalize_polygon(
                        polygon=polygon_array,
                        width=width,
                        height=height,
                    )
                )

                bbox_xyxy = [
                    float(x1_i),
                    float(y1_i),
                    float(x2_i),
                    float(y2_i),
                ]

                geometry = (
                    get_polygon_geometry(
                        polygon=polygon_px,
                        bbox=bbox_xyxy,
                    )
                )

                detections.append(
                    {
                        "index": 0,
                        "banana_index": 0,

                        # ใช้ภายใน
                        "_sort_x":
                            geometry[
                                "sort_x"
                            ],
                        "_sort_y":
                            geometry[
                                "sort_y"
                            ],
                        "_anchor_x":
                            geometry[
                                "anchor_x"
                            ],
                        "_anchor_y":
                            geometry[
                                "anchor_y"
                            ],

                        # Schema เดิม
                        "class_id":
                            class_id,
                        "class_name":
                            class_name,
                        "conf":
                            round(
                                score,
                                4,
                            ),
                        "det_conf":
                            round(
                                score,
                                4,
                            ),
                        "bbox_xyxy":
                            bbox_xyxy,
                        "ripeness":
                            class_name,
                        "ripeness_th":
                            THAI_LABELS[
                                class_name
                            ],
                        "ripeness_conf":
                            round(
                                score,
                                4,
                            ),

                        # Schema Segmentation
                        "polygon":
                            polygon_px,
                        "polygon_normalized":
                            polygon_normalized,
                        "has_mask":
                            True,
                    }
                )

        detections = (
            sort_detections_left_to_right(
                detections
            )
        )

        annotated = (
            image_bgr.copy()
        )

        occupied_label_rectangles: List[
            tuple[int, int, int, int]
        ] = []

        for banana_index, detection in enumerate(
            detections,
            start=1,
        ):
            # เลขบนภาพและเลขในฐานข้อมูลต้องตรงกัน
            detection["index"] = (
                banana_index
            )

            detection["banana_index"] = (
                banana_index
            )

            polygon = detection[
                "polygon"
            ]

            ripeness = str(
                detection[
                    "ripeness"
                ]
            )

            confidence = float(
                detection[
                    "ripeness_conf"
                ]
            )

            color = MASK_COLORS.get(
                ripeness,
                (255, 255, 255),
            )

            anchor_x = int(
                round(
                    float(
                        detection[
                            "_anchor_x"
                        ]
                    )
                )
            )

            anchor_y = int(
                round(
                    float(
                        detection[
                            "_anchor_y"
                        ]
                    )
                )
            )

            anchor_x = max(
                0,
                min(
                    width - 1,
                    anchor_x,
                ),
            )

            anchor_y = max(
                0,
                min(
                    height - 1,
                    anchor_y,
                ),
            )

            contour = np.asarray(
                polygon,
                dtype=np.int32,
            ).reshape(
                (-1, 1, 2)
            )

            # เส้นดำด้านนอก
            cv2.polylines(
                annotated,
                [contour],
                isClosed=True,
                color=(20, 20, 20),
                thickness=4,
                lineType=cv2.LINE_AA,
            )

            # เส้นสีตามระดับความสุก
            cv2.polylines(
                annotated,
                [contour],
                isClosed=True,
                color=color,
                thickness=2,
                lineType=cv2.LINE_AA,
            )

            label = (
                f"{banana_index}. "
                f"{ripeness.upper()} "
                f"{confidence:.2f}"
            )

            (
                text_width,
                text_height,
            ), baseline = cv2.getTextSize(
                label,
                cv2.FONT_HERSHEY_SIMPLEX,
                LABEL_FONT_SCALE,
                LABEL_FONT_THICKNESS,
            )

            label_rect = (
                find_label_rectangle(
                    anchor_x=anchor_x,
                    anchor_y=anchor_y,
                    text_width=text_width,
                    text_height=text_height,
                    baseline=baseline,
                    image_width=width,
                    image_height=height,
                    occupied_rectangles=(
                        occupied_label_rectangles
                    ),
                )
            )

            (
                label_x1,
                label_y1,
                label_x2,
                label_y2,
            ) = label_rect

            occupied_label_rectangles.append(
                label_rect
            )

            (
                line_start_x,
                line_start_y,
            ) = get_line_start_point(
                label_rect,
                anchor_x,
                anchor_y,
            )

            # เส้นชี้จาก Label ไปยัง Polygon ลูกนั้น
            cv2.line(
                annotated,
                (
                    line_start_x,
                    line_start_y,
                ),
                (
                    anchor_x,
                    anchor_y,
                ),
                (20, 20, 20),
                thickness=3,
                lineType=cv2.LINE_AA,
            )

            cv2.line(
                annotated,
                (
                    line_start_x,
                    line_start_y,
                ),
                (
                    anchor_x,
                    anchor_y,
                ),
                color,
                thickness=1,
                lineType=cv2.LINE_AA,
            )

            cv2.circle(
                annotated,
                (
                    anchor_x,
                    anchor_y,
                ),
                radius=4,
                color=(20, 20, 20),
                thickness=-1,
                lineType=cv2.LINE_AA,
            )

            cv2.circle(
                annotated,
                (
                    anchor_x,
                    anchor_y,
                ),
                radius=2,
                color=color,
                thickness=-1,
                lineType=cv2.LINE_AA,
            )

            # กรอบดำด้านนอก
            cv2.rectangle(
                annotated,
                (
                    label_x1 - 1,
                    label_y1 - 1,
                ),
                (
                    label_x2 + 1,
                    label_y2 + 1,
                ),
                (20, 20, 20),
                thickness=-1,
            )

            # พื้นหลังสีของ Label
            cv2.rectangle(
                annotated,
                (
                    label_x1,
                    label_y1,
                ),
                (
                    label_x2,
                    label_y2,
                ),
                color,
                thickness=-1,
            )

            text_x = (
                label_x1
                + LABEL_PADDING_X
            )

            text_y = (
                label_y1
                + LABEL_PADDING_Y
                + text_height
            )

            cv2.putText(
                annotated,
                label,
                (
                    text_x,
                    text_y,
                ),
                cv2.FONT_HERSHEY_SIMPLEX,
                LABEL_FONT_SCALE,
                (255, 255, 255),
                LABEL_FONT_THICKNESS,
                cv2.LINE_AA,
            )

        # ลบข้อมูลที่ใช้เฉพาะภายใน
        for detection in detections:
            detection.pop(
                "_sort_x",
                None,
            )
            detection.pop(
                "_sort_y",
                None,
            )
            detection.pop(
                "_anchor_x",
                None,
            )
            detection.pop(
                "_anchor_y",
                None,
            )

        summary = {
            "green": sum(
                1
                for detection in detections
                if detection["ripeness"]
                == "green"
            ),
            "breaker": sum(
                1
                for detection in detections
                if detection["ripeness"]
                == "breaker"
            ),
            "ripe": sum(
                1
                for detection in detections
                if detection["ripeness"]
                == "ripe"
            ),
            "overripe": sum(
                1
                for detection in detections
                if detection["ripeness"]
                == "overripe"
            ),
        }

        summary["total"] = len(
            detections
        )

        return {
            "image_width":
                int(width),
            "image_height":
                int(height),
            "total_detections":
                len(detections),
            "count":
                len(detections),
            "summary":
                summary,
            "detections":
                detections,
            "annotated_image":
                annotated,
            "model_type":
                "yolo_segmentation_4cls",
            "model_task":
                "segment",
            "model_path":
                str(self.model_path),
            "confidence_threshold":
                actual_confidence,
            "nms_iou_threshold":
                NMS_IOU_THRESHOLD,
            "ordering":
                "left_to_right",
        }

    def _empty_result(
        self,
        image_bgr: np.ndarray,
        width: int,
        height: int,
        confidence_threshold: float = (
            MIN_CONFIDENCE
        ),
    ) -> Dict[str, Any]:
        return {
            "image_width":
                int(width),
            "image_height":
                int(height),
            "total_detections":
                0,
            "count":
                0,
            "summary": {
                "green": 0,
                "breaker": 0,
                "ripe": 0,
                "overripe": 0,
                "total": 0,
            },
            "detections":
                [],
            "annotated_image":
                image_bgr.copy(),
            "model_type":
                "yolo_segmentation_4cls",
            "model_task":
                "segment",
            "model_path":
                str(self.model_path),
            "confidence_threshold":
                confidence_threshold,
            "nms_iou_threshold":
                NMS_IOU_THRESHOLD,
            "ordering":
                "left_to_right",
        }