"""Safe wrappers around the agents / integrations layers. Every call degrades to a local fallback."""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timezone

from contracts.models import Cluster, Report, Ticket, Triage
from backend.engine import dedup, geo, priority, xp  # noqa: F401  (re-exported for convenience)

from . import config

log = logging.getLogger("civicflow.api")
AGENT_TIMEOUT = float(os.getenv("API_AGENT_TIMEOUT", "25"))

try:
    from backend.engine import fraud
except Exception:  # pragma: no cover
    fraud = None

try:
    from backend import agents as _agents
except Exception as e:  # pragma: no cover
    log.warning("agents layer unavailable: %s", e)
    _agents = None

try:
    from backend.integrations import devrev as _dr
except Exception as e:  # pragma: no cover
    log.warning("devrev integration unavailable: %s", e)
    _dr = None

try:
    from backend.integrations import storage as _storage
except Exception as e:  # pragma: no cover
    _storage = None

LABELS = {
    "pothole": "Pothole", "streetlight_out": "Streetlight out", "traffic_signal": "Traffic signal issue",
    "sidewalk_damage": "Sidewalk damage", "manhole_cover": "Manhole cover", "road_debris": "Road debris",
    "graffiti": "Graffiti", "illegal_dumping": "Illegal dumping", "downed_tree": "Downed tree",
    "flooding": "Flooding", "other": "Infrastructure issue",
}
HAZARD_WORDS = ("school", "crosswalk", "swerve", "deep", "bike", "cyclist", "wheelchair", "accident",
                "crash", "child", "kid", "blind", "dangerous", "flat tire", "injur", "bus stop")


def infer_hazard(note: str) -> tuple[bool, str]:
    n = (note or "").lower()
    hits = [w for w in HAZARD_WORDS if w in n]
    return (True, f"Note mentions: {', '.join(hits)}") if hits else (False, "")


# ---------------------------------------------------------------- text helpers
def ticket_title(c: Cluster) -> str:
    return f"[{c.bucket}] {LABELS.get(c.category, c.category)} - {c.address or c.neighborhood or 'KC'}"


def ticket_body(c: Cluster) -> str:
    return (f"{LABELS.get(c.category, c.category)} at ({c.lat:.5f}, {c.lng:.5f}), {c.neighborhood or 'KC'}.\n"
            f"Severity {c.severity}/5, {c.reporter_count} unique reporter(s). "
            f"{'Safety hazard: ' + c.hazard_description if c.is_hazard else ''}\n{c.rationale}")


def template_rationale(c: Cluster) -> str:
    try:
        t0 = datetime.fromisoformat(c.first_reported_at.replace("Z", "+00:00"))
        age = max(0.0, (datetime.now(timezone.utc) - t0).total_seconds() / 86400)
    except Exception:
        age = 0.0
    bits = [f"Priority {c.bucket} ({c.priority:.0f}/100)", f"severity {c.severity}/5",
            f"{c.reporter_count} unique reporter{'s' if c.reporter_count != 1 else ''}"]
    if c.is_hazard:
        bits.append("safety hazard")
    if getattr(c, "zones", None):
        pass  # the zone sentence is appended by places.rationale_with_zones
    elif c.location_crit >= 1.0:
        bits.append("near a school or hospital")
    elif c.location_crit >= 0.8:
        bits.append("on an arterial road")
    bits.append(f"open {age:.0f} day{'s' if round(age) != 1 else ''}")
    return ", ".join(bits) + "."


# ---------------------------------------------------------------- edge kv
class _MemKV:
    def __init__(self):
        self._d = {}

    def get(self, ns, group, item):
        return self._d.get((ns, group, item))

    def put(self, ns, group, item, value, ttl_s=None):
        self._d[(ns, group, item)] = value

    def delete(self, ns, group, item):
        self._d.pop((ns, group, item), None)

    def clear(self):
        self._d.clear()


def make_edgekv():
    try:
        from backend.engine.edgekv import EdgeKV
        url = os.getenv("VALKEY_URL") if config.flags.edgekv_backend == "valkey" else None
        return EdgeKV(url) if url else EdgeKV()
    except Exception as e:
        log.warning("EdgeKV unavailable (%s); using dict", e)
        return _MemKV()


# ---------------------------------------------------------------- photo
def phash(data: bytes) -> str | None:
    if fraud is not None:
        try:
            h = fraud.compute_phash(data)
            return str(h) if h is not None else None
        except Exception:
            pass
    try:
        import io
        import imagehash
        from PIL import Image
        return str(imagehash.phash(Image.open(io.BytesIO(data))))
    except Exception:
        return None


def phash_close(a: str | None, b: str | None, max_dist: int = 6) -> bool:
    if not a or not b:
        return False
    try:
        return bin(int(a, 16) ^ int(b, 16)).count("1") <= max_dist
    except ValueError:
        return False


def save_photo(name: str, data: bytes) -> str:
    url = None
    if _storage is not None:
        try:
            url = _storage.store_photo(name, data)
        except Exception as e:
            log.warning("store_photo failed: %s", e)
    local = config.PHOTO_DIR / name
    if (url is None or url.startswith("/photos")) and not local.exists():
        local.write_bytes(data)
    return url or f"/photos/{name}"


# ---------------------------------------------------------------- agents
async def analyze_photo(image: bytes, note: str, hint: str | None, emit) -> Triage | None:
    if _agents is None:
        return None
    try:
        r = await asyncio.wait_for(_agents.analyze_photo(image, note, hint, emit), AGENT_TIMEOUT)
        if isinstance(r, dict):
            r = Triage(**r)
        return r
    except Exception as e:
        log.warning("analyze_photo failed: %s", e)
        return None


async def judge_dedup(report: Report, cands: list[Cluster], scores: dict, emit) -> dict:
    if _agents is not None:
        try:
            r = await asyncio.wait_for(_agents.judge_dedup(report, cands, scores, emit), AGENT_TIMEOUT)
            if isinstance(r, dict) and r.get("decision") in ("merge", "new"):
                return r
        except Exception as e:
            log.warning("judge_dedup failed: %s", e)
    best = max(cands, key=lambda c: scores.get(c.id, 0), default=None)
    if best is not None and scores.get(best.id, 0) >= 0.6:
        return {"decision": "merge", "cluster_id": best.id, "confidence": 0.6, "reason": "rule judge: score >= 0.6"}
    return {"decision": "new", "cluster_id": None, "confidence": 0.6, "reason": "rule judge: score < 0.6"}


async def run_new_cluster_pipeline(cluster: Cluster, report: Report, emit) -> dict:
    if _agents is not None:
        try:
            r = await asyncio.wait_for(_agents.run_new_cluster_pipeline(cluster, report, emit), AGENT_TIMEOUT * 2)
            if isinstance(r, dict):
                t = r.get("ticket")
                if isinstance(t, dict):
                    t = Ticket(**t)
                return {"rationale": r.get("rationale") or template_rationale(cluster), "ticket": t,
                        "vendor": r.get("vendor")}
        except Exception as e:
            log.warning("run_new_cluster_pipeline failed: %s", e)
    return local_new_cluster(cluster)


async def write_texts(cluster: Cluster, report: Report, emit) -> dict | None:
    """Akamai-written rationale + ticket title/body (background). None when unavailable."""
    if _agents is None or not hasattr(_agents, "write_texts"):
        return None
    try:
        return await asyncio.wait_for(_agents.write_texts(cluster, report, emit), AGENT_TIMEOUT * 2)
    except Exception as e:
        log.warning("write_texts failed: %s", type(e).__name__)
        return None


def local_new_cluster(cluster: Cluster) -> dict:
    rationale = template_rationale(cluster)
    cluster.rationale = rationale
    vendor = pick_vendor(cluster.category)
    t = create_ticket(cluster, ticket_title(cluster), ticket_body(cluster), vendor)
    return {"rationale": rationale, "ticket": t, "vendor": vendor}


# ---------------------------------------------------------------- tickets (DevRev-shaped board)
_mem: dict[str, Ticket] = {}
_seq = 1000
_VENDORS = {"streetlight_out": "BrightLine Lighting", "traffic_signal": "BrightLine Lighting",
            "downed_tree": "GreenLeaf Urban Services", "illegal_dumping": "GreenLeaf Urban Services",
            "graffiti": "GreenLeaf Urban Services", "flooding": "GreenLeaf Urban Services"}


def pick_vendor(category: str) -> str:
    if _dr is not None:
        try:
            return _dr.pick_vendor(category)
        except Exception:
            pass
    return _VENDORS.get(category, "KC Road Crew Co.")


def create_ticket(cluster: Cluster, title: str, body: str, vendor: str | None) -> Ticket:
    global _seq
    if _dr is not None:
        try:
            return _dr.create_ticket(cluster, title, body, vendor)
        except Exception as e:
            log.warning("devrev.create_ticket failed: %s", e)
    _seq += 1
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    t = Ticket(id=f"CF-{_seq}", cluster_id=cluster.id, title=title, body=body,
               severity=priority.ticket_severity(cluster.bucket), vendor=vendor, created_at=now, updated_at=now)
    _mem[t.id] = t
    return t


def update_ticket(cluster: Cluster, title: str | None = None, body: str | None = None) -> Ticket | None:
    if _dr is not None:
        try:
            r = _dr.update_ticket(cluster, title, body)
            if r is not None:
                return r
        except Exception as e:
            log.warning("devrev.update_ticket failed: %s", e)
    t = _mem.get(cluster.ticket_id or "")
    if t:
        t.severity = priority.ticket_severity(cluster.bucket)
        t.title = title or t.title
        t.body = body or t.body
        t.updated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return t


def set_stage(ticket_id: str, stage: str) -> Ticket | None:
    if _dr is not None:
        try:
            r = _dr.set_stage(ticket_id, stage)
            if r is not None:
                return r
        except Exception as e:
            log.warning("devrev.set_stage failed: %s", e)
    t = _mem.get(ticket_id)
    if t:
        t.stage = stage
        t.updated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return t


def get_ticket(ticket_id: str | None) -> Ticket | None:
    if not ticket_id:
        return None
    if _dr is not None:
        try:
            r = _dr.get_ticket(ticket_id)
            if r is not None:
                return r
        except Exception:
            pass
    return _mem.get(ticket_id)


def list_tickets(limit: int = 200) -> list[Ticket]:
    out: list[Ticket] = []
    if _dr is not None:
        try:
            out = list(_dr.list_tickets(limit))
        except Exception as e:
            log.warning("devrev.list_tickets failed: %s", e)
    out += list(_mem.values())
    out.sort(key=lambda t: t.created_at, reverse=True)
    return out[:limit]


def reset_tickets() -> None:
    _mem.clear()
    if _dr is None:
        return
    for name in ("reset", "clear", "reset_board", "wipe"):
        fn = getattr(_dr, name, None)
        if callable(fn):
            try:
                fn()
                return
            except Exception as e:
                log.warning("devrev.%s failed: %s", name, e)
    try:  # best effort: the board lives in the same SQLite file
        from . import store
        store.x("DELETE FROM tickets")
    except Exception:
        pass


def services() -> dict[str, str]:
    f = config.flags
    return {
        "db": "ok",
        "agents": ("ok" if _agents else "off") + f":{f.agents_mode}",
        "ai": "ok" if os.getenv("AKAMAI_AI_KEY") else "off",
        "vision": "on" if f.vision else "off",
        "devrev": "mock" if f.devrev_mode == "mock" else ("ok" if _dr else "off"),
        "storage": f.storage,
        "edgekv": f.edgekv_backend,
    }
