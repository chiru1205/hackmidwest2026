# Civic Flow — Who Builds What (v2, local-first)

Source of truth for details: [ARCHITECTURE.md](ARCHITECTURE.md) (Section 0 wins). Repo: `code/`.

## What changed from v1
- **Runs on laptops first.** Valkey + Postgres via Docker (`infra/docker-compose.dev.yml`), API and web app run natively.
- **Akamai:** one team API key for the hosted models (chat). No vision on that endpoint.
- **AWS:** needs a new account + credits. Until it works, `VISION=off` (category chips + a note) and all agents run on Akamai chat. Bedrock vision is an upgrade, not a dependency.
- **DevRev: out for now.** `DEVREV_MODE=mock` — a built-in ticket board that uses DevRev-shaped payloads, so DevRev can be plugged back in later. Do not claim DevRev on stage.
- **Backend lead (you) also owns the edge layer.** Agents moved to P2 to balance the load.

## Layer ownership

| Layer | Owner |
|---|---|
| `contracts/`, `backend/engine/`, `backend/api/`, edge layer (`engine/edgekv.py`, `optional/edge/`) | **P1 — you** |
| `backend/agents/`, `backend/integrations/` (Akamai AI, AWS, storage, mock tickets), `data/`, `infra/`, `scripts/` | **P2** |
| `frontend/` | **P3** |

---

## P1 — Backend + Edge (you)

| When | Task | Done when |
|---|---|---|
| 12:45-1:15 | `contracts/models.py` (Report, Cluster, Triage, DedupDecision, PriorityScore, Ticket), fixtures, stub FastAPI returning fixtures, `openapi.json`. Start Docker deps | Merged; P3's mock UI runs (**CP0**) |
| 1:15-2:00 | Engine: geo candidates (Valkey GEOSEARCH), per-category radius, scoring, merge/create decision, priority formula + unit tests. 5-table schema (`users, clusters, reports, ledger, kv_meta` + jsonb `events`). `POST /reports` deterministic path | `curl` a report and it merges or creates a cluster (**CP1**) |
| 2:00 | Thin end-to-end with P2 and P3 on localhost | Report → pin → mock ticket (**CP1.5**) |
| 2:00-3:15 | SSE live events, stats, admin (reset, simulate, flags), points ledger, `DEMO_MODE`. **Edge layer v1:** `engine/edgekv.py` — an EdgeKV-shaped cache (namespace / group / item) over Valkey that answers "already reported nearby?" before the database; the API returns `X-CivicFlow-Edge: HIT <ms>` for the UI chip | Phone shows "Already reported by N neighbors" in milliseconds (**CP2, 3:15**) |
| 3:15-4:45 | Hardening: per-cell `asyncio.Lock`, rate limits, pHash fraud check, merge sweep, load test (simulate 1,243 reports in under 15 s). **Edge layer v2:** the real EdgeWorker bundle in `optional/edge/` (`main.js` + `edgekv.js`), unit-tested in Node with mocked modules | Feature freeze (**CP3**) |
| 4:45-5:45 | Bug fixes only, tune thresholds | Release candidate |

**Edge reality check:** deploying a real EdgeWorker + EdgeKV needs an Akamai account with EdgeWorkers entitlement, which a hackathon key does not give. Ask the Akamai mentors once (10-minute cap). Without it, the edge layer is the Valkey-backed version, and you say so honestly in the demo.

---

## P2 — Agents + Integrations + Platform

| When | Task | Done when |
|---|---|---|
| **Now** | AWS account + credits, Bedrock use-case form, test one Claude call. Put the Akamai key in `.env`. Smoke tests: `smoke_akamai.py` (chat, JSON mode, one tool call, `max_tokens` set), `smoke_bedrock.py` | Results posted to the team; flags set (`VISION`, `MODEL_PROVIDER`) |
| 12:45-1:45 | `integrations/ai`: Akamai client with a 50/min token bucket; Strands `OpenAIModel` pointed at Akamai. `integrations/storage` local fallback. **At 1:00 pair with P1** on the Strands graph smoke test. Seed data: KC 311 snapshot, POIs, vendors in `data/seed/` | Strands agent answers via Akamai (**CP1**) |
| 1:45-3:15 | `agents/`: `dedup_judge?` → `priority` → `dispatch` graph (plain-Python dispatch; LLM writes title/body only), `det.py` fallback, hooks. **Mock ticket board** in `integrations/devrev` (`DEVREV_MODE=mock`): create/update ticket, vendor assignment, stages Reported → Assigned → In progress → Fixed. `seed.py` | Photo/report → ticket on the board → advance → Fixed on phone (**CP2**) |
| 3:15-4:45 | `simulate.py`, `reset.py` (flush `phash:*`, `rl:*`, `evt:stream`). If AWS works: Intake vision agent (`VISION=on`). If a Linode account verifies: deploy there so "Powered by Akamai Cloud" is real | Dry run #1 with P3 (**CP3**) |
| 4:45-5:45 | Secrets sweep, submission checklist, 90 s backup video with P3 | Submission ready |

---

## P3 — Frontend + Design + Demo

| When | Task | Done when |
|---|---|---|
| 12:15-12:45 | Vite + React scaffold, design tokens, mock layer on fixtures (`VITE_MOCK=1`) | UI runs (**CP0**) |
| 12:45-1:45 | Report screen (camera, GPS, compress, category chips + note for `VISION=off`), map, status tracker | Works on mocks (**CP1**) |
| 1:45-3:15 | XP / badges / leaderboard, SSE client, switch to the real API after CP1.5, hero reveal ("You + 212 neighbors"), edge chip ("Edge HIT · 9 ms") | Real API works (**CP2**) |
| 3:15-4:45 | Ops Theatre: live map, pipeline animation, counters, ticket board feed, Simulate. Vendor page. City Impact panel (verify every number) | Dry run #1 on a phone (**CP3**) |
| 4:45-5:45 | Polish, 390 px and big-screen checks, demo panel, speaker notes, presenter and projector setup | Demo ready |

Phone testing: camera and GPS need HTTPS. On the laptop `localhost` works; for a phone run `cloudflared tunnel --url http://localhost:5173`.

---

## Shared
- Checkpoints: CP0 12:45 · CP1 1:45 · **CP1.5 2:00** · **CP2 3:15** (vertical slice) · **CP3 4:45** (freeze) · CP4 5:45 · CP5 6:15.
- `contracts/` changes need all three to approve. `main` only, short branches. No secrets in git.
- If a checkpoint slips, add no scope; cut from the bottom of the cut list in ARCHITECTURE.md section 15.
