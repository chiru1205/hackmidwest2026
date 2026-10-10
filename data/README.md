# data/ — seed data and runtime files

- `seed/kc_potholes.json`: 450 real KC 311 pothole points (rebuild with `scripts/build_seed.py`). 60 are seeded as map clusters; all are used for address lookup.
- `seed/neighborhoods.geojson`, `seed/zones.json`: real neighborhoods, council districts, schools, hospitals (rebuild with `scripts/build_geofences.py`).
- `seed/pois.json`, `seed/vendors.json`: location criticality points and the vendor roster.
- `seed/devrev_plan.json`: the planned DevRev baseline tickets (`scripts/devrev_prefill.py`, dry-run by default).
- `photos/seed/`: 38 generated placeholder photos (`seed/make_photos.py`) used by the seeded clusters.
- `civicflow.db*` and `photos/r_*.jpg`: runtime data, gitignored, recreated on first start or Reset.

Snapshot the KC data into `seed/` ahead of time. Never fetch it live during the demo.
