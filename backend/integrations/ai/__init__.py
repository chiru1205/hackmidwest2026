"""Akamai hosted inference client (OpenAI-compatible). Never raises: returns None on any failure."""
from __future__ import annotations

import json
import logging
import os
import re
import time

import httpx
from dotenv import load_dotenv

from . import usage

load_dotenv()
log = logging.getLogger("civicflow.ai")


class TokenBucket:
    def __init__(self, per_minute: int):
        self.capacity = float(per_minute)
        self.tokens = float(per_minute)
        self.rate = per_minute / 60.0
        self.updated = time.monotonic()

    def try_take(self) -> bool:
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False


_bucket = TokenBucket(int(os.getenv("AKAMAI_RPM_CAP", "50")))


def _cfg() -> tuple[str, str, str]:
    return (os.getenv("AKAMAI_AI_BASE_URL") or "https://ws.akamai-workshops.com/v1",
            os.getenv("AKAMAI_AI_KEY", ""),
            os.getenv("AKAMAI_CHAT_MODEL") or "hackathon-chat")


def has_key() -> bool:
    return bool(os.getenv("AKAMAI_AI_KEY"))


def parse_json_loose(text: str) -> dict | None:
    """Strip code fences, find the first {...} and parse it."""
    if not text:
        return None
    text = re.sub(r"```(?:json)?", "", text)
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    out = json.loads(text[start:i + 1])
                    return out if isinstance(out, dict) else None
                except Exception:
                    return None
    return None


async def _chat(system: str, user: str, max_tokens: int, timeout: float = 15.0) -> str | None:
    base, key, model = _cfg()
    if not key:
        return None
    if not _bucket.try_take():
        log.warning("akamai rate limit bucket empty")
        return None
    t0 = time.perf_counter()
    ok, tokens = False, None
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                base.rstrip("/") + "/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={"model": model, "max_tokens": max_tokens, "temperature": 0.2,
                      "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
            )
        if r.status_code != 200:
            log.warning("akamai chat HTTP %s", r.status_code)
            return None
        body = r.json()
        tokens = (body.get("usage") or {}).get("total_tokens")
        out = body["choices"][0]["message"]["content"]
        ok = True
        return out
    except Exception as e:  # timeout, network, bad payload
        log.warning("akamai chat failed: %s", type(e).__name__)
        return None
    finally:
        usage.record("chat", ok, (time.perf_counter() - t0) * 1000, tokens)


async def chat_json(system: str, user: str, max_tokens: int = 400) -> dict | None:
    text = await _chat(system + "\nRespond with ONE strict JSON object only. No prose, no code fences.", user, max_tokens)
    return parse_json_loose(text) if text else None


async def chat_text(system: str, user: str, max_tokens: int = 200) -> str | None:
    text = await _chat(system, user, max_tokens)
    return text.strip() if text and text.strip() else None
