# Civic Flow — API and layer contract (first run)

Data shapes: `contracts/models.py` (Python) and `contracts/types.ts` (TypeScript). Read both first.

## Run model (zero infrastructure, no Docker)
- Python: `code/.venv` (3.12). From `code/`: `.venv\Scripts\python -m uvicorn backend.api.main:app --port 8000 --reload`
- Imports are rooted at `code/`: `from contracts.models import Cluster`, `from backend.engine import dedup`, `from backend.agents import ...`, `from backend.integrations.devrev import ...`. Every folder under `backend/` and `contracts/` has an `__init__.py`.
- Storage: SQLite file at `DB_PATH` (default `code/data/civicflow.db`). Geo index and edge cache are in memory by default; Valkey is optional (`VALKEY_URL`, flag `EDGEKV_BACKEND=valkey`) and every code path must work without it.
- Config via env (see `.env.example`), loaded with python-dotenv from `code/.env` if present. Missing keys must never crash the app: degrade to the fallback.
- Frontend: Vite dev server on 5173, proxies `/api` to `http://localhost:8000`. `VITE_MOCK=1` runs with no backend.

## Constants (engine owner implements exactly)
Radii in metres: category: R_auto / R_max
`pothole 15/40, streetlight_out 20/50, traffic_signal 60/60, sidewalk_damage 20/40, manhole_cover 10/25, road_debris 20/50, graffiti 25/50, illegal_dumping 50/100, downed_tree 75/120, flooding 300/400, other 25/50`
Related categories (cat score 0.5): pothole↔manhole_cover, streetlight_out↔traffic_signal. Different otherwise: never merge.

Score (image term dropped, weights renormalised): `score = (0.50*geo + 0.20*cat + 0.15*time) / 0.85`, `geo = max(0, 1 - d/R_max)`, `time = 1` for open clusters (fixed clusters may be reopened if a new report lands within 30 days: treat as a new cluster flagged "reopened" in rationale).
Decision: `MERGE` if `score >= 0.75` or (`d <= R_auto` and same category). `JUDGE` if `0.50 <= score < 0.75`. Else `CREATE`.
Worked check (pothole, R_max 40): d=10 → 0.853 MERGE; d=30 → 0.559 JUDGE; d=35 → 0.485 CREATE.

Priority: `P = 100 * min(1, 0.30*S + 0.25*R + 0.15*H + 0.15*L + 0.10*A + 0.05*W)`
`S=(severity-1)/4` (max severity among reports), `R=min(1, log10(1+u)/log10(1001))` (u = unique reporters), `H=1 if hazard else 0`, `L=location_crit`, `A=min(1, age_days/SLA_days)` (SLA: pothole 7, hazard 2, streetlight 10, flooding 1, default 14), `W=0`.
Buckets: `>=80 P1`, `60-79 P2`, `35-59 P3`, else `P4`. Ticket severity: P1 blocker, P2 high, P3 medium, P4 low.
Check: severity 3, residential (L=0.2), 1 reporter → 20.5; 1000 reporters → 43. Severity 5 hazard, school zone (L=1.0), 1 reporter → 62.5.
A ticket is created when a cluster is created and updated only when the bucket changes or reporter_count hits a milestone (1, 5, 10, 25, 50, 100, 250, 500, 1000).

Points: first report +50, "me too" confirm +5, confirm with photo +15, cluster fixed +100 to the first reporter, +20 to other reporters. Levels: Resident 0, Watcher 250, Guardian 1000, Champion 3000, Civic Hero 10000.
Anti-fraud: accuracy_m > 100 → reject ("location too imprecise") unless demo_mode; max 10 reports/hour per user (skipped in demo_mode); one report per user per cluster (a second one is a friendly "already counted" `merged` result with 0 points); same photo hash (imagehash pHash, Hamming <= 6) from a different user in 30 days → reject as duplicate photo (skipped in demo_mode).

## HTTP API (all under `/api`, JSON, user identity via header `X-User-Id`, default `u_you`)
| Method + path | Body / query | Returns |
|---|---|---|
| `GET /api/health` | | `Health` |
| `POST /api/reports` | multipart form: `lat, lng, accuracy_m, category, note, severity` (optional), file `photo` (optional) | `ReportResult` |
| `POST /api/clusters/{id}/confirm` | JSON `{lat, lng, accuracy_m?}` ("me too", no photo) | `ReportResult` |
| `GET /api/nearby` | `?lat&lng&category&radius_m=` | `NearbyResult` (served from the edge cache) |
| `GET /api/clusters` | `?status=&min_priority=&limit=` | `Cluster[]` sorted by priority desc |
| `GET /api/clusters/{id}` | | `ClusterDetail` |
| `GET /api/me` | | `Profile` |
| `GET /api/me/reports` | | `Cluster[]` the user reported or confirmed |
| `GET /api/leaderboard` | `?scope=users` | `LeaderboardEntry[]` |
| `GET /api/tickets` | | `Ticket[]` newest first |
| `POST /api/tickets/{id}/advance` | JSON `{stage}` | `Ticket` (also updates the cluster status and emits events) |
| `GET /api/vendor/orders` | `?vendor=` | `VendorOrder[]` |
| `POST /api/vendor/orders/{cluster_id}/fix` | multipart optional `photo` | `Cluster` (stage → resolved, cluster fixed, points awarded, events emitted) |
| `GET /api/stats` | | `Stats` |
| `GET /api/impact` | | `Impact` (see below) |
| `GET /api/events` | SSE, `?since=<id>` replays the last 200 events | stream |
| `GET /api/events/recent` | `?limit=50` | `Event[]` |
| `POST /api/admin/simulate` | `SimulateRequest` | `{started:true}`; runs in the background, emits `simulate.progress` |
| `POST /api/admin/reset` | | `{ok:true}`; wipes DB, caches, then re-seeds |
| `GET/POST /api/admin/flags` | `Flags` (partial) | `Flags` |
| `GET /photos/{name}` | | stored photo files (static mount, not under /api) |

SSE format: each event is `data: <Event JSON>\n\n` (default `message` event type, so the browser `EventSource.onmessage` works), plus a `: ping` comment every 15 s. Event ids increase by 1.
Event `data` payloads: `report.received {report_id, user_id, lat, lng}`, `cluster.created|merged|updated {cluster: Cluster, outcome, points}`, `agent.node` = an `AgentStep` plus `{report_id, cluster_id}`, `ticket.created|updated {ticket: Ticket}`, `stats.updated {stats: Stats}`, `simulate.progress {done, total}`, `reset {}`.

`Impact`: `{headline, facts:[{label, value, note, estimate, source}]}`. Facts (label → value, estimate?): "Pothole 311 requests, KC 2025" → "about 9,700" (data.kcmo.org d4px-6rwg); "Median days to close" → "13 (90th percentile 51)"; "Requests within 50 m and 30 days of an earlier one" → "about 28%" (estimate); "Canceled pothole requests, 2025" → "30%"; "NYC potholes formally closed as duplicates" → "8.8%"; "Average US pothole repair cost to drivers" → "about $600" (AAA); "Extra yearly cost of poor roads, KC driver" → "$704" (TRIP 2020).

## Layer interfaces (Python, all `async def` unless noted; every call must work with no network)
The API layer (`backend/api`) calls these. Implemented by the agents/integrations layer:

```python
# backend/agents/__init__.py
Emit = Callable[[str, dict], None]   # emit("agent.node", {...AgentStep fields, "report_id", "cluster_id"})

async def analyze_photo(image: bytes, note: str, category_hint: str | None, emit: Emit) -> Triage | None
    # None when VISION is off or the call fails; the API then trusts category chips + note.

async def judge_dedup(new_report: Report, candidates: list[Cluster], scores: dict[str, float], emit: Emit) -> dict
    # returns {"decision": "merge"|"new", "cluster_id": str|None, "confidence": float, "reason": str}
    # Only called for the 0.5-0.75 band. Falls back to a rule judge (merge if the best score >= 0.6).

async def run_new_cluster_pipeline(cluster: Cluster, report: Report, emit: Emit) -> dict
    # priority rationale (LLM text, falls back to a template) + dispatch (plain Python: create ticket,
    # assign vendor). Returns {"rationale": str, "ticket": Ticket, "vendor": str | None}
```
```python
# backend/integrations/devrev/__init__.py   (mock ticket board, DevRev-shaped; table `tickets` in DB_PATH)
def create_ticket(cluster: Cluster, title: str, body: str, vendor: str | None) -> Ticket
def update_ticket(cluster: Cluster, title: str | None = None, body: str | None = None) -> Ticket | None  # severity from bucket
def set_stage(ticket_id: str, stage: TicketStage) -> Ticket | None
def get_ticket(ticket_id: str) -> Ticket | None
def list_tickets(limit: int = 100) -> list[Ticket]
def pick_vendor(category: str) -> str          # seeded vendors, round-robin by category

# backend/integrations/storage/__init__.py
def store_photo(name: str, data: bytes) -> str   # returns a URL path like "/photos/<name>"

# backend/integrations/ai/__init__.py
async def chat_json(system: str, user: str, max_tokens: int = 400) -> dict | None   # Akamai hosted chat; None on any failure
async def chat_text(system: str, user: str, max_tokens: int = 200) -> str | None
```
The engine (`backend/engine`, pure Python, no network) exposes:
```python
# geo.py
def haversine_m(lat1, lng1, lat2, lng2) -> float
def geohash(lat, lng, precision=7) -> str; def neighbors(cell: str) -> list[str]
# dedup.py
def radii(category) -> tuple[float, float]            # (R_auto, R_max)
def score_candidate(report_lat, report_lng, report_category, cluster: Cluster) -> tuple[float, float]  # (score, distance_m)
def decide(candidates: list[tuple[Cluster, float, float]]) -> dict   # {"action": "merge"|"judge"|"create", "cluster": Cluster|None, "score": float, "distance_m": float, "scores": {id: score}}
# priority.py
def compute_priority(cluster: Cluster, now) -> tuple[float, Bucket]
def ticket_severity(bucket) -> TicketSeverity; def is_milestone(reporter_count: int) -> bool
# xp.py
def level_for(xp: int) -> tuple[str, int]    # (name, next_level_xp)
# edgekv.py   EdgeKV-shaped cache (namespace / group / item), in-memory by default, Valkey if configured
class EdgeKV: def get(self, namespace, group, item) -> Any | None; def put(self, namespace, group, item, value, ttl_s=None) -> None; def delete(...)
```

## Demo data and users
- Seed (data owner): `data/seed/kc_potholes.json` (about 400 real KC 311 pothole points: `lat,lng,address,neighborhood`), `pois.json` (schools/hospitals/arterials with `lat,lng,kind`), `vendors.json` (KC Road Crew Co. → pothole/sidewalk/manhole/road_debris; BrightLine Lighting → streetlight/traffic_signal; GreenLeaf Urban Services → downed_tree/illegal_dumping/graffiti/flooding). Seeded clusters are `simulated: true`.
- Hotspot: one seeded cluster near 39.0420, -94.5950 (Country Club Plaza area) with 211 unique reporters, severity 4, P1/P2, with a ticket, used for the "You + 212 neighbors" demo moment.
- Demo users: `u_you` (the phone user), plus about 25 named seed users for the leaderboard.
- Neighborhood for a point: nearest of a small list of KC neighborhoods (Westport, Crossroads, Plaza, River Market, Brookside, Waldo, Midtown).
