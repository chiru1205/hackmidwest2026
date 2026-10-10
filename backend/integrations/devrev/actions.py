"""Board actions: start, request_verification, approve, escalate, reopen.
Rule: DevRev is written first; if that fails nothing local changes and a clear error comes back."""
from __future__ import annotations

import asyncio
import logging

from . import board, events, live, set_devrev_stage_seen, set_severity

log = logging.getLogger("civicflow.devrev.actions")
LADDER = ("low", "medium", "high", "blocker")
ACTIONS = ("start", "request_verification", "approve", "escalate", "reopen")


# ---------------------------------------------------------------- pure rules
def next_severity(sev: str) -> str | None:
    """One level up the ladder; None when already at the top (or unknown)."""
    if sev not in LADDER:
        return None
    i = LADDER.index(sev)
    return LADDER[i + 1] if i + 1 < len(LADDER) else None


def check_transition(action: str, key: str, severity: str = "medium", has_evidence: bool = False) -> str | None:
    """Return a short human error, or None when the action is allowed from this stage key."""
    if action not in ACTIONS:
        return "Unknown action"
    if action == "start":
        if key in ("queued", "assigned"):
            return None
        return "Work already started" if key in ("in_progress", "awaiting_verification") else "Ticket is already resolved"
    if action == "request_verification":
        if key == "in_progress":
            return None
        return "Already awaiting verification" if key == "awaiting_verification" else "Start work before requesting verification"
    if action == "approve":
        if key == "resolved":
            return "Ticket is already resolved"
        if key not in ("in_progress", "awaiting_verification"):
            return "Start work before approving"
        return None if has_evidence else "Add an after-photo or a note as evidence before resolving"
    if action == "escalate":
        if key == "resolved":
            return "Resolved tickets cannot be escalated"
        return None if next_severity(severity) else "Already at the highest severity"
    if action == "reopen":
        return None if key in ("resolved", "awaiting_verification") else "Only resolved or awaiting-verification tickets can be reopened"
    return "Unknown action"


# ---------------------------------------------------------------- execution
def _fail(msg: str) -> dict:
    return {"ok": False, "ticket": None, "error": msg}


async def run(cf_id: str, action: str, note: str | None) -> dict:
    from backend.api import adapters, events as sse, pipeline

    note = (note or "").strip() or None
    if action not in ACTIONS:
        return _fail("Unknown action")
    cw = await asyncio.to_thread(board.current_work, cf_id)
    if cw is None:
        return _fail("Ticket not found")
    row, cluster, work = cw
    meta = events.get_meta(cf_id)
    key = board.stage_key(work["stage"], bool(cluster.vendor) and cluster.status == "assigned", meta["awaiting"])
    if key is None:
        return _fail("This ticket is canceled in DevRev")
    sev = work["severity"] if work["severity"] in LADDER else "medium"
    evidence = meta["evidence"] + (1 if board.fix_photo_exists(cluster.id) else 0) + (1 if note else 0)
    err = check_transition(action, key, sev, evidence > 0)
    if err:
        return _fail(err)

    drid, disp = work.get("devrev_id"), work.get("display") or cf_id
    use_dr = bool(drid) and live.configured()
    stage_to = {"start": "work_in_progress", "approve": "resolved", "reopen": "queued"}.get(action)
    new_sev = next_severity(sev) if action == "escalate" else None
    say = {"start": f"{disp}: work started",
           "request_verification": f"{disp}: awaiting verification",
           "approve": f"{disp}: approved and resolved",
           "escalate": f"{disp}: escalated {sev} to {new_sev}",
           "reopen": f"{disp}: reopened"}[action]
    kind = {"start": "stage", "request_verification": "verification", "approve": "resolved",
            "escalate": "escalated", "reopen": "reopened"}[action]
    comment_text = f"Civic Flow: {say.split(': ', 1)[1]}" + (f". Note: {note}" if note else "")

    commented = False
    if use_dr:
        if stage_to or new_sev:
            ok = await asyncio.to_thread(lambda: live.update_work(drid, stage=stage_to, severity=new_sev))
            if not ok:
                return _fail("DevRev did not accept the change, nothing was changed")
        if action != "start":  # start is visible in DevRev as a stage change
            commented = await asyncio.to_thread(live.comment, drid, comment_text)
    if stage_to:
        set_devrev_stage_seen(cf_id, stage_to)

    # ---- local state, through the code paths the app already uses
    if action == "start":
        adapters.set_stage(cf_id, "work_in_progress")
        pipeline.set_status(cluster, "in_progress", "Work started")
        events.set_meta(cf_id, awaiting=False)
    elif action == "request_verification":
        events.set_meta(cf_id, awaiting=True)
        pipeline.set_status(cluster, cluster.status, "Awaiting verification")
    elif action == "approve":
        events.set_meta(cf_id, awaiting=False, evidence=meta["evidence"] + (1 if note else 0))
        pipeline.mark_fixed(cluster)
    elif action == "escalate":
        set_severity(cf_id, new_sev)
        events.set_meta(cf_id, escalated=True)
        pipeline.set_status(cluster, cluster.status, f"Escalated to {new_sev}")
    elif action == "reopen":
        adapters.set_stage(cf_id, "queued")
        events.set_meta(cf_id, awaiting=False, evidence=0)  # a new fix cycle needs new evidence
        if cluster.status == "fixed":
            cluster.fixed_at = None
        pipeline.set_status(cluster, "assigned" if cluster.vendor else "reported", "Reopened")

    text = say + (f" ({note})" if note else "")
    if use_dr and action != "start" and not commented:
        text += " [DevRev comment not posted]"
    events.record(kind, cf_id, disp if row["devrev_display"] else None, text, "DevRev" if use_dr else "Civic Flow")
    board.invalidate()
    t = adapters.get_ticket(cf_id)
    if t is not None:
        sse.publish("ticket.updated", {"ticket": t.model_dump(mode="json")})
    pipeline.publish_stats()
    ticket = await asyncio.to_thread(board.find_ticket, cf_id)
    return {"ok": True, "ticket": ticket, "error": None}
