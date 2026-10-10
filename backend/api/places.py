"""Neighborhood, address and location criticality helpers."""
from __future__ import annotations

import json
import re

from backend.engine import geofence
from backend.engine.geo import haversine_m

from . import config

NEIGHBORHOODS = {
    "Westport": (39.0530, -94.5970), "Crossroads": (39.0830, -94.5800), "Plaza": (39.0420, -94.5950),
    "River Market": (39.1100, -94.5810), "Brookside": (38.9980, -94.5930), "Waldo": (38.9880, -94.5930),
    "Midtown": (39.0700, -94.5850),
}
_pois: list[dict] | None = None


def neighborhood_for(lat: float, lng: float) -> str:
    """Real KCMO neighborhood polygon when the point is inside one; nearest of a short list otherwise."""
    try:
        name = geofence.locate(lat, lng)["neighborhood"]
        if name:
            return name
    except Exception:
        pass
    return min(NEIGHBORHOODS, key=lambda n: haversine_m(lat, lng, *NEIGHBORHOODS[n]))


def pois() -> list[dict]:
    global _pois
    if _pois is None:
        try:
            raw = json.loads((config.SEED_DIR / "pois.json").read_text(encoding="utf-8"))
            _pois = raw if isinstance(raw, list) else next((v for v in raw.values() if isinstance(v, list)), [])
        except Exception:
            _pois = []
    return _pois


def location_crit(lat: float, lng: float) -> float:
    best = 0.2
    for p in pois():
        try:
            d = haversine_m(lat, lng, float(p["lat"]), float(p["lng"]))
        except Exception:
            continue
        kind = str(p.get("kind", ""))
        if kind in ("school", "hospital") and d <= 200:
            return 1.0
        if kind in ("arterial", "road") and d <= 100:
            best = max(best, 0.8)
    try:
        best = max(best, geofence.criticality(geofence.zones_at(lat, lng)))
    except Exception:
        pass
    return best


def apply_geo(c) -> None:
    """Fill a cluster's neighborhood, district and zones from the geofence and raise location_crit to the zone boost.
    Never lowers location_crit. Safe to call repeatedly."""
    try:
        loc = geofence.locate(c.lat, c.lng)
        hits = geofence.zones_at(c.lat, c.lng) if loc["in_service_area"] else []
    except Exception:
        return
    if not loc["in_service_area"]:          # only reachable through the demo override: never invent a KC neighborhood
        if geofence.available():
            c.neighborhood, c.district, c.zones = None, None, []
        return
    if loc["neighborhood"]:
        c.neighborhood = loc["neighborhood"]
    if loc["district"]:
        c.district = loc["district"]
    c.zones = geofence.zone_labels(hits)
    c.location_crit = max(c.location_crit, geofence.criticality(hits))


_ZONE_PHRASE = {"School zone": "inside a school zone", "Hospital zone": "inside a hospital zone",
                "Arterial corridor": "on an arterial corridor"}


def zone_phrases(zones: list[str]) -> list[str]:
    out = []
    for z in zones:
        kind, _, name = z.partition(": ")
        out.append(f"{_ZONE_PHRASE.get(kind, 'inside a priority zone')}: {name}" if name else z)
    return out


def rationale_with_zones(base: str, c) -> str:
    """Append the zone mention(s) to a template rationale ('... open 1 day.' -> '..., inside a school zone: X, open 1 day.')."""
    ph = zone_phrases(getattr(c, "zones", None) or [])
    if not ph:
        return base
    first = base.rstrip(".")
    return first + ", " + "; ".join(ph) + "."


_SUFFIX = {"ave", "st", "blvd", "rd", "dr", "ct", "ter", "ln", "pkwy", "way", "pl", "cir", "trfy", "hwy", "road",
           "street", "avenue", "drive", "court", "terrace", "lane", "trl", "sq", "expy", "pike"}
_DIR = {"n", "s", "e", "w", "ne", "nw", "se", "sw"}
_known: list[tuple[float, float, str]] = []


def clean_address(raw: str | None) -> str | None:
    """'9198 NW Skyview Ave SIGN Kansas City 64154' -> '9198 NW Skyview Ave'."""
    if not raw:
        return None
    t = re.sub(r"Kansas City.*$", "", str(raw), flags=re.I)
    t = re.sub(r"\d{5}(-\d{4})?", "", t).replace(",", " ")
    toks = t.split()
    if not toks:
        return None
    cut = len(toks)
    for i, tok in enumerate(toks[1:], 1):
        if tok.lower().strip(".") in _SUFFIX:
            cut = i + 1
            break
    toks = toks[:cut]
    if cut == len(t.split()) and len(toks) > 4 and toks[-1].isupper():
        toks = toks[:-1]
    out = []
    for tok in toks:
        low = tok.lower().strip(".")
        if low in _DIR:
            out.append(low.upper())
        elif re.fullmatch(r"\d+(st|nd|rd|th)", low):
            out.append(low)
        else:
            out.append(tok.capitalize())
    return " ".join(out) or None


def register_known(pts: list[dict]) -> None:
    _known.clear()
    for p in pts:
        a = clean_address(p.get("address"))
        if a and p.get("lat") is not None:
            _known.append((float(p["lat"]), float(p["lng"]), a))


def address_for(lat: float, lng: float) -> str:
    if not _known:
        try:
            raw = json.loads((config.SEED_DIR / "kc_potholes.json").read_text(encoding="utf-8"))
            register_known(raw if isinstance(raw, list) else next((v for v in raw.values() if isinstance(v, list)), []))
        except Exception:
            pass
    best, bd = None, 200.0
    for la, ln, a in _known:
        d = haversine_m(lat, lng, la, ln)
        if d <= bd:
            best, bd = a, d
    if best:
        return f"{best}"
    try:
        loc = geofence.locate(lat, lng)
        if geofence.available() and not loc["in_service_area"]:
            return f"{lat:.5f}, {lng:.5f} (outside Kansas City)"
    except Exception:
        pass
    return f"{neighborhood_for(lat, lng)}, Kansas City"
