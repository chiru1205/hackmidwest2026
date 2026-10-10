"""Profile, my reports/requests, leaderboard, badges. Everything here is scoped to the calling citizen."""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Header, HTTPException

from contracts.models import (Badge, CitizenDetected, CitizenRequest, CitizenTimelineItem, Cluster,
                              LeaderboardEntry, Profile)
from backend.engine import xp
from backend.integrations.devrev import events as dr_events

from .. import adapters, store

router = APIRouter()

DUE_DAYS = {"P1": 2, "P2": 5, "P3": 10, "P4": 14}
STAGE_LABEL = {"reported": "Reported", "assigned": "Crew assigned", "in_progress": "Work in progress",
               "awaiting_verification": "Awaiting verification", "fixed": "Fixed"}
MILESTONES = (2, 5, 10, 25, 50, 100, 250)


def _badges(u) -> list[Badge]:
    defs = [
        ("first_report", "First Report", "Filed your first report", u["reports"] >= 1),
        ("good_neighbor", "Good Neighbor", "Confirmed 5 issues", u["confirmations"] >= 5),
        ("eagle_eye", "Eagle Eye", "Added 3 photos", u["photos"] >= 3),
        ("fixer", "Difference Maker", "An issue you reported got fixed", u["fixed"] >= 1),
        ("streak", "On a Streak", "Active 3 weeks in a row", u["streak_weeks"] >= 3),
        ("watcher", "Watcher", "Reached 250 XP", u["xp"] >= 250),
    ]
    return [Badge(id=i, name=n, description=d, earned=bool(e)) for i, n, d, e in defs]


def _my_clusters(uid: str) -> list[Cluster]:
    rows = store.q("SELECT DISTINCT cluster_id FROM reports WHERE user_id=?", (uid,))
    cs = [store.clusters[r["cluster_id"]] for r in rows if r["cluster_id"] in store.clusters]
    cs.sort(key=lambda c: c.last_reported_at, reverse=True)
    return cs


def _status(c: Cluster) -> str:
    if c.status == "fixed":
        return "fixed"
    if c.ticket_id and dr_events.get_meta(c.ticket_id)["awaiting"]:
        return "awaiting_verification"
    if c.status == "reported" and c.vendor:
        return "assigned"
    return c.status


def _timeline(c: Cluster) -> list[CitizenTimelineItem]:
    """Derived from the stored cluster timeline; no other citizen's identity is ever included."""
    out = [CitizenTimelineItem(ts=c.first_reported_at, label="Reported")]
    seen: set[int] = set()
    for t in json.loads(store.meta_get(f"tl:{c.id}") or "[]"):
        label, detail = t.get("label", ""), t.get("detail", "")
        if label == "Reported":
            out[0] = CitizenTimelineItem(ts=t["ts"], label="Reported")
        elif label == "Confirmed by a neighbor" or label.startswith("Milestone:"):
            m = re.search(r"(\d+)\s+reporters", detail or label)
            n = int(m.group(1)) if m else 0
            if n in MILESTONES and n not in seen:
                seen.add(n)
                out.append(CitizenTimelineItem(ts=t["ts"], label="Neighbors joined",
                                               detail=f"{n} neighbors have reported this"))
        elif label == "Ticket created" and c.vendor:
            out.append(CitizenTimelineItem(ts=t["ts"], label="Crew assigned", detail=c.vendor))
        elif label in ("Work started", "Awaiting verification", "Fixed"):
            out.append(CitizenTimelineItem(ts=t["ts"], label=label))
    if c.vendor and not any(i.label == "Crew assigned" for i in out):
        out.append(CitizenTimelineItem(ts=c.first_reported_at, label="Crew assigned", detail=c.vendor))
    if c.status == "fixed" and not any(i.label == "Fixed" for i in out):
        out.append(CitizenTimelineItem(ts=c.fixed_at or c.last_reported_at, label="Fixed"))
    order = {"Reported": 0, "Neighbors joined": 1, "Crew assigned": 2}
    out.sort(key=lambda i: (i.ts, order.get(i.label, 3)))
    return out


def _due(c: Cluster) -> str | None:
    if c.status == "fixed":
        return None
    try:
        d = datetime.fromisoformat(c.first_reported_at.replace("Z", "+00:00")) + timedelta(days=DUE_DAYS[c.bucket])
    except Exception:
        return None
    return d.isoformat().replace("+00:00", "Z")


def _citizen_request(c: Cluster, uid: str) -> CitizenRequest:
    status = _status(c)
    label = adapters.LABELS.get(c.category, c.category)
    if c.address:
        title = f"{label} near {c.address}"
    elif c.neighborhood:
        title = f"{label} in {c.neighborhood}"
    else:
        title = label
    pts = store.q("SELECT COALESCE(SUM(points),0) AS p FROM ledger WHERE user_id=? AND cluster_id=?", (uid, c.id))
    tl = _timeline(c)
    return CitizenRequest(
        id=c.id, category=c.category, title=title, address=c.address, neighborhood=c.neighborhood,
        district=c.district, zones=list(c.zones or []), photo_url=c.photo_url, neighbors=max(1, c.reporter_count),
        status=status, stage_label=STAGE_LABEL[status], ticket_id=c.ticket_id, crew=c.vendor, due=_due(c),
        priority_bucket=c.bucket, rationale=c.rationale,
        detected=CitizenDetected(category=c.category, severity=c.severity, is_hazard=c.is_hazard,
                                 hazard_description=c.hazard_description),
        my_points=int(pts[0]["p"]) if pts else 0, created_at=c.first_reported_at,
        updated_at=max([c.last_reported_at] + [i.ts for i in tl]), timeline=tl)


@router.get("/me", response_model=Profile)
async def me(x_user_id: str = Header("u_you")):
    u = store.ensure_user(x_user_id)
    level, nxt = xp.level_for(u["xp"])
    return Profile(user_id=u["id"], name=u["name"], neighborhood=u["neighborhood"], xp=u["xp"], level=level,
                   next_level_xp=nxt, streak_weeks=u["streak_weeks"], reports=u["reports"],
                   confirmations=u["confirmations"], fixed=u["fixed"], badges=_badges(u))


@router.get("/me/reports", response_model=list[Cluster])
async def my_reports(x_user_id: str = Header("u_you")):
    return _my_clusters(x_user_id)


@router.get("/me/requests", response_model=list[CitizenRequest])
async def my_requests(x_user_id: str = Header("u_you")):
    return [_citizen_request(c, x_user_id) for c in _my_clusters(x_user_id)]


@router.get("/me/requests/{cluster_id}", response_model=CitizenRequest)
async def my_request(cluster_id: str, x_user_id: str = Header("u_you")):
    c = store.clusters.get(cluster_id)
    mine = store.q("SELECT 1 FROM reports WHERE user_id=? AND cluster_id=? LIMIT 1", (x_user_id, cluster_id))
    if c is None or not mine:
        raise HTTPException(404, "request not found")
    return _citizen_request(c, x_user_id)


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(scope: str = "users", x_user_id: str = Header("u_you")):
    rows = store.q("SELECT * FROM users WHERE id NOT LIKE 'sim_%' ORDER BY xp DESC LIMIT 25")
    return [LeaderboardEntry(rank=i + 1, name=r["name"], xp=r["xp"], reports=r["reports"] + r["confirmations"],
                             neighborhood=r["neighborhood"] or "", is_you=r["id"] == x_user_id)
            for i, r in enumerate(rows)]
