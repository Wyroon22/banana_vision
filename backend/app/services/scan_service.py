from __future__ import annotations

import mimetypes
import os
import uuid
from pathlib import Path
from typing import Any

import numpy as np

from app.supabase_client import supabase


ORIGINALS_BUCKET = os.getenv(
    "SUPABASE_BUCKET_ORIGINALS",
    "scan-originals",
)

RESULTS_BUCKET = os.getenv(
    "SUPABASE_BUCKET_RESULTS",
    "scan-results",
)


THAI_LABELS = {
    "green": "ดิบ",
    "breaker": "ห่าม",
    "ripe": "สุก",
    "overripe": "งอม",
}


LABEL_ALIASES = {
    "green": "green",
    "ดิบ": "green",

    "breaker": "breaker",
    "ห่าม": "breaker",

    "ripe": "ripe",
    "สุก": "ripe",

    "overripe": "overripe",
    "over-ripe": "overripe",
    "over ripe": "overripe",
    "งอม": "overripe",
}


def to_json_safe(value: Any) -> Any:
    """
    แปลงค่าจาก NumPy และชนิดข้อมูลพิเศษ
    ให้เป็นข้อมูลที่ส่งเข้า Supabase ได้
    """
    if value is None:
        return None

    if isinstance(value, np.generic):
        return value.item()

    if isinstance(value, np.ndarray):
        return value.tolist()

    if isinstance(value, Path):
        return str(value)

    if isinstance(value, dict):
        return {
            str(key): to_json_safe(item)
            for key, item in value.items()
        }

    if isinstance(value, (list, tuple, set)):
        return [
            to_json_safe(item)
            for item in value
        ]

    return value


def clean_optional_text(
    value: Any,
) -> str | None:
    """
    แปลงเป็นข้อความและตัดช่องว่าง

    ถ้าค่าว่างจะคืน None
    """
    if value is None:
        return None

    text = str(value).strip()

    return text or None


def pick_first_value(
    item: dict[str, Any],
    keys: tuple[str, ...],
) -> Any:
    """
    คืนค่าตัวแรกที่ไม่ใช่ None หรือข้อความว่าง

    ไม่ใช้ `or` เพราะเลข 0 อาจถูกมองเป็น False
    """
    for key in keys:
        value = item.get(key)

        if value is not None and value != "":
            return value

    return None


def get_banana_index(
    item: dict[str, Any],
    fallback: int,
) -> int:
    """
    อ่านหมายเลขกล้วยจาก infer.py

    infer.py ตัวล่าสุดส่งทั้ง:
    - banana_index
    - index

    ถ้าไม่มีจึงใช้ fallback
    """
    for key in (
        "banana_index",
        "index",
        "detection_index",
        "banana_no",
        "banana_number",
    ):
        value = item.get(key)

        if value is None or value == "":
            continue

        try:
            banana_index = int(value)

            if banana_index > 0:
                return banana_index

        except (TypeError, ValueError):
            continue

    return fallback


def normalize_label(
    value: Any,
) -> str | None:
    """
    แปลงชื่อระดับความสุกให้เป็นชื่อคลาสมาตรฐาน
    """
    if value is None:
        return None

    text = str(value).strip().lower()

    normalized = LABEL_ALIASES.get(text)

    if normalized not in THAI_LABELS:
        return None

    return normalized


def normalize_confidence(
    value: Any,
) -> float | None:
    """
    แปลง Confidence ให้เป็น Python float
    """
    if value is None or value == "":
        return None

    try:
        confidence = float(
            to_json_safe(value)
        )

        if not np.isfinite(confidence):
            return None

        # ป้องกันค่าหลุดช่วง
        confidence = max(
            0.0,
            min(1.0, confidence),
        )

        return round(
            confidence,
            6,
        )

    except (TypeError, ValueError):
        return None


def normalize_bbox(
    bbox: Any,
) -> list[float] | None:
    """
    แปลง Bounding Box เป็นรูป:

    [x1, y1, x2, y2]

    เหมาะกับคอลัมน์ JSON หรือ JSONB
    """
    bbox = to_json_safe(bbox)

    if bbox is None:
        return None

    if isinstance(bbox, dict):
        values = [
            bbox.get("x1"),
            bbox.get("y1"),
            bbox.get("x2"),
            bbox.get("y2"),
        ]

    elif isinstance(bbox, (list, tuple)):
        if len(bbox) < 4:
            return None

        values = list(
            bbox[:4]
        )

    else:
        return None

    normalized: list[float] = []

    for value in values:
        try:
            number = float(value)

            if not np.isfinite(number):
                return None

            normalized.append(
                round(number, 2)
            )

        except (TypeError, ValueError):
            return None

    x1, y1, x2, y2 = normalized

    if x2 <= x1 or y2 <= y1:
        return None

    return normalized


def bbox_to_dedupe_key(
    bbox: list[float] | None,
) -> tuple[Any, ...]:
    """
    สร้าง Key สำหรับกรอง Detection ซ้ำ
    """
    if bbox is None:
        return ()

    return tuple(
        int(round(value))
        for value in bbox
    )


def guess_content_type(
    file_path: str,
) -> str:
    """
    เดา MIME type ของไฟล์
    """
    return (
        mimetypes.guess_type(
            file_path
        )[0]
        or "image/jpeg"
    )


def extract_public_url(
    response: Any,
) -> str:
    """
    รองรับผลลัพธ์ get_public_url()
    หลายรูปแบบจาก supabase-py
    """
    if isinstance(response, str):
        return response

    if isinstance(response, dict):
        for key in (
            "publicUrl",
            "public_url",
            "url",
        ):
            value = response.get(key)

            if value:
                return str(value)

        data = response.get("data")

        if isinstance(data, dict):
            for key in (
                "publicUrl",
                "public_url",
                "url",
            ):
                value = data.get(key)

                if value:
                    return str(value)

    if response is not None:
        text = str(response).strip()

        if text:
            return text

    raise RuntimeError(
        "Cannot get public URL from Supabase Storage"
    )


def upload_public_file(
    bucket: str,
    local_path: str,
    storage_path: str,
) -> str:
    """
    อัปโหลดไฟล์ขึ้น Supabase Storage
    แล้วคืน Public URL
    """
    file_path = Path(
        local_path
    )

    if not file_path.exists():
        raise FileNotFoundError(
            f"File not found: {local_path}"
        )

    if not file_path.is_file():
        raise ValueError(
            f"Path is not a file: {local_path}"
        )

    file_bytes = (
        file_path.read_bytes()
    )

    if not file_bytes:
        raise ValueError(
            f"File is empty: {local_path}"
        )

    content_type = guess_content_type(
        local_path
    )

    (
        supabase
        .storage
        .from_(bucket)
        .upload(
            path=storage_path,
            file=file_bytes,
            file_options={
                "content-type":
                    content_type,
                "cache-control":
                    "3600",
                "upsert":
                    "false",
            },
        )
    )

    public_url_response = (
        supabase
        .storage
        .from_(bucket)
        .get_public_url(
            storage_path
        )
    )

    return extract_public_url(
        public_url_response
    )


def remove_storage_file(
    bucket: str,
    storage_path: str,
) -> None:
    """
    ลบไฟล์ออกจาก Storage กรณีบันทึกฐานข้อมูลล้มเหลว

    ความผิดพลาดจาก Cleanup จะไม่บดบัง Error หลัก
    """
    try:
        (
            supabase
            .storage
            .from_(bucket)
            .remove(
                [storage_path]
            )
        )

    except Exception as error:
        print(
            "[scan_service] "
            "storage cleanup failed:",
            bucket,
            storage_path,
            repr(error),
        )


def prepare_detail_rows(
    detections: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    แปลงผลจาก infer.py เป็นข้อมูลสำหรับ scan_details

    ตาราง scan_details ใช้เฉพาะ:
    - banana_index
    - ripeness_label
    - ripeness_th
    - confidence
    - bbox

    polygon ไม่ถูกบันทึก จึงไม่ต้องเพิ่มคอลัมน์ใหม่
    """
    prepared_rows: list[
        dict[str, Any]
    ] = []

    seen_keys: set[
        tuple[Any, ...]
    ] = set()

    for fallback_index, raw_item in enumerate(
        detections,
        start=1,
    ):
        safe_item = to_json_safe(
            raw_item
        )

        if not isinstance(
            safe_item,
            dict,
        ):
            continue

        raw_label = pick_first_value(
            safe_item,
            (
                "ripeness_label",
                "ripeness",
                "class_name",
                "label",
            ),
        )

        label = normalize_label(
            raw_label
        )

        if label is None:
            print(
                "[scan_service] "
                "skip unknown label:",
                raw_label,
            )
            continue

        raw_confidence = pick_first_value(
            safe_item,
            (
                "ripeness_confidence",
                "ripeness_conf",
                "confidence",
                "conf",
                "det_conf",
            ),
        )

        confidence = normalize_confidence(
            raw_confidence
        )

        raw_bbox = pick_first_value(
            safe_item,
            (
                "bbox",
                "bbox_xyxy",
                "box",
            ),
        )

        bbox = normalize_bbox(
            raw_bbox
        )

        banana_index = get_banana_index(
            safe_item,
            fallback_index,
        )

        bbox_key = bbox_to_dedupe_key(
            bbox
        )

        # ถ้ามี bbox ใช้ bbox + label กัน Detection ซ้ำ
        if bbox_key:
            dedupe_key = (
                "bbox",
                label,
                *bbox_key,
            )

        else:
            # ถ้าไม่มี bbox ให้ใช้หมายเลขกล้วยแทน
            dedupe_key = (
                "index",
                banana_index,
                label,
            )

        if dedupe_key in seen_keys:
            print(
                "[scan_service] "
                "skip duplicate detection:",
                dedupe_key,
            )
            continue

        seen_keys.add(
            dedupe_key
        )

        prepared_rows.append(
            {
                "banana_index":
                    banana_index,
                "ripeness_label":
                    label,
                "ripeness_th":
                    THAI_LABELS[label],
                "confidence":
                    confidence,
                "bbox":
                    bbox,
            }
        )

    # เรียงตามหมายเลขที่ infer.py กำหนด
    prepared_rows.sort(
        key=lambda row: int(
            row.get(
                "banana_index",
                0,
            )
        )
    )

    # จัดเลขใหม่เป็น 1..N
    # เพื่อรับประกันว่าตรงกับจำนวน Detail จริง
    for new_index, row in enumerate(
        prepared_rows,
        start=1,
    ):
        row["banana_index"] = (
            new_index
        )

    return prepared_rows


def calculate_counts_from_details(
    detail_rows: list[dict[str, Any]],
    summary: dict[str, int],
) -> dict[str, int]:
    """
    ใช้ข้อมูลรายลูกจริงคำนวณยอดรวม

    ทำให้:
    - total_bananas
    - จำนวน scan_details
    - จำนวน label บนภาพ

    สอดคล้องกันมากที่สุด
    """
    if detail_rows:
        counts = {
            "green": 0,
            "breaker": 0,
            "ripe": 0,
            "overripe": 0,
        }

        for row in detail_rows:
            label = row.get(
                "ripeness_label"
            )

            if label in counts:
                counts[label] += 1

        counts["total"] = len(
            detail_rows
        )

        return counts

    safe_summary = to_json_safe(
        summary
    )

    if not isinstance(
        safe_summary,
        dict,
    ):
        safe_summary = {}

    return {
        "green": int(
            safe_summary.get(
                "green",
                0,
            )
            or 0
        ),
        "breaker": int(
            safe_summary.get(
                "breaker",
                0,
            )
            or 0
        ),
        "ripe": int(
            safe_summary.get(
                "ripe",
                0,
            )
            or 0
        ),
        "overripe": int(
            safe_summary.get(
                "overripe",
                0,
            )
            or 0
        ),
        "total": int(
            safe_summary.get(
                "total",
                0,
            )
            or 0
        ),
    }


def normalize_inference_ms(
    inference_ms: int | float | None,
) -> int | None:
    """
    บังคับ inference_ms เป็น Integer

    ป้องกัน PostgreSQL Integer
    รับค่าอย่าง 542.37 ไม่ได้
    """
    if inference_ms is None:
        return None

    try:
        value = float(
            to_json_safe(
                inference_ms
            )
        )

        if not np.isfinite(value):
            return None

        return int(
            round(value)
        )

    except (TypeError, ValueError):
        return None


def rollback_scan_history(
    scan_id: str,
) -> None:
    """
    ลบ scan_history หาก insert scan_details ล้มเหลว

    ป้องกันประวัติที่ไม่มีข้อมูลรายลูก
    """
    try:
        (
            supabase
            .table("scan_history")
            .delete()
            .eq(
                "id",
                scan_id,
            )
            .execute()
        )

    except Exception as error:
        print(
            "[scan_service] "
            "rollback scan_history failed:",
            scan_id,
            repr(error),
        )


def save_scan_result_to_supabase(
    *,
    original_path: str,
    result_path: str,
    detections: list[dict[str, Any]],
    summary: dict[str, int],
    inference_ms: int | float | None = None,
    user_id: str | None = None,
    guest_id: str | None = "guest",
) -> dict[str, Any]:
    """
    บันทึกผลการวิเคราะห์ลง Supabase

    ขั้นตอน:
    1. เตรียมข้อมูลรายลูก
    2. อัปโหลดภาพต้นฉบับ
    3. อัปโหลดภาพผลลัพธ์
    4. บันทึก scan_history
    5. บันทึก scan_details
    6. คืน scan_id ให้ Mobile
    """
    safe_user_id = clean_optional_text(
        user_id
    )

    # เมื่อ Login แล้ว ต้องไม่ส่ง guest_id
    safe_guest_id = (
        None
        if safe_user_id
        else (
            clean_optional_text(
                guest_id
            )
            or "guest"
        )
    )

    safe_detections = to_json_safe(
        detections
    )

    if not isinstance(
        safe_detections,
        list,
    ):
        safe_detections = []

    detail_drafts = prepare_detail_rows(
        safe_detections
    )

    # ถ้า infer.py บอกว่ามี Detection
    # แต่ไม่สามารถสร้างรายละเอียดได้เลย ถือว่าข้อมูลผิดปกติ
    if safe_detections and not detail_drafts:
        raise RuntimeError(
            "Detections exist but no valid scan_details "
            "could be prepared"
        )

    counts = calculate_counts_from_details(
        detail_drafts,
        summary,
    )

    folder_id = uuid.uuid4().hex

    original_extension = (
        Path(original_path)
        .suffix
        .lower()
        or ".jpg"
    )

    result_extension = (
        Path(result_path)
        .suffix
        .lower()
        or ".jpg"
    )

    original_storage_path = (
        f"scans/{folder_id}/"
        f"original{original_extension}"
    )

    result_storage_path = (
        f"scans/{folder_id}/"
        f"result{result_extension}"
    )

    original_url: str | None = None
    result_url: str | None = None
    scan_id: str | None = None

    try:
        original_url = upload_public_file(
            ORIGINALS_BUCKET,
            original_path,
            original_storage_path,
        )

        result_url = upload_public_file(
            RESULTS_BUCKET,
            result_path,
            result_storage_path,
        )

        scan_payload = {
            "user_id":
                safe_user_id,
            "guest_id":
                safe_guest_id,
            "original_image_url":
                original_url,
            "result_image_url":
                result_url,
            "total_bananas":
                int(counts["total"]),
            "green_count":
                int(counts["green"]),
            "breaker_count":
                int(counts["breaker"]),
            "ripe_count":
                int(counts["ripe"]),
            "overripe_count":
                int(counts["overripe"]),
            "inference_ms":
                normalize_inference_ms(
                    inference_ms
                ),
        }

        scan_payload = to_json_safe(
            scan_payload
        )

        print(
            "[scan_service] "
            "scan_history payload:",
            scan_payload,
        )

        scan_response = (
            supabase
            .table("scan_history")
            .insert(scan_payload)
            .execute()
        )

        if not scan_response.data:
            raise RuntimeError(
                "Cannot insert scan_history: "
                "Supabase returned no inserted row"
            )

        inserted_history = (
            scan_response.data[0]
        )

        if not isinstance(
            inserted_history,
            dict,
        ):
            raise RuntimeError(
                "Cannot insert scan_history: "
                "invalid response format"
            )

        scan_id_value = (
            inserted_history.get(
                "id"
            )
        )

        if (
            scan_id_value is None
            or str(
                scan_id_value
            ).strip() == ""
        ):
            raise RuntimeError(
                "Cannot insert scan_history: "
                "inserted row has no id"
            )

        scan_id = str(
            scan_id_value
        )

        detail_rows = [
            {
                "scan_id":
                    scan_id,
                **detail,
            }
            for detail in detail_drafts
        ]

        detail_rows = to_json_safe(
            detail_rows
        )

        # กรณีตรวจไม่พบกล้วย
        # ไม่จำเป็นต้อง insert scan_details
        if detail_rows:
            try:
                (
                    supabase
                    .table("scan_details")
                    .insert(detail_rows)
                    .execute()
                )

            except Exception as detail_error:
                # ลบประวัติที่เพิ่งสร้าง
                # เพื่อไม่ให้เกิด History เปล่า
                rollback_scan_history(
                    scan_id
                )

                scan_id = None

                raise RuntimeError(
                    "Cannot insert scan_details: "
                    f"{detail_error}"
                ) from detail_error

        print(
            "[scan_service] "
            "scan saved successfully:",
            {
                "scan_id":
                    scan_id,
                "detail_count":
                    len(detail_rows),
                "counts":
                    counts,
            },
        )

        return {
            "scan_id":
                scan_id,
            "original_image_url":
                original_url,
            "result_image_url":
                result_url,
            "history_saved":
                True,
            "details_saved":
                True,
            "details_count":
                len(detail_rows),
            "total_bananas":
                int(counts["total"]),
            "green_count":
                int(counts["green"]),
            "breaker_count":
                int(counts["breaker"]),
            "ripe_count":
                int(counts["ripe"]),
            "overripe_count":
                int(counts["overripe"]),
        }

    except Exception:
        # ถ้าฐานข้อมูลยังไม่สำเร็จ
        # ลบไฟล์ Storage ที่เพิ่งอัปโหลด
        if scan_id is None:
            if original_url:
                remove_storage_file(
                    ORIGINALS_BUCKET,
                    original_storage_path,
                )

            if result_url:
                remove_storage_file(
                    RESULTS_BUCKET,
                    result_storage_path,
                )

        raise