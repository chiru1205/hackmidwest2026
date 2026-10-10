# backend/engine/ — the heart (no LLM, no network)
**Owner: P1** · plain Python, unit-tested.

- `geo.py`: candidate lookup (Valkey GEOSEARCH), per-category radius
- `dedup.py`: score = 0.50 geo + 0.20 category + 0.15 image + 0.15 time, then merge / ask judge / create
- `priority.py`: 0–100, reporters log-scaled so 1,000 minor reports can't outrank one severity-5 hazard
- `xp.py`, `fraud.py`: points ledger, pHash, rate limits
- `edgekv.py`: EdgeKV-shaped cache adapter on Valkey (20-minute cap)

**Rule:** this folder imports nothing from `api/`, `agents/` or `integrations/`.
