"""Profile, my reports, leaderboard, badges."""
from __future__ import annotations

from fastapi import APIRouter, Header

from contracts.models import Badge, Cluster, LeaderboardEntry, Profile
from backend.engine import xp

from .. import store

router = APIRouter()


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


@router.get("/me", response_model=Profile)
async def me(x_user_id: str = Header("u_you")):
    u = store.ensure_user(x_user_id)
    level, nxt = xp.level_for(u["xp"])
    return Profile(user_id=u["id"], name=u["name"], neighborhood=u["neighborhood"], xp=u["xp"], level=level,
                   next_level_xp=nxt, streak_weeks=u["streak_weeks"], reports=u["reports"],
                   confirmations=u["confirmations"], fixed=u["fixed"], badges=_badges(u))


@router.get("/me/reports", response_model=list[Cluster])
async def my_reports(x_user_id: str = Header("u_you")):
    rows = store.q("SELECT DISTINCT cluster_id FROM reports WHERE user_id=?", (x_user_id,))
    cs = [store.clusters[r["cluster_id"]] for r in rows if r["cluster_id"] in store.clusters]
    cs.sort(key=lambda c: c.last_reported_at, reverse=True)
    return cs


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(scope: str = "users", x_user_id: str = Header("u_you")):
    rows = store.q("SELECT * FROM users WHERE id NOT LIKE 'sim_%' ORDER BY xp DESC LIMIT 25")
    return [LeaderboardEntry(rank=i + 1, name=r["name"], xp=r["xp"], reports=r["reports"] + r["confirmations"],
                             neighborhood=r["neighborhood"] or "", is_you=r["id"] == x_user_id)
            for i, r in enumerate(rows)]
