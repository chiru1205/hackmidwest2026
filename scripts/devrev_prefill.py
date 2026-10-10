"""Demo baseline for the DevRev Workflow board, driven by data/seed/devrev_plan.json.
  (default)   dry run: prints the plan as a table and how many NEW DevRev tickets --apply would create. Writes nothing.
  --apply     create the missing planned tickets (idempotent via external_ref), then set every planned stage.
  --restore   only set stages/severity of EXISTING planned tickets back to baseline. Never creates (what Admin Reset does).
  --only ID   limit any mode to these cluster ids (repeatable), e.g. --only c_hotspot
Needs DEVREV_MODE=live and DEVREV_PAT in .env for anything that talks to DevRev. Pacing is about 0.4 s per write."""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from backend.integrations.devrev import SEVERITY, baseline, live  # noqa: E402


def _clusters(ids: list[str]) -> dict[str, dict]:
    try:
        c = sqlite3.connect(ROOT / "data" / "civicflow.db")
        rows = c.execute("SELECT id, data FROM clusters").fetchall()
        c.close()
    except Exception:
        return {}
    return {r[0]: json.loads(r[1]) for r in rows if r[0] in ids}


def _body(x: dict) -> str:
    link = f"https://www.openstreetmap.org/?mlat={x.get('lat')}&mlon={x.get('lng')}"
    footer = (f"Civic Flow cluster {x['id']} | {x.get('reporter_count', 1)} unique reporters | "
              f"priority {x.get('bucket')} ({float(x.get('priority', 0)):.0f}/100)"
              + (f" | vendor: {x['vendor']}" if x.get("vendor") else ""))
    return "\n".join([x.get("rationale") or "Seeded demo issue.", "", "---", footer, f"Map: {link}"])


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--apply", action="store_true", help="create missing planned tickets and set planned stages")
    g.add_argument("--restore", action="store_true", help="only reset stages of existing planned tickets to baseline")
    ap.add_argument("--only", action="append", default=[], help="limit to this cluster id (repeatable)")
    a = ap.parse_args()

    plan = [t for t in baseline.load_plan() if not a.only or t["cluster_id"] in a.only]
    if not plan:
        print("No planned tickets (check data/seed/devrev_plan.json and --only).")
        return 1
    mode = "APPLY" if a.apply else "RESTORE" if a.restore else "DRY RUN"
    cfg = live.configured()
    if (a.apply or a.restore) and not cfg:
        print("DevRev is not configured (DEVREV_MODE=live and DEVREV_PAT); nothing to do.")
        return 1
    have = baseline.existing([t["cluster_id"] for t in plan]) if cfg else {}
    local = _clusters([t["cluster_id"] for t in plan])
    print(f"{mode}: {len(plan)} planned tickets" + ("" if cfg else " (DevRev not configured: existence unknown)"))
    print(f"  {'cluster id':<14} {'title':<48} {'category':<16} {'district':<11} {'stage':<22} {'severity':<8} DevRev")
    new = 0
    for t in plan:
        w = have.get(t["cluster_id"])
        if w:
            note = f"already exists as {w['display_id']} (now {w['stage']})"
        else:
            note = "would create TKT" if cfg else "would create TKT (if absent)"
            new += 1
        print(f"  {t['cluster_id']:<14} {t['title'][:48]:<48} {t['category']:<16} {t['district']:<11} "
              f"{t['stage']:<22} {t['severity']:<8} {note}")
    print(f"\n  New tickets {'to create' if not a.apply else 'being created'}: {new}   existing: {len(plan) - new}")
    if not (a.apply or a.restore):
        print("  Dry run only. Use --apply to create, --restore to reset existing ones. Nothing was written.")
        return 0

    if a.apply:
        for t in plan:
            if have.get(t["cluster_id"]):
                continue
            x = local.get(t["cluster_id"])
            if not x:
                print(f"  skip {t['cluster_id']}: cluster not in the local DB (run Admin Reset first)")
                continue
            time.sleep(baseline.PACE_S)
            dr = live.create_work(x["id"], t["title"], _body(x), t.get("severity") or SEVERITY.get(x.get("bucket"), "medium"))
            print(f"  created {x['id']} -> {(dr or {}).get('display_id', 'FAILED')}")
    res = baseline.restore(only=[t["cluster_id"] for t in plan])
    baseline.apply_local_flags(only=[t["cluster_id"] for t in plan])
    print(f"  baseline: {res}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
