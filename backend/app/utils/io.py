from __future__ import annotations
import os
import time
from pathlib import Path
from typing import Tuple

import cv2
import numpy as np


def ensure_dir(path: str | Path) -> None:
    Path(path).mkdir(parents=True, exist_ok=True)


def save_upload_bytes(image_bytes: bytes, upload_dir: str, ext: str = ".jpg") -> str:
    """
    Save uploaded bytes to disk and return absolute filepath.
    """
    ensure_dir(upload_dir)
    ts = int(time.time() * 1000)
    filename = f"upload_{ts}{ext}"
    filepath = str(Path(upload_dir) / filename)

    # decode -> write (safer than writing raw bytes)
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Cannot decode image bytes")

    ok = cv2.imwrite(filepath, img)
    if not ok:
        raise IOError("Failed to write image to disk")

    return filepath


def load_image_bgr(path: str) -> np.ndarray:
    img = cv2.imread(path)
    if img is None:
        raise ValueError(f"Cannot read image: {path}")
    return img
