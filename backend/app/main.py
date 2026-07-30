from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import cv2
import numpy as np
from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.middleware.cors import (
    CORSMiddleware,
)
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.ai.infer import YOLOService
from app.services.scan_service import (
    save_scan_result_to_supabase,
)
from app.supabase_client import supabase
from app.utils.io import (
    ensure_dir,
    load_image_bgr,
    save_upload_bytes,
)


APP_NAME = "BananaVision Backend"

UPLOAD_DIR = "uploads"
RESULT_DIR = "results"

SEGMENTATION_MODEL_PATH = os.getenv(
    "SEGMENTATION_MODEL_PATH",
    "models/banana_seg_4cls_v1_best.pt",
)

DEFAULT_CONF = float(
    os.getenv("CONF", "0.25")
)

ensure_dir(UPLOAD_DIR)
ensure_dir(RESULT_DIR)

app = FastAPI(
    title=APP_NAME
)

app.mount(
    "/uploads",
    StaticFiles(
        directory=UPLOAD_DIR
    ),
    name="uploads",
)

app.mount(
    "/results",
    StaticFiles(
        directory=RESULT_DIR
    ),
    name="results",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

yolo_service: Optional[
    YOLOService
] = None


class FeedbackRequest(BaseModel):
    scan_id: str = Field(
        ...,
        min_length=1,
    )
    user_id: Optional[str] = None
    guest_id: Optional[str] = "guest"
    rating: int = Field(
        ...,
        ge=1,
        le=5,
    )
    is_correct: Optional[bool] = None
    comment: Optional[str] = None


@app.on_event("startup")
def on_startup():
    global yolo_service

    model_path = Path(
        SEGMENTATION_MODEL_PATH
    )

    if not model_path.exists():
        raise RuntimeError(
            "Segmentation model not found at: "
            f"{SEGMENTATION_MODEL_PATH}"
        )

    yolo_service = YOLOService(
        model_path=SEGMENTATION_MODEL_PATH,
    )

    print(
        "[startup] Segmentation model loaded:",
        SEGMENTATION_MODEL_PATH,
    )


@app.get("/")
def root():
    return {
        "message":
            "BananaVision Backend running",
        "model_type":
            "yolo_segmentation_4cls",
    }


@app.get("/health")
def health():
    model_task = None
    model_names = None

    if yolo_service is not None:
        model_task = (
            yolo_service.model.task
        )
        model_names = (
            yolo_service.model.names
        )

    return {
        "status": "ok",
        "service": APP_NAME,
        "model_type":
            "yolo_segmentation_4cls",
        "model_task": model_task,
        "classes": model_names,
        "segmentation_model_path":
            SEGMENTATION_MODEL_PATH,
        "confidence_threshold":
            DEFAULT_CONF,
    }


@app.get(
    "/auth/reset-bridge",
    response_class=HTMLResponse,
)
async def reset_bridge(
    token_hash: Optional[str] = Query(
        None
    ),
    reset_type: str = Query(
        "recovery",
        alias="type",
    ),
):
    if not token_hash:
        return HTMLResponse(
            content="""
            <!DOCTYPE html>
            <html>
                <head>
                    <meta
                        name="viewport"
                        content="width=device-width,
                        initial-scale=1.0"
                    />
                    <title>
                        Reset Password Error
                    </title>
                </head>

                <body style="
                    font-family: Arial;
                    padding: 32px;
                    background: #FBF7E3;
                ">
                    <h2>
                        Reset Password Error
                    </h2>

                    <p>
                        ไม่พบ token_hash จากลิงก์
                        กรุณาขอ Reset Password ใหม่
                    </p>
                </body>
            </html>
            """,
            status_code=400,
        )

    expo_url = (
        "exp://172.20.10.2:8081/"
        "--/reset-password"
        f"?token_hash="
        f"{quote(token_hash, safe='')}"
        f"&type="
        f"{quote(reset_type, safe='')}"
    )

    html = f"""
    <!DOCTYPE html>
    <html>
        <head>
            <meta
                name="viewport"
                content="width=device-width,
                initial-scale=1.0"
            />
            <title>
                Open BananaVision
            </title>
        </head>

        <body style="
            font-family: Arial;
            padding: 32px;
            background: #FBF7E3;
        ">
            <h2>Reset Password</h2>

            <p>
                กดปุ่มด้านล่างเพื่อเปิดแอป
                BananaVision
            </p>

            <a
                href="{expo_url}"
                style="
                    display: inline-block;
                    padding: 16px 24px;
                    background: #27AE60;
                    color: white;
                    border-radius: 999px;
                    text-decoration: none;
                    font-weight: bold;
                    font-size: 18px;
                "
            >
                Open BananaVision
            </a>

            <p style="
                margin-top: 24px;
                color: #666;
            ">
                ถ้าปุ่มไม่ทำงาน
                ให้ copy ลิงก์นี้ไปเปิด:
            </p>

            <p style="
                word-break: break-all;
            ">
                {expo_url}
            </p>
        </body>
    </html>
    """

    return HTMLResponse(
        content=html
    )


@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    conf: Optional[float] = None,
    user_id: Optional[str] = Form(None),
    guest_id: Optional[str] = Form(None),
):
    global yolo_service

    if yolo_service is None:
        raise HTTPException(
            status_code=500,
            detail="Model not loaded",
        )

    if (
        not file.content_type
        or not file.content_type.startswith(
            "image/"
        )
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid content_type: "
                f"{file.content_type}"
            ),
        )

    image_bytes = await file.read()

    print(
        "[detect]",
        "filename:",
        file.filename,
        "content_type:",
        file.content_type,
        "bytes:",
        len(image_bytes),
    )

    print(
        "[detect auth raw]",
        "user_id:",
        user_id,
        "guest_id:",
        guest_id,
    )

    if (
        not image_bytes
        or len(image_bytes) < 1000
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Empty or too small "
                "image payload"
            ),
        )

    np_buffer = np.frombuffer(
        image_bytes,
        dtype=np.uint8,
    )

    decoded_image = cv2.imdecode(
        np_buffer,
        cv2.IMREAD_COLOR,
    )

    if decoded_image is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot decode image bytes "
                "(invalid/unsupported format)"
            ),
        )

    try:
        saved_path = save_upload_bytes(
            image_bytes,
            UPLOAD_DIR,
            ext=_guess_ext(
                file.filename
            ),
        )

        saved_name = Path(
            saved_path
        ).name

        image = load_image_bgr(
            saved_path
        )

        if image is None:
            image = decoded_image

        started_at = time.perf_counter()

        prediction = yolo_service.predict(
            image,
            conf=(
                conf
                if conf is not None
                else DEFAULT_CONF
            ),
        )

        inference_ms = round(
            (
                time.perf_counter()
                - started_at
            )
            * 1000,
            2,
        )

        if prediction is None:
            prediction = {}

        annotated_image = prediction.pop(
            "annotated_image",
            None,
        )

        result_name = (
            f"result_{saved_name}"
        )

        result_path = str(
            Path(RESULT_DIR)
            / result_name
        )

        if annotated_image is not None:
            saved_ok = cv2.imwrite(
                result_path,
                annotated_image,
            )

            if not saved_ok:
                raise RuntimeError(
                    "Cannot save "
                    "annotated image"
                )
        else:
            cv2.imwrite(
                result_path,
                image,
            )

        detections = prediction.get(
            "detections",
            [],
        )

        if not isinstance(
            detections,
            list,
        ):
            detections = []

        summary = prediction.get(
            "summary",
            {},
        )

        if not isinstance(
            summary,
            dict,
        ):
            summary = {}

        summary.setdefault(
            "green",
            0,
        )
        summary.setdefault(
            "breaker",
            0,
        )
        summary.setdefault(
            "ripe",
            0,
        )
        summary.setdefault(
            "overripe",
            0,
        )
        summary.setdefault(
            "total",
            len(detections),
        )

        scan_id = None
        supabase_original_url = None
        supabase_result_url = None
        supabase_saved = False
        supabase_error = None

        final_user_id = (
            user_id.strip()
            if user_id
            else None
        )

        final_guest_id = (
            None
            if final_user_id
            else (
                guest_id.strip()
                if guest_id
                else "guest"
            )
        )

        print(
            "[detect auth]",
            "user_id:",
            final_user_id,
            "guest_id:",
            final_guest_id,
        )

        try:
            saved_scan = (
                save_scan_result_to_supabase(
                    original_path=saved_path,
                    result_path=result_path,
                    detections=detections,
                    summary=summary,
                    inference_ms=inference_ms,
                    user_id=final_user_id,
                    guest_id=final_guest_id,
                )
            )

            scan_id = saved_scan.get(
                "scan_id"
            )
            supabase_original_url = (
                saved_scan.get(
                    "original_image_url"
                )
            )
            supabase_result_url = (
                saved_scan.get(
                    "result_image_url"
                )
            )
            supabase_saved = True

        except Exception as error:
            supabase_error = str(error)

            print(
                "[supabase] save scan failed:",
                repr(error),
            )

        return {
            "ok": True,
            "filename": file.filename,
            "content_type":
                file.content_type,

            "saved_path": saved_path,
            "saved_url":
                f"/uploads/{saved_name}",

            "result_path": result_path,
            "result_url":
                f"/results/{result_name}",

            "inference_ms":
                inference_ms,

            "count":
                len(detections),
            "total_detections":
                len(detections),
            "summary":
                summary,
            "detections":
                detections,

            "scan_id":
                scan_id,
            "supabase_saved":
                supabase_saved,
            "supabase_error":
                supabase_error,
            "supabase_original_url":
                supabase_original_url,
            "supabase_result_url":
                supabase_result_url,

            "user_id":
                final_user_id,
            "guest_id":
                final_guest_id,

            "image_width":
                prediction.get(
                    "image_width"
                ),
            "image_height":
                prediction.get(
                    "image_height"
                ),

            "model_type":
                prediction.get(
                    "model_type",
                    "yolo_segmentation_4cls",
                ),
            "model_task":
                prediction.get(
                    "model_task",
                    "segment",
                ),
            "model_path":
                prediction.get(
                    "model_path"
                ),

            "has_masks": any(
                bool(
                    detection.get(
                        "has_mask"
                    )
                )
                for detection in detections
            ),
        }

    except HTTPException:
        raise

    except Exception as error:
        print(
            "[detect] failed:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail=str(error),
        ) from error


@app.post("/feedback")
def submit_feedback(
    payload: FeedbackRequest,
):
    try:
        final_user_id = (
            payload.user_id.strip()
            if payload.user_id
            else None
        )

        final_guest_id = (
            None
            if final_user_id
            else (
                payload.guest_id
                or "guest"
            )
        )

        print(
            "[feedback auth]",
            "scan_id:",
            payload.scan_id,
            "user_id:",
            final_user_id,
            "guest_id:",
            final_guest_id,
        )

        feedback_row = {
            "user_id":
                final_user_id,
            "guest_id":
                final_guest_id,
            "scan_id":
                payload.scan_id,
            "rating":
                payload.rating,
            "is_correct":
                payload.is_correct,
            "comment": (
                payload.comment.strip()
                if payload.comment
                else None
            ),
        }

        response = (
            supabase
            .table("feedback")
            .insert(feedback_row)
            .execute()
        )

        if not response.data:
            raise RuntimeError(
                "Cannot insert feedback"
            )

        return {
            "ok": True,
            "feedback_id":
                response.data[0]["id"],
            "message":
                "Feedback saved successfully",
            "user_id":
                final_user_id,
            "guest_id":
                final_guest_id,
        }

    except Exception as error:
        print(
            "[feedback] save failed:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail=str(error),
        ) from error


def _guess_ext(
    filename: Optional[str],
) -> str:
    if not filename:
        return ".jpg"

    lower = filename.lower()

    for extension in [
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
    ]:
        if lower.endswith(
            extension
        ):
            return extension

    return ".jpg"