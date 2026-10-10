"""Photo storage: local folder by default, S3-compatible (Akamai Object Storage) when STORAGE=s3."""
from __future__ import annotations

import logging
import os
import re
from pathlib import Path

log = logging.getLogger("civicflow.storage")
PHOTO_DIR = Path(__file__).resolve().parents[3] / "data" / "photos"


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", name) or "photo.jpg"


def _store_local(name: str, data: bytes) -> str:
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    (PHOTO_DIR / name).write_bytes(data)
    return f"/photos/{name}"


def store_photo(name: str, data: bytes) -> str:
    name = _safe(name)
    if os.getenv("STORAGE", "local") == "s3":
        try:
            import boto3
            s3 = boto3.client("s3", endpoint_url=os.getenv("S3_ENDPOINT") or None,
                              aws_access_key_id=os.getenv("S3_KEY"), aws_secret_access_key=os.getenv("S3_SECRET"))
            s3.put_object(Bucket=os.getenv("S3_BUCKET", "civicflow-photos"), Key=name, Body=data, ContentType="image/jpeg")
        except Exception as e:
            log.warning("s3 upload failed, using local only: %s", type(e).__name__)
    # always keep a local copy so the /photos static mount works
    return _store_local(name, data)
