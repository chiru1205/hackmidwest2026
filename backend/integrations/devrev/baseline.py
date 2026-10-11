"""Demo baseline for the DevRev Workflow board (data/seed/devrev_plan.json).
Used by Admin Reset (background thread) and by scripts/devrev_prefill.py (--apply / --restore).
Safety: only external_refs listed in the plan are ever read or written; every DevRev failure is logged and swallowed."""
from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path

from . import _conn, _lock, live

log = logging.getLogger("civicflow.devrev.baseline")
PLAN_PATH = Path(__file__).resolve().parents[3] / "data" / "seed" / "devrev_plan.json"
DEVREV_STAGE = {"queued": "queued", "assigned": "queued", "in_progress": "work_in_progress",
                "awaiting_verification": "work_in_progress", "resolved": "resolved"}
PACE_S = 0.4


def load_plan() -> list[dict]:
    try:
        return list(json.loads(PLAN_PATH.read_text(encoding="utf-8")).get("tickets", []))
    except Exception as e:
        log.warning("devrev plan unreadable: %s", type(e).__name__)
        return []


def planned_refs() -> set[str]:
    return {t["cluster_id"] for t in load_plan()}


def existing(refs: list[str]) -> dict[str, dict]:
    """external_ref -> {id, display_id, stage, severity} for planned refs only (one works.list call)."""
    allowed = planned_refs()
    refs = [r for r in refs if r in allowed]
    if not refs or not live.configured():
        return {}
    s, j = live._post("works.list", {"external_ref": refs, "type": ["ticket"], "limit": 100}, timeout=12.0)
    if s != 200:
        return {}
    return {w["external_ref"]: {**live._brief(w), "severity": w.get("severity")}
            for w in j.get("works", []) if w.get("external_ref") in refs}


def restore(only: list[str] | None = None, pace: float = PACE_S, say=print) -> dict:
    """Set the DevRev stage and severity of EXISTING planned tickets back to the baseline. Never creates tickets."""
    plan = [t for t in load_plan() if not only or t["cluster_id"] in only]
    out = {"checked": 0, "updated": 0, "missing": 0, "failed": 0}
    if not live.configured():
        return out
    have = existing([t["cluster_id"] for t in plan])
    for t in plan:
        out["checked"] += 1
        w = have.get(t["cluster_id"])
        if not w:
            out["missing"] += 1
            continue
        want = DEVREV_STAGE.get(t["stage"], "queued")
        fields = {}
        if w["stage"] != want:
            fields["stage"] = want
        if t.get("severity") and w.get("severity") != t["severity"]:
            fields["severity"] = t["severity"]
        if not fields:
            continue
        time.sleep(pace)
        if live.update_work(w["id"], **fields):
            out["updated"] += 1
            say(f"  restored {t['cluster_id']} ({w['display_id']}): {fields}")
        else:
            out["failed"] += 1
    return out


def apply_local_flags(only: list[str] | None = None) -> None:
    """Local flags that go with the baseline (awaiting_verification), and the DevRev stage we just wrote
    so the poller does not treat it as an outside change."""
    from . import events
    plan = {t["cluster_id"]: t for t in load_plan()}
    have = existing(list(plan))  # planned tickets that exist in DevRev (created by the prefill script or an earlier run)
    c = _conn()
    try:
        rows = c.execute("SELECT id, cluster_id FROM tickets").fetchall()
    finally:
        c.close()
    for r in rows:
        t = plan.get(r["cluster_id"]) if not only or r["cluster_id"] in only else None
        if not t:
            continue
        events.set_meta(r["id"], awaiting=(t["stage"] == "awaiting_verification"), escalated=False)
        stage = DEVREV_STAGE.get(t["stage"], "queued")
        w = have.get(r["cluster_id"])
        with _lock:
            cc = _conn()
            try:
                if w:  # link this local ticket to its DevRev ticket (the vendor list and the poller need the link)
                    cc.execute("UPDATE tickets SET devrev_id=?, devrev_display=?, devrev_stage=? WHERE id=?",
                               (w["id"], w.get("display_id"), stage, r["id"]))
                else:
                    cc.execute("UPDATE tickets SET devrev_stage=? WHERE id=? AND devrev_id IS NOT NULL", (stage, r["id"]))
                cc.commit()
            finally:
                cc.close()


def _wait_mirrored(refs: list[str], timeout: float = 20.0) -> None:
    """The hotspot is mirrored by a background create right after the reseed; wait for it so the two do not race."""
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        c = _conn()
        try:
            rows = c.execute("SELECT cluster_id, devrev_id FROM tickets WHERE cluster_id IN (%s)" %
                             ",".join("?" * len(refs)), refs).fetchall()
        finally:
            c.close()
        if rows and all(r["devrev_id"] for r in rows):
            return
        time.sleep(0.5)


def restore_after_reset() -> None:
    try:
        if not live.configured():
            return
        _wait_mirrored(["c_hotspot"])
        res = restore(say=lambda *_: None)
        apply_local_flags()
        from . import board
        board.invalidate()
        log.info("devrev baseline restored after reset: %s", res)
    except Exception as e:
        log.warning("devrev baseline restore failed: %s", type(e).__name__)


def schedule_restore() -> None:
    """Called by Admin Reset after the local reseed. Returns at once."""
    if live.configured():
        threading.Thread(target=restore_after_reset, daemon=True, name="devrev-baseline").start()
