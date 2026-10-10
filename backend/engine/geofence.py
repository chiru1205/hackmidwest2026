"""Geofencing: real Kansas City, MO neighborhood polygons + council districts, and priority zones.

Pure Python (stdlib only). Data is loaded lazily, once, from data/seed/neighborhoods.geojson and zones.json
(built offline by scripts/build_geofences.py; nothing here touches the network).
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

SEED = Path(os.getenv("GEOFENCE_DIR") or Path(__file__).resolve().parents[2] / "data" / "seed")
EDGE_TOLERANCE_M = 30.0
BOOST = {"school": 1.0, "hospital": 1.0, "arterial": 0.8}
LABEL = {"school": "School zone", "hospital": "Hospital zone", "arterial": "Arterial corridor"}
OUTSIDE_MESSAGE = ("That spot is outside the Kansas City service area, so we can't route it to a city crew. "
                   "If you're demoing, use a Kansas City location.")

_hoods: list[dict] | None = None
_zones: list[dict] | None = None
_layers: dict | None = None
_M_LAT = 111_320.0


def _load() -> None:
    global _hoods, _zones
    if _hoods is not None:
        return
    hoods: list[dict] = []
    try:
        gj = json.loads((SEED / "neighborhoods.geojson").read_text(encoding="utf-8"))
        for f in gj.get("features", []):
            g, p = f.get("geometry") or {}, f.get("properties") or {}
            polys = g.get("coordinates", []) if g.get("type") == "MultiPolygon" else (
                [g["coordinates"]] if g.get("type") == "Polygon" else [])
            for rings in polys:
                if not rings:
                    continue
                outer = rings[0]
                xs, ys = [c[0] for c in outer], [c[1] for c in outer]
                hoods.append({"name": p.get("name"), "district": p.get("district"), "rings": rings,
                              "bbox": (min(xs), min(ys), max(xs), max(ys))})
    except Exception:
        hoods = []
    zones: list[dict] = []
    try:
        for z in json.loads((SEED / "zones.json").read_text(encoding="utf-8")):
            if z.get("type") in BOOST:
                zones.append(z)
    except Exception:
        zones = []
    _zones, _hoods = zones, hoods


def reload() -> None:
    global _hoods, _zones, _layers
    _hoods = _zones = _layers = None


def _in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _in_poly(x: float, y: float, rings: list) -> bool:
    if not _in_ring(x, y, rings[0]):
        return False
    return not any(_in_ring(x, y, h) for h in rings[1:])


def _edge_dist_m(lat: float, lng: float, ring: list) -> float:
    """Distance in meters from a point to a ring's edges (local planar approximation)."""
    kx = _M_LAT * math.cos(math.radians(lat))
    px, py = lng * kx, lat * _M_LAT
    best = float("inf")
    for i in range(len(ring) - 1):
        ax, ay = ring[i][0] * kx, ring[i][1] * _M_LAT
        bx, by = ring[i + 1][0] * kx, ring[i + 1][1] * _M_LAT
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
        d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
        if d < best:
            best = d
    return best


def locate(lat: float, lng: float) -> dict:
    """-> {"in_service_area", "neighborhood", "district"}. A point within ~30 m of a polygon edge counts as inside."""
    _load()
    for h in _hoods or []:
        x0, y0, x1, y1 = h["bbox"]
        if x0 <= lng <= x1 and y0 <= lat <= y1 and _in_poly(lng, lat, h["rings"]):
            return {"in_service_area": True, "neighborhood": h["name"], "district": h["district"]}
    pad_y = EDGE_TOLERANCE_M / _M_LAT
    pad_x = EDGE_TOLERANCE_M / (_M_LAT * max(0.2, math.cos(math.radians(lat))))
    best, bd = None, EDGE_TOLERANCE_M
    for h in _hoods or []:
        x0, y0, x1, y1 = h["bbox"]
        if x0 - pad_x <= lng <= x1 + pad_x and y0 - pad_y <= lat <= y1 + pad_y:
            d = min(_edge_dist_m(lat, lng, r) for r in h["rings"][:1])
            if d <= bd:
                best, bd = h, d
    if best is not None:
        return {"in_service_area": True, "neighborhood": best["name"], "district": best["district"]}
    return {"in_service_area": False, "neighborhood": None, "district": None}


def _hav(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * 6371000.0 * math.asin(math.sqrt(a))


def zones_at(lat: float, lng: float) -> list[dict]:
    """Zones whose circle contains the point, nearest first: {type,name,distance_m,radius_m,boost}."""
    _load()
    out = []
    for z in _zones or []:
        if abs(z["lat"] - lat) > 0.005 or abs(z["lng"] - lng) > 0.007:    # ~550 m cheap prefilter
            continue
        d = _hav(lat, lng, z["lat"], z["lng"])
        if d <= z["radius_m"]:
            out.append({"type": z["type"], "name": z["name"], "distance_m": int(round(d)),
                        "radius_m": int(z["radius_m"]), "boost": BOOST[z["type"]]})
    out.sort(key=lambda h: h["distance_m"])
    return out


def criticality(zones: list[dict]) -> float:
    """Zone contribution to the priority location criticality L (0.0 when no zone applies)."""
    return max((float(z.get("boost", 0.0)) for z in zones), default=0.0)


def zone_label(z: dict) -> str:
    return f"{LABEL.get(z['type'], 'Zone')}: {z['name']}"


def zone_labels(zones: list[dict]) -> list[str]:
    return [zone_label(z) for z in zones]


def geofence(lat: float, lng: float) -> dict:
    """The GET /api/geofence payload."""
    loc = locate(lat, lng)
    zones = zones_at(lat, lng) if loc["in_service_area"] else []
    return {**loc, "zones": zones, "message": None if loc["in_service_area"] else OUTSIDE_MESSAGE}


def layers() -> dict:
    """The GET /api/geofence/layers payload (cached)."""
    global _layers
    if _layers is None:
        _load()
        try:
            gj = json.loads((SEED / "neighborhoods.geojson").read_text(encoding="utf-8"))
        except Exception:
            gj = {"type": "FeatureCollection", "features": []}
        _layers = {"neighborhoods": gj,
                   "zones": [{"type": z["type"], "name": z["name"], "lat": z["lat"], "lng": z["lng"],
                              "radius_m": int(z["radius_m"])} for z in (_zones or [])]}
    return _layers


def available() -> bool:
    _load()
    return bool(_hoods)
