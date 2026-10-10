"""Live DevRev client (REST, https://api.devrev.ai). Verified 2026-10-10 against a real org:
works.create -> 201 {work: {id, display_id: "TKT-6", stage: {name}}}; stage names queued / work_in_progress / resolved / canceled;
severity blocker|high|medium|low; a repeated external_ref returns 409, so we look the ticket up with works.list.
Every function is best-effort: any failure is logged and returns None/False. The local board keeps working regardless."""
from __future__ import annotations

import logging
import os

import httpx

log = logging.getLogger("civicflow.devrev.live")
BASE = "https://api.devrev.ai/"
KNOWN_STAGES = {"queued", "work_in_progress", "resolved", "canceled"}


def configured() -> bool:
    return os.getenv("DEVREV_MODE", "mock") == "live" and bool(os.getenv("DEVREV_PAT"))


def _headers() -> dict:
    return {"Authorization": "Bearer " + os.getenv("DEVREV_PAT", ""), "Content-Type": "application/json"}


def _post(path: str, body: dict, timeout: float = 8.0) -> tuple[int, dict]:
    try:
        r = httpx.post(BASE + path, headers=_headers(), json=body, timeout=timeout)
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, {"raw": r.text[:200]}
    except Exception as e:  # network, timeout
        log.warning("DevRev %s failed: %s", path, type(e).__name__)
        return -1, {}


def _brief(w: dict) -> dict:
    return {"id": w.get("id"), "display_id": w.get("display_id"), "stage": (w.get("stage") or {}).get("name")}


def find_by_ref(ref: str) -> dict | None:
    s, j = _post("works.list", {"external_ref": [ref], "type": ["ticket"]})
    works = j.get("works") or []
    return _brief(works[0]) if s == 200 and works else None


def create_work(external_ref: str, title: str, body: str, severity: str) -> dict | None:
    """Returns {"id", "display_id", "stage"} or None. Idempotent on external_ref."""
    s, j = _post("works.create", {
        "type": "ticket", "title": title[:200], "body": body,
        "applies_to_part": os.getenv("DEVREV_PART", "PROD-1"),
        "owned_by": [os.getenv("DEVREV_OWNER_DEVU", "DEVU-3")],
        "severity": severity, "external_ref": external_ref,
    })
    if s in (200, 201) and j.get("work"):
        return _brief(j["work"])
    if s == 409:
        return find_by_ref(external_ref)
    log.warning("DevRev works.create returned %s", s)
    return None


def update_work(devrev_id: str, *, stage: str | None = None, severity: str | None = None,
                title: str | None = None, body: str | None = None) -> bool:
    payload: dict = {"id": devrev_id, "type": "ticket"}
    if stage:
        payload["stage"] = {"name": stage}
    if severity:
        payload["severity"] = severity
    if title:
        payload["title"] = title[:200]
    if body:
        payload["body"] = body
    s, _ = _post("works.update", payload)
    if s != 200:
        log.warning("DevRev works.update returned %s", s)
    return s == 200


def comment(devrev_id: str, text: str) -> bool:
    s, _ = _post("timeline-entries.create", {"object": devrev_id, "type": "timeline_comment", "body": text})
    return s in (200, 201)


def stages_by_ref(refs: list[str]) -> dict[str, str]:
    """external_ref -> current stage name, for a batch of tickets (one call)."""
    if not refs:
        return {}
    s, j = _post("works.list", {"external_ref": refs, "type": ["ticket"], "limit": 100}, timeout=12.0)
    if s != 200:
        return {}
    return {w["external_ref"]: (w.get("stage") or {}).get("name") for w in j.get("works", []) if w.get("external_ref")}
