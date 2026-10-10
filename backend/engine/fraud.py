"""Photo-hash and rate-limit anti-fraud helpers."""
from __future__ import annotations

import time
from collections import defaultdict, deque

PHASH_MAX_DIST = 6


def phash_distance(a: str, b: str) -> int:
    """Hamming distance between two imagehash hex strings."""
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def is_duplicate_photo(a, b, max_dist: int = PHASH_MAX_DIST) -> bool:
    if not a or not b:
        return False
    try:
        return phash_distance(a, b) <= max_dist
    except ValueError:
        return False


def compute_phash(image_bytes: bytes):
    """pHash hex of an image, or None if it cannot be decoded."""
    try:
        import io

        import imagehash
        from PIL import Image
        return str(imagehash.phash(Image.open(io.BytesIO(image_bytes))))
    except Exception:
        return None


class RateLimiter:
    """Sliding window: at most `limit` hits per `window_s` per key."""

    def __init__(self, limit: int = 10, window_s: float = 3600.0) -> None:
        self.limit, self.window_s = limit, window_s
        self._hits: dict[str, deque] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> deque:
        q = self._hits[key]
        while q and now - q[0] >= self.window_s:
            q.popleft()
        return q

    def check(self, key: str, now: float | None = None) -> bool:
        """True if another hit is allowed (does not record)."""
        now = time.time() if now is None else now
        return len(self._prune(key, now)) < self.limit

    def hit(self, key: str, now: float | None = None) -> bool:
        """Record a hit if allowed. Returns False when over the limit."""
        now = time.time() if now is None else now
        q = self._prune(key, now)
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()
