"""Akamai hosted image generation (hackathon-image). Returns PNG/JPEG bytes or None. Instrumented for /api/ai-usage.
Callers must pace requests (limit: 6 images/minute for the whole team)."""
from __future__ import annotations

import base64
import logging
import os
import time

import httpx

from . import _bucket, has_key, usage

log = logging.getLogger("civicflow.image")


async def generate_image(prompt: str, size: str = "512x512", timeout: float = 30.0) -> bytes | None:
    if not has_key() or not _bucket.try_take():
        return None
    base = os.getenv("AKAMAI_AI_BASE_URL") or "https://ws.akamai-workshops.com/v1"
    t0 = time.perf_counter()
    ok = False
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(base.rstrip("/") + "/images/generations",
                                  headers={"Authorization": f"Bearer {os.getenv('AKAMAI_AI_KEY', '')}"},
                                  json={"model": os.getenv("AKAMAI_IMAGE_MODEL") or "hackathon-image", "prompt": prompt,
                                        "n": 1, "size": size, "response_format": "b64_json"})
        if r.status_code != 200:
            log.warning("akamai image HTTP %s", r.status_code)
            return None
        out = base64.b64decode(r.json()["data"][0]["b64_json"])
        ok = True
        return out
    except Exception as e:
        log.warning("akamai image failed: %s", type(e).__name__)
        return None
    finally:
        usage.record("image", ok, (time.perf_counter() - t0) * 1000)
