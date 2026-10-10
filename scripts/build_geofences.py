"""One-off build of the geofence data. Run once; outputs are committed, the app never needs the network.

  data/seed/neighborhoods.geojson  KCMO neighborhood borders (data.kcmo.org vq6h-tqrf), simplified, each tagged with
                                   its council district (data.kcmo.org 5qar-bf4m, by centroid-in-polygon)
  data/seed/zones.json             schools (150 m) and hospitals (250 m) from OpenStreetMap (Overpass), plus a few
                                   approximate arterial points (100 m) carried over from data/seed/pois.json

Usage: python scripts/build_geofences.py
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / "data" / "seed"
UA = {"User-Agent": "CivicFlow-hackathon/1.0 (build_geofences.py)"}
BBOX = "38.82,-94.77,39.37,-94.36"
CENTER = (39.06, -94.58)
TOL_M = 20.0
M_LAT = 111_320.0


def get(url: str, **kw):
    r = httpx.get(url, headers=UA, timeout=90, follow_redirects=True, **kw)
    r.raise_for_status()
    return r


def dp(pts: list, tol: float, kx: float) -> list:
    """Douglas-Peucker on [lng, lat] points (iterative), tolerance in meters."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a][0] * kx, pts[a][1] * M_LAT
        bx, by = pts[b][0] * kx, pts[b][1] * M_LAT
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        far, fd = -1, tol
        for i in range(a + 1, b):
            px, py = pts[i][0] * kx, pts[i][1] * M_LAT
            if L2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > fd:
                far, fd = i, d
        if far >= 0:
            keep[far] = True
            stack += [(a, far), (far, b)]
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(ring: list) -> list | None:
    kx = M_LAT * math.cos(math.radians(ring[0][1]))
    s = dp(ring, TOL_M, kx)
    s = [[round(p[0], 5), round(p[1], 5)] for p in s]
    out = [s[0]]
    for p in s[1:]:
        if p != out[-1]:
            out.append(p)
    if out[0] != out[-1]:
        out.append(out[0])
    return out if len(out) >= 4 else None


def simplify_geom(g: dict) -> dict | None:
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    res = []
    for rings in polys:
        outer = simplify_ring(rings[0])
        if not outer:
            continue
        holes = [h for h in (simplify_ring(r) for r in rings[1:]) if h]
        res.append([outer] + holes)
    if not res:
        return None
    return {"type": "Polygon", "coordinates": res[0]} if len(res) == 1 else {"type": "MultiPolygon", "coordinates": res}


def in_ring(x, y, ring):
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi, xj, yj = ring[i][0], ring[i][1], ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def in_geom(x, y, g) -> bool:
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    return any(in_ring(x, y, p[0]) and not any(in_ring(x, y, h) for h in p[1:]) for p in polys)


def centroid_of_largest(g) -> tuple[float, float]:
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    best, ba = None, -1.0
    for p in polys:
        r = p[0]
        a = cx = cy = 0.0
        for i in range(len(r) - 1):
            cr = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
            a += cr
            cx += (r[i][0] + r[i + 1][0]) * cr
            cy += (r[i][1] + r[i + 1][1]) * cr
        if abs(a) > ba and a != 0:
            ba, best = abs(a), (cx / (3 * a), cy / (3 * a), p)
    return best[0], best[1], best[2]


def build_neighborhoods() -> tuple[list, str]:
    nb = get("https://data.kcmo.org/resource/vq6h-tqrf.geojson", params={"$limit": 1000}).json()["features"]
    districts = []
    try:
        for f in get("https://data.kcmo.org/resource/5qar-bf4m.geojson", params={"$limit": 100}).json()["features"]:
            districts.append((f["properties"].get("dist_id"), f["geometry"]))
    except Exception as e:
        print("council districts unavailable:", type(e).__name__)
    feats, with_d = [], 0
    for f in nb:
        g = f.get("geometry")
        name = (f.get("properties") or {}).get("nbhname")
        if not g or not name:
            continue
        cx, cy, outer = centroid_of_largest(g)
        d = None
        ring0 = outer[0]
        pts = [(cx, cy)] + [(p[0], p[1]) for p in ring0[:: max(1, len(ring0) // 25)]]
        votes: dict = {}
        for i, (x, y) in enumerate(pts):
            for did, dg in districts:
                if in_geom(x, y, dg):
                    votes[did] = votes.get(did, 0) + (3 if i == 0 else 1)   # centroid counts more than a vertex
                    break
        if votes:
            d = f"District {max(votes, key=votes.get)}"
            with_d += 1
        sg = simplify_geom(g)
        if sg:
            feats.append({"type": "Feature", "properties": {"name": name.strip(), "district": d}, "geometry": sg})
    note = (f"{len(feats)} neighborhoods (data.kcmo.org vq6h-tqrf), {with_d} with a real council district "
            f"(data.kcmo.org 5qar-bf4m, {len(districts)} districts)")
    return feats, note


def build_zones(feats: list) -> tuple[list, str]:
    q = ('[out:json][timeout:60];(nwr["amenity"="school"]["name"](%s);nwr["amenity"="hospital"]["name"](%s););'
         'out center tags;' % (BBOX, BBOX))
    els = None
    for url in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter") * 2:
        try:
            els = httpx.post(url, data={"data": q}, headers={**UA, "Accept": "application/json"}, timeout=150).json()["elements"]
            break
        except Exception as e:
            print("overpass", url, type(e).__name__)
    if els is None:
        raise SystemExit("Overpass unavailable; zones.json not written")
    from backend.engine import geofence as gf   # inside-test uses the real polygons we just built
    (OUT / "neighborhoods.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")), encoding="utf-8")
    gf.reload()
    schools, hospitals, seen = [], [], set()
    for e in els:
        t = e.get("tags", {})
        lat = e.get("lat") or (e.get("center") or {}).get("lat")
        lng = e.get("lon") or (e.get("center") or {}).get("lon")
        if lat is None or lng is None or not t.get("name"):
            continue
        key = (t["name"].lower(), round(lat, 3), round(lng, 3))
        if key in seen or not gf.locate(lat, lng)["in_service_area"]:
            continue
        seen.add(key)
        kind = t.get("amenity")
        rec = {"type": kind, "name": t["name"], "lat": round(lat, 5), "lng": round(lng, 5),
               "radius_m": 250 if kind == "hospital" else 150}
        (hospitals if kind == "hospital" else schools).append(rec)
    schools.sort(key=lambda z: (z["lat"] - CENTER[0]) ** 2 + ((z["lng"] - CENTER[1]) * 0.78) ** 2)
    n_all = len(schools)
    schools = schools[:150]
    arterials = []
    try:
        for p in json.loads((OUT / "pois.json").read_text(encoding="utf-8")):
            if p.get("kind") == "arterial":
                arterials.append({"type": "arterial", "name": p["name"], "lat": p["lat"], "lng": p["lng"],
                                  "radius_m": 100, "approximate": True})
    except Exception:
        pass
    note = (f"{len(schools)} schools (of {n_all} named in KC, nearest the city center kept) + {len(hospitals)} hospitals "
            f"from OpenStreetMap/Overpass; {len(arterials)} approximate arterial points from pois.json")
    return hospitals + schools + arterials, note


def main() -> None:
    feats, n1 = build_neighborhoods()
    print(n1)
    if not feats:
        raise SystemExit("no neighborhoods; keeping existing files")
    zones, n2 = build_zones(feats)
    print(n2)
    (OUT / "zones.json").write_text(json.dumps(zones, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    for n in ("neighborhoods.geojson", "zones.json"):
        print(n, (OUT / n).stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
