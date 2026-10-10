"""Geo helpers: haversine, geohash, neighbors, small in-memory index."""
from __future__ import annotations

import math

_B32 = "0123456789bcdefghjkmnpqrstuvwxyz"
EARTH_R = 6371008.8


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R * math.asin(min(1.0, math.sqrt(a)))


def geohash(lat: float, lng: float, precision: int = 7) -> str:
    lat_r, lng_r = [-90.0, 90.0], [-180.0, 180.0]
    out, bit, ch, even = [], 0, 0, True
    while len(out) < precision:
        rng, val = (lng_r, lng) if even else (lat_r, lat)
        mid = (rng[0] + rng[1]) / 2
        ch <<= 1
        if val >= mid:
            ch |= 1
            rng[0] = mid
        else:
            rng[1] = mid
        even = not even
        bit += 1
        if bit == 5:
            out.append(_B32[ch])
            bit, ch = 0, 0
    return "".join(out)


def decode_bbox(cell: str) -> tuple[float, float, float, float]:
    """Return (lat_min, lat_max, lng_min, lng_max)."""
    lat_r, lng_r = [-90.0, 90.0], [-180.0, 180.0]
    even = True
    for c in cell:
        v = _B32.index(c)
        for i in range(4, -1, -1):
            rng = lng_r if even else lat_r
            mid = (rng[0] + rng[1]) / 2
            if (v >> i) & 1:
                rng[0] = mid
            else:
                rng[1] = mid
            even = not even
    return lat_r[0], lat_r[1], lng_r[0], lng_r[1]


def neighbors(cell: str) -> list[str]:
    """The 8 surrounding cells at the same precision."""
    la0, la1, ln0, ln1 = decode_bbox(cell)
    dlat, dlng = la1 - la0, ln1 - ln0
    clat, clng = (la0 + la1) / 2, (ln0 + ln1) / 2
    res: list[str] = []
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            if di == 0 and dj == 0:
                continue
            lat = max(-89.999999, min(89.999999, clat + di * dlat))
            lng = (clng + dj * dlng + 180) % 360 - 180
            h = geohash(lat, lng, len(cell))
            if h != cell and h not in res:
                res.append(h)
    return res


class GeoIndex:
    """In-memory point index. Bounding-box prefilter, then haversine."""

    def __init__(self) -> None:
        self._pts: dict[str, tuple[float, float, str]] = {}

    def add(self, cluster_id: str, lat: float, lng: float, category: str = "") -> None:
        self._pts[cluster_id] = (lat, lng, category)

    def remove(self, cluster_id: str) -> None:
        self._pts.pop(cluster_id, None)

    def clear(self) -> None:
        self._pts.clear()

    def __len__(self) -> int:
        return len(self._pts)

    def query(self, lat: float, lng: float, radius_m: float, category: str | None = None) -> list[str]:
        """Ids within radius_m, nearest first."""
        dlat = math.degrees(radius_m / EARTH_R)
        dlng = dlat / max(0.01, math.cos(math.radians(lat)))
        hits = []
        for cid, (plat, plng, cat) in self._pts.items():
            if abs(plat - lat) > dlat or abs(plng - lng) > dlng:
                continue
            if category and cat != category:
                continue
            d = haversine_m(lat, lng, plat, plng)
            if d <= radius_m:
                hits.append((d, cid))
        hits.sort()
        return [cid for _, cid in hits]
