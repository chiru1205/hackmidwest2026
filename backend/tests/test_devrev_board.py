from datetime import datetime, timezone

from backend.integrations.devrev import actions, board


def test_stage_mapping():
    assert board.stage_key("queued") == "queued"
    assert board.stage_key("queued", has_vendor_assigned=True) == "assigned"
    assert board.stage_key("work_in_progress") == "in_progress"
    assert board.stage_key("work_in_progress", awaiting=True) == "awaiting_verification"
    assert board.stage_key("resolved", awaiting=True) == "resolved"
    assert board.stage_key("canceled") is None


def test_escalation_ladder():
    assert actions.next_severity("low") == "medium"
    assert actions.next_severity("medium") == "high"
    assert actions.next_severity("high") == "blocker"
    assert actions.next_severity("blocker") is None


def test_transitions():
    c = actions.check_transition
    assert c("start", "queued") is None and c("start", "assigned") is None
    assert c("start", "in_progress") and c("start", "resolved")
    assert c("request_verification", "in_progress") is None
    assert c("request_verification", "queued")
    assert c("approve", "awaiting_verification", has_evidence=False)  # needs evidence
    assert c("approve", "awaiting_verification", has_evidence=True) is None
    assert c("approve", "queued", has_evidence=True)
    assert c("escalate", "queued", "high") is None
    assert c("escalate", "queued", "blocker")
    assert c("escalate", "resolved", "low")
    assert c("reopen", "resolved") is None and c("reopen", "awaiting_verification") is None
    assert c("reopen", "queued")
    assert c("nope", "queued")


def test_assemble_totals():
    now = datetime.now(timezone.utc)

    def t(i, key, sev="medium", overdue=False, esc=False, age=60.0):
        return {"id": f"CF-{i}", "stage_key": key, "severity": sev, "overdue": overdue, "escalated": esc, "age_s": age}

    b = board.assemble([t(1, "queued", "high"), t(2, "queued", "low", True), t(3, "resolved", age=30), t(4, "in_progress", esc=True)],
                       "devrev", now)
    assert [s["key"] for s in b["stages"]] == list(board.STAGE_KEYS)
    assert b["totals"] == {"open": 3, "overdue": 1, "escalated": 1, "resolved": 1, "median_ttr": "30s"}
    assert b["stages"][0]["tickets"][0]["id"] == "CF-1"  # most severe first
    assert b["stages"][1]["avg_age_s"] is None


def test_plan_file_shape():
    from backend.integrations.devrev import baseline
    plan = baseline.load_plan()
    assert len(plan) >= 12 and plan[0]["cluster_id"] == "c_hotspot" and plan[0]["stage"] == "queued"
    assert len({t["cluster_id"] for t in plan}) == len(plan)
    kinds = [t["stage"] for t in plan]
    assert kinds.count("awaiting_verification") == 2 and kinds.count("resolved") == 2 and kinds.count("in_progress") == 3
    assert all(t["stage"] in baseline.DEVREV_STAGE for t in plan)
    # awaiting_verification is our own flag: DevRev itself stays work_in_progress
    assert baseline.DEVREV_STAGE["awaiting_verification"] == "work_in_progress"


def test_seed_ids_are_deterministic():
    import re
    from backend.api import seed
    assert re.fullmatch(r"c_seed\d{3}", "c_seed%03d" % 7)
    assert [h["id"] for h in seed.HEROES][0] == "c_hero_light"
    from backend.integrations.devrev import baseline
    assert all(t["cluster_id"] == "c_hotspot" or t["cluster_id"].startswith(("c_hero_", "c_seed")) for t in baseline.load_plan())


def test_events_clear_all(tmp_path, monkeypatch):
    from backend.integrations.devrev import events
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setattr(events, "_ready", False)
    events.record("stage", "CF-1", "TKT-1", "x")
    events.set_meta("CF-1", awaiting=True)
    events.clear_all()
    assert events.recent() == [] and events.all_meta() == {}


def test_restore_noop_when_not_live(monkeypatch):
    from backend.integrations.devrev import baseline
    monkeypatch.setenv("DEVREV_MODE", "mock")
    assert baseline.restore(say=lambda *_: None)["updated"] == 0
