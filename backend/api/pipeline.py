"""The report pipeline: validate -> triage -> candidates (edge first) -> decide -> merge/judge/create -> ticket."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone

from contracts.models import AgentStep, Cluster, EdgeInfo, Report, ReportResult
from backend.engine import dedup, geofence, priority, semantic, xp
from backend.integrations.ai import embed as ai_embed

from . import adapters, config, edge, events, places, store

log = logging.getLogger("civicflow.pipeline")
CATEGORIES = set(adapters.LABELS)
POINTS = {"first": 50, "confirm": 5, "photo_confirm": 15}
EMBED_MODEL = "akamai:hackathon-embedding"
_bg_tasks: set = set()      # strong refs so background enrichment tasks are not garbage collected


def cj(c: Cluster) -> dict:
    return c.model_dump(mode="json")


class Ctx:
    """Per-report context: collects AgentSteps and publishes agent.node events."""

    def __init__(self, report_id: str, quiet: bool = False):
        self.report_id, self.cluster_id, self.quiet = report_id, None, quiet
        self.steps: list[AgentStep] = []

    def emit(self, type_: str, data: dict) -> None:
        if type_ == "agent.node":
            data = {**data}
            data.setdefault("report_id", self.report_id)
            data.setdefault("cluster_id", self.cluster_id)
            try:
                self.steps.append(AgentStep(**{k: v for k, v in data.items() if k in AgentStep.model_fields}))
            except Exception:
                pass
        events.publish(type_, data)

    def step(self, node: str, status: str, ms: float = 0.0, summary: str = "", model: str | None = None) -> None:
        if not self.quiet:
            self.emit("agent.node", {"node": node, "status": status, "ms": round(ms, 1),
                                     "summary": summary, "model": model})


def _template_rationale(c: Cluster) -> str:
    return places.rationale_with_zones(adapters.template_rationale(c), c)


def _pick_vendor(category: str, district: str | None) -> str:
    """The crew for category + district (falls back to the category-only pick if the DevRev layer is unavailable)."""
    try:
        from backend.integrations import devrev
        return devrev.pick_vendor(category, district)
    except Exception:
        return adapters.pick_vendor(category)


def _reject(reason: str, message: str) -> ReportResult:
    return ReportResult(outcome="rejected", message=message, reject_reason=reason)


def _user_view(uid: str, simulated: bool) -> tuple[int, str]:
    if simulated:
        return 0, "Resident"
    total = store.user_xp(uid)
    return total, xp.level_for(total)[0]


def _bump_user(uid: str, kind: str, photo: bool) -> None:
    col = "reports" if kind == "first" else "confirmations"
    store.x(f"UPDATE users SET {col}={col}+1, photos=photos+?, streak_weeks=MAX(streak_weeks,1) WHERE id=?",
            (1 if photo else 0, uid))


def publish_stats() -> None:
    store.persist_counters()
    events.publish("stats.updated", {"stats": store.stats().model_dump()})


async def _suggest_from_note(note: str) -> dict:
    try:
        from backend.integrations.ai import suggest
        return await suggest.suggest(note)
    except Exception as e:
        log.warning("note suggestion failed: %s", e)
        return {"category": "other", "confidence": 0.0, "source": "none"}


async def submit_report(user_id: str, lat: float, lng: float, accuracy_m: float = 20.0, category: str | None = None,
                        note: str = "", severity: int | None = None, photo: bytes | None = None,
                        photo_ext: str = ".jpg", *, confirm_cluster_id: str | None = None,
                        simulated: bool = False, quiet_stats: bool = False, demo_override: bool = False) -> ReportResult:
    flags = config.flags
    relaxed = flags.demo_mode or simulated
    report_id = store.new_id("r")
    ctx = Ctx(report_id, quiet=simulated)
    t_all = time.perf_counter()

    # ---- 1. validate
    if not simulated:
        store.ensure_user(user_id)
        if not relaxed:
            if accuracy_m > 100:
                return _reject("location too imprecise", "We can't pin your location well enough. Move outdoors and retry.")
            since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
            n = store.q("SELECT COUNT(*) AS n FROM reports WHERE user_id=? AND created_at>?", (user_id, since))[0]["n"]
            if n >= 10:
                return _reject("rate limit", "You've sent 10 reports this hour. Take a breather and try again soon.")

    target = None
    if confirm_cluster_id:
        target = store.clusters.get(confirm_cluster_id)
        if target is None:
            return _reject("cluster not found", "That issue no longer exists.")
        category = target.category

    ph = None
    if photo and not simulated:
        ph = adapters.phash(photo)
        if ph and not relaxed:
            since30 = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat().replace("+00:00", "Z")
            for r in store.q("SELECT phash FROM reports WHERE phash IS NOT NULL AND user_id!=? AND created_at>?",
                             (user_id, since30)):
                if adapters.phash_close(ph, r["phash"]):
                    return _reject("duplicate photo", "This photo was already submitted by someone else.")
    # ---- 1b. geofence: reports outside the Kansas City service area are not routed to a city crew
    if target is None and not simulated and os.getenv("GEOFENCE_ENFORCE", "1") != "0" and geofence.available():
        if not geofence.locate(lat, lng)["in_service_area"] and not (demo_override and flags.demo_mode):
            return _reject("outside_service_area", geofence.OUTSIDE_MESSAGE)

    photo_url = None
    if photo:
        photo_url = adapters.save_photo(f"{report_id}{photo_ext}", photo)

    now = store.now_iso()
    report = Report(id=report_id, cluster_id="", user_id=user_id, lat=lat, lng=lng, accuracy_m=accuracy_m,
                    category=category if category in CATEGORIES else "other", note=note, photo_url=photo_url,
                    phash=ph, simulated=simulated, created_at=now)
    events.publish("report.received", {"report_id": report_id, "user_id": user_id, "lat": lat, "lng": lng})

    # ---- 2. triage
    hazard, hdesc = adapters.infer_hazard(note)
    if target is None:
        t0 = time.perf_counter()
        tri = None
        if photo and flags.vision and not simulated:
            tri = await adapters.analyze_photo(photo, note, category, ctx.emit)
        if tri is not None:
            if not tri.is_valid and not relaxed:
                return _reject("invalid photo", tri.invalid_reason or "That photo doesn't show an infrastructure issue.")
            category, severity = tri.category, tri.severity
            hazard, hdesc = tri.is_safety_hazard or hazard, tri.hazard_description or hdesc
            ctx.step("intake", "done", (time.perf_counter() - t0) * 1000, f"vision: {category}, severity {severity}")
        else:
            src = "form"
            if category not in CATEGORIES:  # the citizen picked nothing: read the note (Akamai embeddings, then keywords)
                sg = await _suggest_from_note(note)
                category, src = (sg["category"], sg["source"]) if sg["confidence"] >= 0.5 else ("other", "none")
            severity = max(1, min(5, int(severity or 3)))
            ctx.step("intake", "done", (time.perf_counter() - t0) * 1000,
                     f"{src}: {category}, severity {severity}" + (", hazard keywords" if hazard else ""), "form")
        report.category = category
    else:
        severity = target.severity

    # ---- 3/4. candidates + decision (serialised)
    created_cluster: Cluster | None = None
    async with store.alock:
        edge_info: EdgeInfo | None = None
        decision = {"action": "merge", "cluster": target, "score": 1.0, "distance_m": 0.0, "scores": {}}
        used_llm = False
        if target is None:
            t0 = time.perf_counter()
            cands, edge_info = edge.candidates(lat, lng, category)
            decision = dedup.decide(cands, category)
            ctx.step("dedup", "done", (time.perf_counter() - t0) * 1000,
                     f"geo cache {'HIT' if edge_info.hit else 'MISS'} {edge_info.ms:.2f} ms, {len(cands)} candidates, "
                     f"decision={decision['action']} score={decision['score']:.2f}", "engine")
            if decision["action"] == "judge":
                t0 = time.perf_counter()
                pool = [c for c, s, _ in sorted(cands, key=lambda t: -t[1]) if s >= 0.5]
                sem = None if simulated else await _semantic_judge(report, pool, hdesc)
                if sem is not None and sem["verdict"] != "unsure":
                    if sem["verdict"] == "merge" and sem["cluster"].id in store.clusters:
                        decision = {**decision, "action": "merge", "cluster": store.clusters[sem["cluster"].id]}
                    else:
                        decision = {**decision, "action": "create", "cluster": None}
                    ctx.step("judge", "done", (time.perf_counter() - t0) * 1000,
                             semantic.summary(sem["sim"], sem["verdict"]), EMBED_MODEL)
                else:
                    if simulated:    # simulated storms never call an AI model: use the rule judge
                        best = max(pool, key=lambda c: decision["scores"].get(c.id, 0), default=None)
                        ok = best is not None and decision["scores"].get(best.id, 0) >= 0.6
                        j = {"decision": "merge" if ok else "new", "cluster_id": best.id if ok else None,
                             "reason": "rule judge (simulated report)"}
                    else:
                        j = await adapters.judge_dedup(report, pool, decision["scores"], ctx.emit)
                    used_llm = not simulated
                    if j.get("decision") == "merge" and j.get("cluster_id") in store.clusters:
                        decision = {**decision, "action": "merge", "cluster": store.clusters[j["cluster_id"]]}
                    else:
                        decision = {**decision, "action": "create", "cluster": None}
                    ctx.step("judge", "done", (time.perf_counter() - t0) * 1000,
                             f"{j.get('decision')}: {j.get('reason', '')}")
        if decision["action"] == "merge":
            live = store.clusters.get(decision["cluster"].id)
            result = _merge(live, report, photo is not None, severity, hazard, hdesc, ctx, relaxed, simulated,
                            edge_info, used_llm, confirm=target is not None)
        else:
            created_cluster = _create(report, lat, lng, category, severity, hazard, hdesc, photo_url, simulated, ctx)
            result = None

    # ---- 5. new cluster: rationale + ticket + vendor (outside the lock; may call an LLM)
    if created_cluster is not None:
        result = await _finish_create(created_cluster, report, ctx, simulated, edge_info)
    if not quiet_stats:
        publish_stats()
    if not simulated:
        log.info("report %s %s in %.0f ms", report_id, result.outcome, (time.perf_counter() - t_all) * 1000)
    return result


# ------------------------------------------------------------------ merge
def _merge(c: Cluster, report: Report, has_photo: bool, severity: int, hazard: bool, hdesc: str, ctx: Ctx,
           relaxed: bool, simulated: bool, edge_info: EdgeInfo | None, used_llm: bool, confirm: bool) -> ReportResult:
    new_user = not store.user_in_cluster(c.id, report.user_id)
    if not new_user and not relaxed:
        return ReportResult(outcome="merged", message="You already reported this one, it's counted. Thanks for checking in!",
                            cluster=c, neighbors=c.reporter_count, points_awarded=0, edge=edge_info,
                            xp_total=_user_view(report.user_id, simulated)[0],
                            level=_user_view(report.user_id, simulated)[1], steps=ctx.steps,
                            priority_before=c.priority, priority_after=c.priority, ticket=adapters.get_ticket(c.ticket_id))
    before, old_bucket = c.priority, c.bucket
    kind = "photo_confirm" if has_photo else "confirm"
    report.kind, report.cluster_id = kind, c.id
    if new_user:
        c.reporter_count += 1
    c.report_count += 1
    c.severity = max(c.severity, severity)
    if hazard and not c.is_hazard:
        c.is_hazard, c.hazard_description = True, hdesc
    c.last_reported_at = report.created_at
    if not c.photo_url and report.photo_url:
        c.photo_url = report.photo_url
    places.apply_geo(c)          # zone boost can only raise location_crit; fills district/zones on older clusters
    c.priority, c.bucket = priority.compute_priority(c, datetime.now(timezone.utc))
    milestone = new_user and priority.is_milestone(c.reporter_count)
    bucket_changed = c.bucket != old_bucket
    # a rationale written for one reporter ("single-reporter ...") is wrong once neighbors join: fall back to the data-driven text
    stale_single = new_user and "single" in (c.rationale or "").lower() and "report" in (c.rationale or "").lower()
    if bucket_changed or stale_single:
        c.rationale = _template_rationale(c)
    store.save_cluster(c)
    store.insert_report(report)
    edge.refresh(c)

    points = POINTS[kind]
    if not simulated:
        store.award(report.user_id, points, kind, c.id)
        _bump_user(report.user_id, kind, has_photo)
        store.timeline_add(c.id, "Confirmed by a neighbor", f"{c.reporter_count} reporters")
    elif milestone:
        store.timeline_add(c.id, f"Milestone: {c.reporter_count} reporters")
    store.counters["total_reports"] += 1
    store.counters["duplicates_absorbed"] += 1
    if not used_llm:
        store.counters["llm_calls_avoided"] += 1

    ticket = adapters.get_ticket(c.ticket_id)
    if c.ticket_id and (bucket_changed or milestone):
        t = adapters.update_ticket(c, adapters.ticket_title(c), adapters.ticket_body(c))
        if t is not None:
            ticket = t
            ctx.emit("ticket.updated", {"ticket": t.model_dump(mode="json")})
        ctx.step("dispatch", "done", 0, f"ticket {c.ticket_id} updated ({old_bucket}->{c.bucket}, {c.reporter_count} reporters)")
    events.publish("cluster.merged", {"cluster": cj(c), "outcome": "merged", "points": points,
                                      "report_id": report.id, "bucket_changed": bucket_changed})

    others = c.reporter_count - 1
    nb = f"{others} neighbor{'s' if others != 1 else ''}"
    if not new_user and others == 0:
        msg = "You've already reported this spot. We've added your new photo and note."
    elif c.priority > before + 0.05 or bucket_changed:
        msg = f"Already reported by {nb}. Your confirmation raised priority to {c.bucket}. +{points} XP"
    else:
        msg = f"Already reported by {nb}. It's {c.bucket} priority and in the queue. +{points} XP"
    total, level = _user_view(report.user_id, simulated)
    return ReportResult(outcome="merged", message=msg, report_id=report.id, cluster=c, neighbors=c.reporter_count,
                        points_awarded=points, xp_total=total, level=level, priority_before=round(before, 1),
                        priority_after=round(c.priority, 1), ticket=ticket, edge=edge_info, steps=ctx.steps,
                        my_photo_url=report.photo_url)


# ------------------------------------------------------------------ create
def _create(report: Report, lat: float, lng: float, category: str, severity: int, hazard: bool, hdesc: str,
            photo_url: str | None, simulated: bool, ctx: Ctx) -> Cluster:
    now = report.created_at
    nb = places.neighborhood_for(lat, lng)
    c = Cluster(id=store.new_id("c"), category=category, lat=lat, lng=lng, severity=severity, is_hazard=hazard,
                hazard_description=hdesc, location_crit=places.location_crit(lat, lng), neighborhood=nb,
                address=places.address_for(lat, lng), photo_url=photo_url, simulated=simulated,
                first_reported_at=now, last_reported_at=now)
    places.apply_geo(c)          # real neighborhood + district + priority zones; raises location_crit
    # a recently fixed cluster at the same spot means this is a reopened issue
    for old in store.clusters.values():
        if old.status == "fixed" and old.category == category and old.fixed_at:
            if dedup.score_candidate(lat, lng, category, old)[1] <= dedup.radii(category)[0]:
                try:
                    age = datetime.now(timezone.utc) - datetime.fromisoformat(old.fixed_at.replace("Z", "+00:00"))
                    if age <= timedelta(days=30):
                        c.rationale = "Reopened: a fix here in the last 30 days did not hold. "
                        break
                except Exception:
                    pass
    c.priority, c.bucket = priority.compute_priority(c, datetime.now(timezone.utc))
    report.kind, report.cluster_id = "first", c.id
    ctx.cluster_id = c.id
    store.save_cluster(c)
    store.insert_report(report)
    edge.refresh(c)
    store.counters["total_reports"] += 1
    if not simulated:
        store.award(report.user_id, POINTS["first"], "first", c.id)
        _bump_user(report.user_id, "first", report.photo_url is not None)
        store.timeline_add(c.id, "Reported", f"First report from {nb}")
    events.publish("cluster.created", {"cluster": cj(c), "outcome": "created", "points": POINTS["first"],
                                       "report_id": report.id})
    return c


async def _semantic_judge(report: Report, pool: list[Cluster], hdesc: str) -> dict | None:
    """Embedding-based dedup for the judge band. None when unavailable (caller falls back to the LLM/rule judge)."""
    if not pool or not ai_embed.enabled() or not semantic.has_signal(report.note, hdesc):
        return None
    try:
        top = pool[:3]
        new_text = semantic.report_text(adapters.LABELS.get(report.category, report.category), report.note, hdesc)
        texts = [new_text]
        for c in top:
            notes = [r.note for r in store.reports_for(c.id, 8) if r.note]
            texts.append(semantic.cluster_text(adapters.LABELS.get(c.category, c.category), c.hazard_description,
                                               c.rationale, notes))
        vecs = await ai_embed.embed(texts)
        if vecs is None:
            return None
        cid, sim = semantic.best_match(vecs[0], {c.id: v for c, v in zip(top, vecs[1:])})
        if cid is None:
            return None
        return {"verdict": semantic.decide(sim), "sim": sim, "cluster": next(c for c in top if c.id == cid)}
    except Exception as e:
        log.warning("semantic judge failed: %s", type(e).__name__)
        return None


async def _finish_create(c: Cluster, report: Report, ctx: Ctx, simulated: bool, edge_info: EdgeInfo | None) -> ReportResult:
    """Ticket + vendor immediately with template text (the priority number comes from the engine); the
    Akamai-written rationale and ticket text arrive later via _enrich_cluster."""
    prefix = c.rationale
    c.rationale = (prefix + _template_rationale(c)).strip()
    ticket, vendor = None, None
    t0 = time.perf_counter()
    try:
        vendor = _pick_vendor(c.category, c.district)
        try:
            from backend.agents import common as ac
            title, body = ac.template_title(c), ac.template_body(c, report)
        except Exception:
            title, body = adapters.ticket_title(c), adapters.ticket_body(c)
        ticket = adapters.create_ticket(c, title, body, vendor)
    except Exception:
        log.exception("ticket creation failed")
        ctx.step("dispatch", "error", (time.perf_counter() - t0) * 1000, "ticket creation failed")
    else:
        if not simulated:
            ctx.step("priority", "done", 0, f"{c.bucket} score {c.priority:.0f} computed by the engine, rationale text writing", "engine")
            ctx.step("dispatch", "done", (time.perf_counter() - t0) * 1000, f"{ticket.id} -> {vendor}")
    c.vendor = vendor or (ticket.vendor if ticket else None)
    if ticket is not None:
        c.ticket_id = ticket.id
    if c.vendor:
        c.status = "assigned"
    store.save_cluster(c)
    edge.refresh(c)
    if ticket is not None:
        if simulated:
            store.timeline_add(c.id, "Ticket created", ticket.id)
        else:
            store.timeline_add(c.id, "Ticket created", f"{ticket.id} assigned to {c.vendor or 'unassigned'}")
        events.publish("ticket.created", {"ticket": ticket.model_dump(mode="json")})
    events.publish("cluster.updated", {"cluster": cj(c), "outcome": "created", "points": POINTS["first"]})
    total, level = _user_view(report.user_id, simulated)
    _save_trace(c.id, ctx)
    if not simulated and ticket is not None:
        task = asyncio.create_task(_enrich_cluster(c.id, report, ctx, prefix, c.rationale, time.monotonic()))
        _bg_tasks.add(task)
        task.add_done_callback(_bg_tasks.discard)
    return ReportResult(outcome="created", message=f"{prefix and 'Reopened issue. '}You're the first reporter! +{POINTS['first']} XP",
                        report_id=report.id, cluster=c, neighbors=1, points_awarded=POINTS["first"], xp_total=total,
                        level=level, priority_before=None, priority_after=round(c.priority, 1), ticket=ticket,
                        edge=edge_info, steps=list(ctx.steps), my_photo_url=report.photo_url)


def _save_trace(cluster_id: str, ctx: Ctx) -> None:
    store.x("INSERT OR REPLACE INTO kv_meta(k,v) VALUES(?,?)",
            (f"trace:{cluster_id}", json.dumps([s.model_dump() for s in ctx.steps])))


async def _enrich_cluster(cluster_id: str, report: Report, ctx: Ctx, prefix: str, template_text: str,
                          t_created: float) -> None:
    """Background: Akamai-written rationale + ticket title/body. Never raises. The cluster keeps its template
    rationale unless it is unchanged since creation (a bucket change in the meantime rewrote it)."""
    try:
        c0 = store.clusters.get(cluster_id)
        if c0 is None:
            return
        texts = await adapters.write_texts(c0.model_copy(deep=True), report, ctx.emit)
        if not texts:
            return
        # let the DevRev mirror (separate thread) finish creating the remote item before we update it
        await asyncio.sleep(max(0.0, 2.5 - (time.monotonic() - t_created)))
        async with store.alock:
            c = store.clusters.get(cluster_id)
            if c is None:
                return
            rationale = (texts.get("rationale") or "").strip()
            if rationale and c.rationale == template_text:
                c.rationale = (prefix + rationale).strip()
                store.save_cluster(c)
                edge.refresh(c)
            ticket = None
            if c.ticket_id:
                ticket = adapters.update_ticket(c, texts.get("title") or None, texts.get("body") or None)
            events.publish("cluster.updated", {"cluster": cj(c), "outcome": "created", "points": 0})
            if ticket is not None:
                events.publish("ticket.updated", {"ticket": ticket.model_dump(mode="json")})
        _save_trace(cluster_id, ctx)
    except Exception as e:
        log.warning("background enrichment failed for %s: %s", cluster_id, type(e).__name__)


# ------------------------------------------------------------------ fixing / stage changes
def set_status(c: Cluster, status: str, label: str) -> None:
    c.status = status
    store.save_cluster(c)
    edge.refresh(c)
    store.timeline_add(c.id, label)
    events.publish("cluster.updated", {"cluster": cj(c), "outcome": "merged", "points": 0})


def mark_fixed(c: Cluster, set_ticket: bool = True) -> Cluster:
    if c.status == "fixed":
        return c
    c.fixed_at = store.now_iso()
    ticket = None
    if c.ticket_id:
        ticket = adapters.set_stage(c.ticket_id, "resolved") if set_ticket else adapters.get_ticket(c.ticket_id)
    set_status(c, "fixed", "Fixed by vendor")
    rows = store.q("SELECT user_id, simulated FROM reports WHERE cluster_id=? ORDER BY created_at ASC", (c.id,))
    seen: set[str] = set()
    for i, r in enumerate(rows):
        uid = r["user_id"]
        if r["simulated"] or uid in seen:
            continue
        seen.add(uid)
        pts = 100 if i == 0 else 20
        store.award(uid, pts, "fixed", c.id)
        store.x("UPDATE users SET fixed=fixed+1 WHERE id=?", (uid,))
    if ticket is not None:
        events.publish("ticket.updated", {"ticket": ticket.model_dump(mode="json")})
    publish_stats()
    return c

