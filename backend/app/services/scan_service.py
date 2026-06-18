from __future__ import annotations

import os
import uuid
import mimetypes
from pathlib import Path
from typing import Any

from app.supabase_client import supabase

ORIGINALS_BUCKET = os.getenv("SUPABASE_BUCKET_ORIGINALS", "scan-originals")
RESULTS_BUCKET = os.getenv("SUPABASE_BUCKET_RESULTS", "scan-results")

THAI_LABELS = {
    "green": "ดิบ",
    "breaker": "ห่าม",
    "ripe": "สุก",
    "overripe": "งอม",
}


def get_banana_index(item: dict[str, Any], fallback: int) -> int:
    """
    ใช้เลขลูกจาก detection ถ้ามี
    ถ้าไม่มี ค่อย fallback เป็นลำดับใน loop
    """
    for key in (
        "banana_index",
        "detection_index",
        "index",
        "banana_no",
        "banana_number",
    ):
        value = item.get(key)

        if value is not None and value != "":
            try:
                return int(value)
            except (TypeError, ValueError):
                pass

    return fallback


def normalize_bbox(bbox: Any) -> tuple:
    """
    ใช้กันบันทึก detection ซ้ำแบบ bbox เดียวกัน
    """
    if bbox is None:
        return ()

    if isinstance(bbox, dict):
        return tuple(bbox.get(k) for k in ("x1", "y1", "x2", "y2"))

    if isinstance(bbox, (list, tuple)):
        normalized = []

        for value in bbox:
            try:
                normalized.append(round(float(value)))
            except (TypeError, ValueError):
                normalized.append(str(value))

        return tuple(normalized)

    return (str(bbox),)


def pick_first_value(item: dict[str, Any], keys: tuple[str, ...]) -> Any:
    """
    ดึงค่าตัวแรกที่ไม่ใช่ None/empty string
    ไม่ใช้ or เพราะค่า 0 อาจถูกมองเป็น False ได้
    """
    for key in keys:
        value = item.get(key)

        if value is not None and value != "":
            return value

    return None


def guess_content_type(file_path: str) -> str:
    return mimetypes.guess_type(file_path)[0] or "image/jpeg"


def upload_public_file(bucket: str, local_path: str, storage_path: str) -> str:
    content_type = guess_content_type(local_path)
    file_bytes = Path(local_path).read_bytes()

    supabase.storage.from_(bucket).upload(
        path=storage_path,
        file=file_bytes,
        file_options={
            "content-type": content_type,
            "cache-control": "3600",
            "upsert": "false",
        },
    )

    return supabase.storage.from_(bucket).get_public_url(storage_path)


def save_scan_result_to_supabase(
    *,
    original_path: str,
    result_path: str,
    detections: list[dict[str, Any]],
    summary: dict[str, int],
    inference_ms: int | None = None,
    user_id: str | None = None,
    guest_id: str | None = "guest",
) -> dict[str, Any]:

    folder_id = uuid.uuid4().hex

    original_ext = Path(original_path).suffix or ".jpg"
    result_ext = Path(result_path).suffix or ".jpg"

    original_storage_path = f"scans/{folder_id}/original{original_ext}"
    result_storage_path = f"scans/{folder_id}/result{result_ext}"

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

    total_from_summary = int(summary.get("total", len(detections)))

    scan_payload = {
        "user_id": user_id,
        "guest_id": guest_id,
        "original_image_url": original_url,
        "result_image_url": result_url,
        "total_bananas": total_from_summary,
        "green_count": int(summary.get("green", 0)),
        "breaker_count": int(summary.get("breaker", 0)),
        "ripe_count": int(summary.get("ripe", 0)),
        "overripe_count": int(summary.get("overripe", 0)),
        "inference_ms": inference_ms,
    }

    scan_response = (
        supabase.table("scan_history")
        .insert(scan_payload)
        .execute()
    )

    if not scan_response.data:
        raise RuntimeError("Cannot insert scan_history")

    scan_id = scan_response.data[0]["id"]

    detail_rows = []
    seen_keys = set()

    for fallback_index, item in enumerate(detections, start=1):
        label = pick_first_value(
            item,
            (
                "ripeness_label",
                "ripeness",
                "label",
            ),
        )

        if label not in THAI_LABELS:
            continue

        confidence = pick_first_value(
            item,
            (
                "ripeness_confidence",
                "ripeness_conf",
                "confidence",
                "conf",
            ),
        )

        bbox = item.get("bbox") or item.get("bbox_xyxy")

        # [FIX] กันบันทึก detection ซ้ำ
        dedupe_key = (
            label,
            normalize_bbox(bbox),
        )

        if dedupe_key in seen_keys:
            continue

        seen_keys.add(dedupe_key)

        # [FIX] ใช้เลขลูกเดียวกับที่ AI/annotated image ส่งมา
        # ถ้าไม่มีจริง ๆ ค่อย fallback เป็นลำดับใน loop
        banana_index = get_banana_index(item, fallback_index)

        detail_rows.append(
            {
                "scan_id": scan_id,
                "banana_index": banana_index,
                "ripeness_label": label,
                "ripeness_th": THAI_LABELS[label],
                "confidence": confidence,
                "bbox": bbox,
            }
        )

        # [FIX] ไม่ให้จำนวน scan_details เกินจำนวนรวมที่ summary บอก
        if len(detail_rows) >= total_from_summary:
            break

    # [FIX สำคัญ] insert scan_details แค่รอบเดียวเท่านั้น
    if detail_rows:
        detail_response = (
            supabase.table("scan_details")
            .insert(detail_rows)
            .execute()
        )

        if not detail_response.data:
            raise RuntimeError("Cannot insert scan_details")

    return {
        "scan_id": scan_id,
        "original_image_url": original_url,
        "result_image_url": result_url,
    }