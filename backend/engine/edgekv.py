"""EdgeKV-shaped cache (namespace / group / item). Memory by default, Valkey optional."""
from __future__ import annotations

import json
import time
from typing import Any

from .geo import geohash


def cell_key(lat: float, lng: float) -> str:
    return geohash(lat, lng, 7)


class EdgeKV:
    def __init__(self, url: str | None = None) -> None:
        self._mem: dict[tuple, tuple[Any, float | None]] = {}
        self._redis = None
        self.backend = "memory"
        self.hits = 0
        self.misses = 0
        self.total_ms = 0.0
        self.lookups = 0
        if url:
            try:
                import redis
                r = redis.Redis.from_url(url, socket_connect_timeout=1, socket_timeout=1)
                r.ping()
                self._redis, self.backend = r, "valkey"
            except Exception:
                self._redis = None

    @staticmethod
    def _k(namespace: str, group: str, item: str) -> str:
        return f"{namespace}:{group}:{item}"

    def get(self, namespace: str, group: str, item: str) -> Any | None:
        if self._redis is not None:
            try:
                raw = self._redis.get(self._k(namespace, group, item))
                return json.loads(raw) if raw is not None else None
            except Exception:
                pass
        entry = self._mem.get((namespace, group, item))
        if entry is None:
            return None
        value, exp = entry
        if exp is not None and time.monotonic() >= exp:
            self._mem.pop((namespace, group, item), None)
            return None
        return value

    def put(self, namespace: str, group: str, item: str, value: Any, ttl_s: float | None = None) -> None:
        if self._redis is not None:
            try:
                data = json.dumps(value)
                key = self._k(namespace, group, item)
                if ttl_s:
                    self._redis.set(key, data, px=max(1, int(ttl_s * 1000)))
                else:
                    self._redis.set(key, data)
                return
            except Exception:
                pass
        exp = time.monotonic() + ttl_s if ttl_s else None
        self._mem[(namespace, group, item)] = (value, exp)

    def delete(self, namespace: str, group: str, item: str) -> None:
        if self._redis is not None:
            try:
                self._redis.delete(self._k(namespace, group, item))
            except Exception:
                pass
        self._mem.pop((namespace, group, item), None)

    def clear(self) -> None:
        self._mem.clear()
        if self._redis is not None:
            try:
                for k in self._redis.scan_iter("civicflow:*"):
                    self._redis.delete(k)
            except Exception:
                pass

    # --- cell cache helpers (namespace "civicflow", group "cells") ---
    def put_cell(self, cell: str, clusters_json: Any, ttl_s: float | None = 60.0) -> None:
        self.put("civicflow", "cells", cell, clusters_json, ttl_s)

    def get_cell(self, cell: str) -> tuple[Any | None, bool, float]:
        """Returns (value or None, hit, elapsed_ms) and updates counters."""
        t0 = time.perf_counter()
        v = self.get("civicflow", "cells", cell)
        ms = (time.perf_counter() - t0) * 1000
        self.lookups += 1
        self.total_ms += ms
        if v is None:
            self.misses += 1
            return None, False, ms
        self.hits += 1
        return v, True, ms

    def invalidate_cell(self, cell: str) -> None:
        self.delete("civicflow", "cells", cell)

    def stats(self) -> dict:
        return {"hits": self.hits, "misses": self.misses,
                "avg_ms": (self.total_ms / self.lookups) if self.lookups else 0.0,
                "backend": self.backend}
