"""One-off: fetch real KCMO pothole 311 points into data/seed/kc_potholes.json (synthetic fallback)."""
import json, math, random
from pathlib import Path
import httpx

OUT = Path(__file__).resolve().parents[1] / "data" / "seed"
HOODS = {"Westport": (39.0525, -94.5970), "Crossroads": (39.0830, -94.5830), "Plaza": (39.0420, -94.5950),
         "River Market": (39.1090, -94.5780), "Brookside": (38.9920, -94.5900), "Waldo": (38.9760, -94.5940),
         "Midtown": (39.0700, -94.5830)}


def hood(lat, lng):
    return min(HOODS, key=lambda h: (HOODS[h][0] - lat) ** 2 + ((HOODS[h][1] - lng) * 0.78) ** 2)


def fetch():
    r = httpx.get("https://data.kcmo.org/resource/d4px-6rwg.json", timeout=40, params={
        "$limit": 700, "$where": "issue_type='A Pothole' AND latitude IS NOT NULL",
        "$select": "latitude,longitude,incident_address"})
    r.raise_for_status()
    pts = []
    for row in r.json():
        try:
            lat, lng = float(row["latitude"]), float(row["longitude"])
        except (KeyError, ValueError):
            continue
        if not (38.82 < lat < 39.37 and -94.77 < lng < -94.36):
            continue
        pts.append({"lat": round(lat, 6), "lng": round(lng, 6),
                    "address": row.get("incident_address", ""), "neighborhood": hood(lat, lng)})
    return pts[:450]


def synth():
    random.seed(7)
    pts = []
    for i in range(400):
        lat = 39.07 + random.uniform(-0.06, 0.04)
        lng = -94.585 + random.uniform(-0.05, 0.03)
        pts.append({"lat": round(lat, 6), "lng": round(lng, 6), "address": f"{100 + i} Synthetic St",
                    "neighborhood": hood(lat, lng), "synthetic": True})
    return pts


if __name__ == "__main__":
    try:
        pts = fetch()
        print("fetched real points:", len(pts))
        if len(pts) < 50:
            raise ValueError("too few")
    except Exception as e:
        print("fetch failed, using synthetic:", e)
        pts = synth()
    (OUT / "kc_potholes.json").write_text(json.dumps(pts, indent=1), encoding="utf-8")
