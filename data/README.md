# data/ — schema and seed data
**Owner: P2**

- `schema.sql`: `users, clusters, reports, ledger, kv_meta` plus one jsonb `events` table (no PostGIS, no pgvector)
- `seed/`: KC 311 pothole snapshot (dataset `d4px-6rwg`), `pois.json` (schools, hospitals), `vendors.json`, `devrev_stages.json`

Snapshot the KC data into `seed/` ahead of time. Never fetch it live during the demo.
