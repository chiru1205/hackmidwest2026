"""In-memory AI usage metrics (per model). Thread-safe, never raises."""
from __future__ import annotations

import threading
from datetime import datetime, timezone

_lock = threading.Lock()
_since = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

# stable display order: key -> (name, provider)
MODELS = {
    "chat": ("hackathon-chat", "Akamai"),
    "embedding": ("hackathon-embedding", "Akamai"),
    "image": ("hackathon-image", "Akamai"),
    "vision": ("bedrock vision", "AWS Bedrock"),
}
_stats: dict[str, dict] = {k: {"calls": 0, "errors": 0, "total_ms": 0.0, "last_ms": 0.0, "tokens": None}
                           for k in MODELS}


def record(kind: str, ok: bool, ms: float, tokens: int | None = None) -> None:
    try:
        with _lock:
            s = _stats.get(kind)
            if s is None:
                return
            s["calls"] += 1
            if not ok:
                s["errors"] += 1
            s["total_ms"] += ms
            s["last_ms"] = ms
            if tokens:
                s["tokens"] = (s["tokens"] or 0) + int(tokens)
    except Exception:
        pass


def snapshot() -> dict:
    with _lock:
        models = []
        for k, (name, provider) in MODELS.items():
            s = _stats[k]
            n = s["calls"]
            models.append({"name": name, "provider": provider, "calls": n, "errors": s["errors"],
                           "avg_ms": round(s["total_ms"] / n) if n else 0, "last_ms": round(s["last_ms"]),
                           "tokens": s["tokens"]})
        return {"models": models, "since": _since}


def reset() -> None:
    global _since
    with _lock:
        for s in _stats.values():
            s.update(calls=0, errors=0, total_ms=0.0, last_ms=0.0, tokens=None)
        _since = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
