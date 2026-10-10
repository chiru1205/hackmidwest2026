"""Seed data: simulated clusters, the 211-reporter hotspot, and leaderboard users."""
from __future__ import annotations

import json
import logging
import random
from datetime import datetime, timedelta, timezone

from contracts.models import Cluster, Report
from backend.engine import priority

from . import adapters, config, edge, places, store

log = logging.getLogger("civicflow.seed")

SEED_USERS = [
    ("Maria G.", "Plaza"), ("Devon T.", "Westport"), ("Priya S.", "Midtown"), ("Marcus L.", "Crossroads"),
    ("Aisha K.", "Brookside"), ("Tom B.", "Waldo"), ("Jenna R.", "River Market"), ("Carlos M.", "Plaza"),
    ("Hannah W.", "Westport"), ("Luis P.", "Midtown"), ("Grace O.", "Brookside"), ("Sam D.", "Crossroads"),
    ("Nina V.", "Waldo"), ("Ethan C.", "Plaza"), ("Olivia F.", "River Market"), ("Jamal H.", "Westport"),
    ("Sofia R.", "Midtown"), ("Ben A.", "Crossroads"), ("Mei L.", "Brookside"), ("Raj P.", "Waldo"),
    ("Chloe N.", "Plaza"), ("Dan K.", "River Market"), ("Fatima Z.", "Westport"), ("Walt J.", "Midtown"),
    ("Ivy S.", "Crossroads"),
]
OTHER_CATS = ["streetlight_out", "sidewalk_damage", "manhole_cover", "road_debris", "graffiti", "illegal_dumping",
              "downed_tree", "flooding", "traffic_signal"]
HOTSPOT = (39.0420, -94.5950)
POTHOLE_PICS = [f"/photos/seed/pothole_{i:02d}.jpg" for i in range(1, 15)]
AFTER_PICS = [f"/photos/seed/after_{i:02d}.jpg" for i in range(1, 7)]
OTHER_PICS = {"manhole_cover": "/photos/seed/manhole_01.jpg", "sidewalk_damage": "/photos/seed/sidewalk_01.jpg",
              "road_debris": "/photos/seed/debris_01.jpg"}


def _load_points() -> list[dict]:
    try:
        raw = json.loads((config.SEED_DIR / "kc_potholes.json").read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            raw = next((v for v in raw.values() if isinstance(v, list)), [])
        pts = []
        for p in raw:
            lat, lng = p.get("lat", p.get("latitude")), p.get("lng", p.get("longitude"))
            if lat is not None and lng is not None:
                pts.append({"lat": float(lat), "lng": float(lng), "address": places.clean_address(p.get("address")),
                            "neighborhood": p.get("neighborhood")})
        if pts:
            return pts
    except Exception as e:
        log.info("seed points missing (%s); generating synthetic", e)
    rnd = random.Random(7)
    return [{"lat": 39.05 + rnd.uniform(-0.07, 0.08), "lng": -94.58 + rnd.uniform(-0.05, 0.05),
             "address": None, "neighborhood": None} for _ in range(60)]


DUE_DAYS = {"P1": 2, "P2": 5, "P3": 10, "P4": 14}
OVERDUE = {5, 17, 33}
FIXED = {2, 9, 14, 26, 41, 50}
IN_PROGRESS = {3, 7, 11, 19, 22, 30, 38, 46}


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def is_empty() -> bool:
    return not store.q("SELECT 1 FROM clusters LIMIT 1") and not store.q("SELECT 1 FROM users LIMIT 1")


def seed(n_clusters: int = 60) -> None:
    rnd = random.Random(42)
    now = datetime.now(timezone.utc)
    store.ensure_user("u_you", "You", "Plaza")

    user_ids = []
    for i, (name, hood) in enumerate(SEED_USERS):
        uid = f"u_seed{i + 1}"
        user_ids.append(uid)
        xp_ = max(40, int(3200 * (0.86 ** i)) + rnd.randint(0, 60))
        store.ensure_user(uid, name, hood)
        rep = max(2, xp_ // 60)
        store.x("UPDATE users SET xp=?, reports=?, confirmations=?, fixed=?, streak_weeks=? WHERE id=?",
                (xp_, rep, rep * 2, rep // 4, rnd.randint(0, 9), uid))

    pts = _load_points()
    rnd.shuffle(pts)
    pts = pts[:n_clusters]
    total_reporters = 0
    specs = [{"p": p, "hot": False} for p in pts]
    specs.insert(0, {"p": {"lat": HOTSPOT[0], "lng": HOTSPOT[1], "address": "Country Club Plaza, Wornall Rd",
                           "neighborhood": "Plaza"}, "hot": True})

    for k, s in enumerate(specs):
        p, hot = s["p"], s["hot"]
        cat = "pothole" if hot or rnd.random() < 0.65 else rnd.choice(OTHER_CATS)
        lat, lng = p["lat"], p["lng"]
        if cat != "pothole" and not hot:
            lat += rnd.uniform(-0.0003, 0.0003)
            lng += rnd.uniform(-0.0003, 0.0003)
        reporters = 211 if hot else rnd.choice([1, 1, 1, 2, 3, 4, 6, 9, 14, 25, 48, 90])
        age_d = 1.0 if hot else rnd.uniform(0.3, 5)
        first = now - timedelta(days=age_d)
        sev = 4 if hot else rnd.choice([1, 2, 3, 3, 3, 4, 4, 5])
        hazard = True if hot else (sev >= 4 and rnd.random() < 0.4)
        c = Cluster(
            id="c_hotspot" if hot else f"c_seed{k:03d}", category=cat, lat=lat, lng=lng, severity=sev,
            is_hazard=hazard,
            hazard_description=("Deep pothole next to a school crossing; drivers swerve into the bike lane."
                                if hot else ("Reported as a safety hazard" if hazard else "")),
            reporter_count=reporters, report_count=reporters + (rnd.randint(0, 5) if not hot else 40),
            location_crit=0.8 if hot else places.location_crit(lat, lng),
            neighborhood=p.get("neighborhood") or places.neighborhood_for(lat, lng),
            address=p.get("address") or places.address_for(lat, lng), simulated=True,
            first_reported_at=_iso(first), last_reported_at=_iso(now - timedelta(minutes=rnd.randint(1, 600))))
        c.priority, c.bucket = priority.compute_priority(c, now)
        sla = DUE_DAYS[c.bucket]
        if hot:
            age_d = sla - 1.2                      # due in about 29 hours
        elif k in OVERDUE:
            age_d = sla + rnd.uniform(0.6, 1.8)    # deliberately overdue
        else:
            age_d = min(rnd.uniform(0.4, 6.0), sla - rnd.uniform(0.8, 1.0)) if sla > 1.8 else rnd.uniform(0.3, 1.0)
            age_d = max(age_d, 0.3, sla - 8.5)
        first = now - timedelta(days=age_d)
        c.first_reported_at = _iso(first)
        c.rationale = adapters.template_rationale(c)
        c.vendor = adapters.pick_vendor(cat)
        c.status = "assigned"
        t = adapters.create_ticket(c, adapters.ticket_title(c), adapters.ticket_body(c), c.vendor)
        c.ticket_id = t.id
        fixed_at = None
        if not hot and k in FIXED:
            adapters.set_stage(t.id, "work_in_progress")
            adapters.set_stage(t.id, "resolved")
            c.status = "fixed"
            fixed_at = now - timedelta(days=rnd.uniform(0.2, 2.5))
            c.fixed_at = _iso(fixed_at)
        elif not hot and k in IN_PROGRESS:
            adapters.set_stage(t.id, "work_in_progress")
            c.status = "in_progress"
        if hot:
            c.photo_url = POTHOLE_PICS[0]
        elif cat == "pothole" and rnd.random() < 0.8:
            c.photo_url = POTHOLE_PICS[1 + (k % 13)]
        elif cat in OTHER_PICS and rnd.random() < 0.7:
            c.photo_url = OTHER_PICS[cat]
        store.save_cluster(c)
        tl = [{"ts": _iso(first), "label": "Reported", "detail": f"{reporters} reporters (seeded)"},
              {"ts": _iso(first + timedelta(minutes=rnd.randint(3, 40))), "label": "Ticket created",
               "detail": f"{t.id} assigned to {c.vendor}"}]
        if c.status in ("in_progress", "fixed"):
            tl.append({"ts": _iso(first + timedelta(hours=rnd.uniform(6, 20))), "label": "Work started", "detail": ""})
        if fixed_at is not None:
            after_url = AFTER_PICS[k % len(AFTER_PICS)]
            tl.append({"ts": _iso(fixed_at), "label": "Fixed by vendor", "detail": f"After photo: {after_url}"})
        store.meta_set(f"tl:{c.id}", json.dumps(tl))
        n_rep = 20 if hot else 1
        for i in range(n_rep):
            uid = user_ids[i % len(user_ids)] if hot else rnd.choice(user_ids)
            store.insert_report(Report(
                id=f"r_{c.id}_{i}", cluster_id=c.id, user_id=uid, lat=lat, lng=lng, category=cat,
                note="seeded", kind="first" if i == 0 else "confirm", simulated=True,
                created_at=_iso(first + timedelta(minutes=i * 7))))
        total_reporters += reporters

    store.counters.update({"total_reports": total_reporters + 40,
                           "duplicates_absorbed": total_reporters + 40 - len(specs),
                           "llm_calls_avoided": total_reporters + 40 - len(specs)})
    store.persist_counters()
    edge.warm()
    log.info("seeded %d clusters, %d users", len(specs), len(SEED_USERS))
