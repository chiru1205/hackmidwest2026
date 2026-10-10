"""One-time optional: sync the top N seeded clusters to DevRev, idempotently by external_ref.
Default is a dry run that only prints. Pass --apply to create tickets (needs DEVREV_MODE=live and DEVREV_PAT in .env).
Usage: python scripts/devrev_prefill.py [--n 12] [--apply]"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from backend.integrations.devrev import SEVERITY, live  # noqa: E402

STAGE = {"fixed": "resolved", "in_progress": "work_in_progress"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=12)
    ap.add_argument("--apply", action="store_true", help="really create tickets (default is a dry run)")
    a = ap.parse_args()
    db = ROOT / "data" / "civicflow.db"
    c = sqlite3.connect(db)
    rows = c.execute("SELECT data FROM clusters ORDER BY priority DESC LIMIT ?", (a.n,)).fetchall()
    c.close()
    clusters = [json.loads(r[0]) for r in rows]
    if a.apply and not live.configured():
        print("DevRev is not configured (DEVREV_MODE=live and DEVREV_PAT); nothing to do.")
        return 1
    print(f"{'APPLY' if a.apply else 'DRY RUN'}: {len(clusters)} clusters")
    known = live.stages_by_ref([x["id"] for x in clusters]) if live.configured() else {}
    for x in clusters:
        stage = STAGE.get(x.get("status"), "queued")
        sev = SEVERITY.get(x.get("bucket"), "medium")
        title = f"{str(x.get('category', 'issue')).replace('_', ' ').title()} - {x.get('neighborhood') or x.get('address') or x['id']}"
        have = known.get(x["id"])
        action = f"exists (stage {have})" if have else f"create {sev}, then stage {stage}" if stage != "queued" else f"create {sev}"
        print(f"  {x['id']:<16} {title[:52]:<52} {action}")
        if not a.apply or have:
            continue
        body = (f"Seeded Civic Flow cluster {x['id']} | {x.get('reporter_count', 1)} unique reporters | "
                f"priority {x.get('bucket')} ({float(x.get('priority', 0)):.0f}/100)"
                + (f" | vendor: {x['vendor']}" if x.get("vendor") else ""))
        dr = live.create_work(x["id"], title, body, sev)
        if dr and dr.get("id") and stage != "queued":
            live.update_work(dr["id"], stage=stage)
        print("    ->", (dr or {}).get("display_id", "failed"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
