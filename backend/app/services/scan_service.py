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

    scan_payload = {
        "user_id": user_id,
        "guest_id": guest_id,
        "original_image_url": original_url,
        "result_image_url": result_url,
        "total_bananas": int(summary.get("total", len(detections))),
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

    for index, item in enumerate(detections, start=1):
        label = (
            item.get("ripeness_label")
            or item.get("ripeness")
            or item.get("label")
        )

        if label not in THAI_LABELS:
            continue

        confidence = (
            item.get("ripeness_confidence")
            or item.get("confidence")
            or item.get("conf")
        )

        detail_rows.append({
            "scan_id": scan_id,
            "banana_index": index,
            "ripeness_label": label,
            "ripeness_th": THAI_LABELS[label],
            "confidence": confidence,
            "bbox": item.get("bbox") or item.get("bbox_xyxy"),
        })

    if detail_rows:
        supabase.table("scan_details").insert(detail_rows).execute()

    return {
        "scan_id": scan_id,
        "original_image_url": original_url,
        "result_image_url": result_url,
    }