# Civic Flow - Final Architecture (HackMidwest 2026)

Status: FINAL for build. Written Sat Oct 10 2026, T+0 = 12:15 PM. Team stop = ~6:15 PM (5-6 h budget). Event code freeze = Sun 8:00 AM, demos 9:00 AM, awards 11:30 AM (hard facts, confirmed on hackmidwest.com).
Base = Proposal B (ship-safe MVP). Grafted from C: story-first hero moments, real KC seed data, demo panel, Akamai token bucket, advisory lock. Grafted from A: judge_log + per-node trace, separate reusable dedup MCP, "Powered by Akamai" proof. All judge must_fix items are folded in (marked FIX).

Legend: `[V#]` = unverified or unverifiable, must be checked at T+0 (table in section 3). Anything refuted by fact-checkers is not used.

---

## 0. AMENDMENTS (12:40 PM) - this section WINS over anything below that conflicts

Two inputs arrived after the draft: (1) the team confirmed it IS an official corporate team, (2) a red-team review judged the draft **35-40% over what 3 people can build in 5-6 h**. Everything below is the corrected plan.

### 0.1 Prize targets (corporate team confirmed)
- **Primary targets:** Best Design, Most Impactful, Best Use of Data, Best AI, Most Innovative, Best in Show + AWS Strands + Akamai Cloud AI.
- **Culture Champs** goes to the company that fields the most teams. Nothing we build changes it. Ask how many teams the company registered.
- **Consequence:** polish is now a scoring feature, not an extra. Protect these in this order: (1) H1 phone hero moment, (2) Ops Theatre storm collapse, (3) City Impact panel (Best Use of Data: live KC 311 data + dedup analytics), (4) vendor loop.
- Still ask organizers only about headline $10,000 eligibility and whether one team can win several sponsor prizes.

### 0.2 Scope cuts (red-team verdict)
1. **dedup-mcp (DevRev prize track): go/no-go at 2:00 PM, not 4:45.** GO only if (a) a DevRev playground exists AND (b) organizers answer in writing that one submission may include it (one project per team). Otherwise cut it entirely. If GO, ship it as a separate container + token with ONLY the Enterprise-Bench adapter loaded.
2. **`/edge` bundle and Open311 endpoint: only if idle after 4:45.** EdgeKV is capped at the 20-minute Valkey adapter.
3. **Collapse the data layer:** ONE uvicorn worker, per-geohash6 `asyncio.Lock` plus one global lock for simulate. NO pg advisory locks, NO pgvector, NO `cluster_emb`, `EMBED=off`. About 5 tables: `users, clusters, reports, ledger, kv_meta` plus one jsonb `events` table (judge_log, agent_traces, status_events). Valkey is the hot store; Postgres is durable only.
4. **Dispatch is deterministic Python.** Ticket creation and vendor assignment are plain code; the LLM writes only ticket title + body. Target under 10 s from photo to ticket.
5. **3D map fly-in and the before/after compare slider are polish-only, after CP3.**
6. **The "Powered by Akamai" strip is generated from `/healthz` live flags**, so it never claims a service that is switched off.

### 0.3 Technical fixes (blockers found in the code skeleton)
1. `run_intake` and every Agent call outside the Graph: use `await agent.invoke_async(...)` (or `asyncio.to_thread`). A sync call inside `async def` freezes SSE for 3-8 s.
2. **Akamai-backed nodes (judge, priority): do NOT set `structured_output_model`** (Strands raises instead of returning text, so the "parse JSON" fallback can't work). Prompt for strict JSON, set `max_tokens` (Akamai default 512 truncates), validate with Pydantic in code, fall back to the rule judge or a templated rationale. Use `structured_output_model` only on the Bedrock nodes (Intake).
3. Graph edge conditions must be pure and read-only. Log and apply policy once in the orchestrator after `stream_async` finishes. Enforce tool policy with `BeforeToolCallEvent` or inside the tool closure, not `AfterToolCallEvent`.
4. Valkey has no `GEOREM`. Remove geo members with `ZREM geo:open:<group> <id>`.
5. **`DEMO_MODE` flag (admin devices only):** relaxes the GPS-accuracy gate, indoor/screen validity checks, pHash fraud and rate limits. Say on stage that it is a demo affordance.
6. `/admin/reset` must flush `phash:*`, `rl:*`, `emb:*`, `evt:stream`, truncate reports + ledger, then re-seed. Otherwise rehearsals #2-#3 get flagged as fraud.
7. **Demo photos:** someone goes outside after kickoff and photographs 3 real cracks or potholes near the venue (compliant with the fresh-code rule); keep them on the demo phone. For the hotspot beat, say "location override for the demo" on stage, or seed the hotspot on the venue's street.
8. **AWS depth:** make the priority node call a real tool through `MCPClient(url=...)` against a tiny in-repo MCP server that reuses the engine (about 30 min), and show tool calls in the pipeline UI. Keep the BeforeToolCall guard + AfterToolCall audit hooks.

### 0.4 Process fixes
1. **New checkpoint CP1.5 at 2:00 PM:** thin end-to-end on the Linode (curl a report -> pin appears -> mock ticket). Build the web app locally and `rsync dist/`; cache the Python dependency layer so deploys take under 60 s.
2. **P2 pairs with P1 at 1:00** on the Strands Graph + Akamai smoke tests (V3/V4). Pull P2's DevRev closure tools and poller forward.
3. **Linode is a single point of failure:** a second teammate creates a Linode account with their own card in parallel; apply the promo to whichever verifies first. Never silently fall back to non-Akamai hosting.
4. **P2's first 5 minutes:** walk to the Akamai, DevRev and AWS tables and ask "what did we miss at kickoff?" (kickoff was 9:30 AM; keys, promo and workshops may already have happened).
5. **Owners for items the draft left open:**

| Item | Owner | By |
|---|---|---|
| Local dev env (Docker Desktop/WSL2, Python 3.12 + venv/uv, Node 22, `make dev` that starts Valkey + Postgres) | P1 | 1:00 |
| Secrets vault (shared password manager) + how P2 distributes `.env` (scp to the Linode box) | P2 | 12:45 |
| Submission checklist: where/how to submit, whether public repo / README / demo video is required, who files | P2 | 3:00 |
| Presenter, projector/HDMI, phone mirroring, hotspot, second charged phone, slot time | P3 | 4:45 |
| 10-minute Strands tool-call test against `hackathon-chat` (which model backs it is unknown) | P1 (inside V3) | 12:45 |
| Repo: use the existing `code/` folder (git already initialised at 12:24) as repo root | P1 | now |

---

## 1. TL;DR

- **What we ship:** a phone web app + a big-screen "Ops Theatre" + a vendor page, all served from ONE Akamai Cloud Linode (docker compose). Duplicate reports are killed by deterministic geo + category + time logic (zero LLM calls); Strands agents run only for new or ambiguous issues.
- **Agents:** Bedrock Claude Haiku 5.5 does vision intake and ticket dispatch; Akamai-hosted `hackathon-chat` does the text-only dedup judge and priority rationale. Intake runs as a standalone Agent (images never enter the Graph). The Strands Graph is `dedup_judge? -> priority -> dispatch`, built per request. Deterministic steps live outside the Graph (FIX).
- **Prize reality:** winnable = AWS Strands $2,500, Akamai Cloud AI $2,500. DevRev $2,500 is winnable ONLY through a separate Enterprise-Bench-only skill/MCP connector (owned deliverable, Person 2). Best Design / Most Impactful / Best Use of Data / Best AI are corporate-team awards and the team IS an official corporate team: PRIMARY targets (see Section 0). Culture Champs depends on the company's team count, not the build.
- **Risk control:** contract-first (mock frontend from minute 30), an env flag + tested fallback for every external dependency (`AGENTS_MODE`, `DEVREV_MODE`, `VISION`, `EMBED`, `STORAGE`, `MODEL_PROVIDER`), `/healthz`, auto-watchdog, 90 s backup video. Vertical slice at 3:15 PM, feature freeze 4:45 PM.
- **Honesty rules for the demo:** EdgeKV is an "EdgeKV-shaped cache on Valkey" (real EdgeWorker bundle sits in `/edge`, dormant). Simulated reports are labeled simulated; at least one report is fully real. DevRev REST ticketing is a product integration, not the DevRev prize entry.

**One-sentence pitch:** Civic Flow turns thousands of citizen photos of the same pothole into ONE priority-ranked, vendor-assigned DevRev ticket - and lets every reporter watch it go from Reported to Fixed.

---

## 2. Prize strategy reality check

Facts from the fact-check (authoritative). One project per team. Sponsor judging method is "subject to organizer confirmation" on the challenge site, so it may change.

| Prize | Value | Winnable by us? | What it actually requires (verbatim-ish) | Our plan | Confirm with |
|---|---|---|---|---|---|
| AWS - Best Use of Strands Agents SDK | $2,500 cash | YES (primary target) | "Does the project integrate Strands Agents SDK?" + "unique and innovative and/or creative use of Strands". Python SDK is described but not mandated | Python Strands: standalone multimodal structured-output Agent, per-request Graph with conditional edges, closure tools, hooks, 2 model providers in one workflow (Bedrock + Akamai), MCP server + Strands MCPClient smoke test, live pipeline view from `stream_async`. Depth must be visible on screen | AWS table: do they need Bedrock or AgentCore specifically? Are Bedrock accounts provided? |
| Akamai - Cloud: AI Challenge | $2,500 cash | YES (primary target) | Working AI app on Akamai Cloud beyond a basic chatbot; "Did you use available Akamai Cloud resources and/or AI inference?" ("Powered by Akamai"). $300 credit via promo link; hosted inference. EdgeKV/EdgeWorkers are NOT in the prize text | Whole stack on a Linode; Object Storage; Valkey; pgvector; hosted chat + embedding + (pre-generated) image. "Powered by Akamai" strip + Cloud Manager flash in demo | Akamai mentors: key, live limits, card/ID verification delay, EdgeKV sandbox (10 min cap) |
| DevRev - Make enterprise work reusable | $2,500 cash | ONLY via separate artifact | Reusable skill or MCP connector in DevRev Computer; use ONLY synthetic Enterprise-Bench data (no real/custom data, no live external enrichment); reusable by another authorized colleague on different records; registration form = request for access, not instant login | Section 10.4: standalone `dedup-mcp` + SKILL.md, Enterprise-Bench only, Person 2, start by 3:15. Register at minute 0. Civic REST ticketing = separate, labeled integration. NEVER feed civic data into the challenge component | DevRev SE: playground ETA, Enterprise-Bench access path, may a civic REST side integration coexist? Get answer in writing |
| Headline "$10,000 cash + 25 trophies" | $10,000 | UNKNOWN | Eligibility not stated on page | Build a polished, real-feeling demo anyway (general judging) | Organizers |
| Best Design, Most Impactful, Best Use of Data, Best AI, Most Innovative, Best in Show | trophies | YES (confirmed official corporate team) | "Enter an official corporate team (or two)..." (Best AI verbatim; others near-identical) | PRIMARY targets. Design and demo polish are scoring features (Section 0.1). Best Use of Data = live KC 311 data + dedup analytics in the City Impact panel | - |
| Culture Champs | trophy | Not by building | Corporate-challenge award for the company bringing the most teams | Ask how many teams the company registered; nothing to build | Teammates |
| Best FinTech App (Flex) | $2,500 | No fit | Platform challenge, civic app is not fintech | Ignore | - |
| USDA AI Challenge | non-cash | Marginal | Letters of recommendation, networking, swag | Ignore | - |

**General judging (applies to everything):** 0-10 on value/impact/usefulness, innovation/uniqueness, realness/completeness, from a "joe average web jockey" view. Code quality is NOT judged. 3-minute LIVE demo, NO slides, and you must state which sponsor tech you used (say it in the first seconds).

**Ask organizers in the first hour (one person, Person 2, one message each):**
1. Corporate-team eligibility for Best Design/Most Impactful; headline prize eligibility; can one team win multiple sponsor prizes?
2. DevRev SE (in writing): playground ETA; how Enterprise-Bench is exposed; is a civic REST integration allowed alongside?
3. Akamai: team inference key, live limits, EdgeKV sandbox yes/no (stop asking after 10 min).
4. AWS: Bedrock provided? Any Bedrock/AgentCore requirement?
5. Demo logistics: HDMI/adapter, venue Wi-Fi vs our phone hotspot, slot time.

---

## 3. First 20 minutes checklist

Principle: start every slow-to-provision thing first, in this order. Person 2 runs accounts; Person 1 and 3 never wait on them (local compose + mocks).

| # | Min | Owner | Action | Done signal |
|---|---|---|---|---|
| 1 | 0-3 | P2 | Linode signup via promo link (from starter README: `http://login.linode.com/signup?promo=akm-dev-hack-mid-300-100826-K277`). Card + identity verification may block; add P1/P3 as users. | Can open Cloud Manager |
| 2 | 0-3 | P2 | Submit DevRev challenge Google Form (team registration). Create a SEPARATE DevRev org for Civic Flow (not the playground) and a PAT. | Form submitted, PAT in vault |
| 3 | 0-5 | P2 | Bedrock: submit Anthropic use-case form if prompted; AWS bearer token. Get an Anthropic API key as fallback. | Keys in vault |
| 4 | 0-5 | P2 | Collect Akamai team key (`hk_...`) from organizers/workshop. | Key in vault |
| 5 | 0-5 | P1 | `git init` in the project dir (history starts AFTER 9:30 kickoff; FIX fresh-code rule). Earliest existing file timestamp is 11:48 AM, so everything present is compliant. Delete/ignore `civicflow-design.tmp.js` or keep it out of the repo. | First commit |
| 6 | 0-10 | P2 | Create Linode g6-standard-2 (Ubuntu 24.04), Cloud Firewall allow 22/80/443 (starter script only opens 22 and 8000 - edit it or create by hand; read `scripts/deploy_linode.sh` first, NEVER run `down.sh`). Install Docker. | SSH works [V11] |
| 7 | 5-10 | P2 | Object Storage bucket `civicflow-photos` + access keys (secret shown once - copy it). Note the endpoint for the bucket's region (`us-sea-1.linodeobjects.com` from research is unverified [V15]). | boto3 put/get from laptop |
| 8 | 5-15 | P2 | Run V1 (Bedrock image Converse test) and V2/V3 (Akamai smoke) - table below. Set flags to fallback values immediately if they fail. | Results posted in team chat |
| 9 | 5-20 | P1 | Contracts: Pydantic models, event catalog, fixtures, stub FastAPI returning fixtures (section 9). | Merged to main |
| 10 | 5-20 | P3 | Vite scaffold, tokens, mock API reading fixtures, app shell. | UI runs with `VITE_MOCK=1` |
| 11 | 10-20 | P2 | Ask mentors/organizers the questions in section 2 (EdgeKV capped at 10 min). | Answers logged |

Provisioning order summary: Linode account -> DevRev form/org/PAT -> Bedrock/Anthropic -> Akamai key -> Linode VM + firewall -> Object Storage -> smoke tests. Managed PostgreSQL is skipped entirely (FIX: Linode paused Managed DB sales; the lab's 20-30 min estimate does not apply; use the pgvector container). No PostGIS.

### Verify at T+0 (unverifiable or partially verified claims)

| ID | Claim to verify | How | Owner / by | If it fails |
|---|---|---|---|---|
| V1 | Bedrock Haiku 5.5 profile `us.anthropic.claude-haiku-5-5` works in Converse with an image + structured output. SDK table has NO haiku-5-5 entry. Do not set temperature or forced tool_choice. | `scripts/smoke_bedrock.py` (one image call, one structured-output call) | P2 / 12:30 | `MODEL_PROVIDER=anthropic` (model id `claude-haiku-5-5` is itself unverified - check on first call); then `VISION=off` |
| V2 | Akamai endpoint, limits (60 req/min total, 6 img/min, 100k tokens/min, 32,768 ctx, 4,096 max out, default output 512), "to confirm" labels in docs | Read `docs/inference.md` in `akamai-developers/akamai-workshop-hackmidwest` with the real key; ask instructors | P2 / 12:30 | Adjust token bucket numbers in `.env` |
| V3 | Strands `OpenAIModel` -> `https://ws.akamai-workshops.com/v1`: `client_args` base_url forwarding, structured output, one tool call, `finish_reason=="length"` check. Chat + embeddings ignore the model name. | `scripts/smoke_akamai.py` | P1 / 12:45 | Structured output: parse JSON from text. Tool calls flaky: `PRIORITY_MODEL`/`JUDGE_MODEL=haiku` |
| V4 | Strands 1.59.0 API details: `GraphBuilder.set_max_node_executions`/`set_execution_timeout` exist; `add_node(agent, id)` and `add_edge(id, id, condition=fn)` signatures; where a node's `structured_output` sits in graph state/result; `stream_async` event field names; `Agent(hooks=[...])`; `AfterToolCallEvent` attributes; `from strands.tools.mcp import MCPClient`; pip extras names (`openai`, `anthropic`) | `grep` site-packages + a 20-line graph smoke test | P1 / 1:15 | `AGENTS_MODE=det` (same events, plain functions) |
| V5 | DevRev `works.create`: required = `type`, `title`, `applies_to_part` (owned_by appears OPTIONAL, send it anyway); `Authorization: Bearer <PAT>` (also test raw token); severity enum `blocker/high/medium/low`; `tags` payload shape; ticket `group` field; `external_ref` behavior (do NOT rely on it for idempotency) | `scripts/smoke_devrev.py`: create, re-create same external_ref, get | P2 / 1:30 | Priority goes in tags + body; vendor goes in tag + body; `DEVREV_MODE=mock` |
| V6 | DevRev stage names (`queued`, `work_in_progress`, `resolved` plausible; `awaiting_customer_response`, `canceled` unconfirmed) | Move a ticket in the DevRev UI, read `stage.name` via `works.get`; save to `seed/devrev_stages.json` | P2 / 1:30 | Unknown stage = "In progress" in citizen UI |
| V7 | Webhooks: `work_updated` event exists? HMAC (`X-DevRev-Signature`, HMAC-SHA256) hex vs base64? | One live delivery, test both. Polling stays the primary path regardless | P2 / only if time | Polling |
| V8 | DevRev remote MCP `https://api.devrev.ai/mcp/v1` (research says 401 without auth; fact-check says unverified) | `curl -i` once. NOTHING depends on it | P2 / optional | Cut (concierge is on the cut list) |
| V9 | DevRev Computer connector requirements (public HTTPS, Streamable HTTP, Bearer, admin registers, Resync after tool change) and how Enterprise-Bench is exposed | Ask DevRev SE; read the connector UI when playground arrives | P2 / 3:15 | Skill-only (SKILL.md) variant; local demo clip |
| V10 | EdgeKV ~10 s consistency; `edgekv.js` helper names (`getText/getJson/putText/putJson/delete`); sandbox access | Read the edgekv.js README; mentors (10 min cap) | P2 / gate 3:00 | Adapter only; bundle is mock-tested in Node |
| V11 | Starter kit: server framework and `deploy_linode.sh` internals (not read by fact-checker); promo needs card/ID? | Read `agent/server.py`, `scripts/` | P2 / 12:45 | We write our own FastAPI app anyway |
| V12 | Pinned frontend/backend versions install (only `strands-agents==1.59.0` was verified on PyPI). OpenFreeMap reachable on venue Wi-Fi. KC 311 Socrata `d4px-6rwg` snapshot downloads. Every number in the City Impact panel re-checked before it is shown | `npm i`, `pip install`, `curl` | P3, P2 / 1:30 | Take the nearest compatible minor; raster OSM tiles; hardcode verified numbers or hide the panel |
| V13 | Fresh-code rule: nothing produced before 9:30 AM kickoff | `ls -la` timestamps (done: earliest 11:48 AM) | P1 / 12:20 | Rebuild or disclose to organizers |
| V14 | Sponsor judging method and prize eligibility | Organizers | P2 / 1:15 | Plan unchanged |
| V15 | Object Storage region endpoint; server-side upload so browser CORS/presign is not needed | boto3 test | P2 / 12:45 | `STORAGE=local` |

---

## 4. System architecture

```mermaid
flowchart TD
  subgraph Phone["Citizen phone - React PWA over HTTPS"]
    R1["Report: camera + GPS + category chip"]
    R2["Map, Track, Rewards"]
  end
  subgraph Big["Laptop - Ops Theatre /live and Vendor /vendor"]
    O1["Live map, pipeline view, counters, judge card"]
    V1["Work order, before/after, Mark fixed"]
  end
  subgraph Linode["Akamai Cloud Linode g6-standard-2 - docker compose"]
    CADDY["Caddy 2.8 TLS on sslip.io + static build + SSE proxy"]
    API["FastAPI + sse-starlette"]
    ENG["engine pkg: geo dedup, scoring, priority, XP, EdgeKV-shaped adapter"]
    AG["Strands: Intake Agent then per-request Graph: dedup_judge, priority, dispatch"]
    VK[("Valkey 8: GEO index, cell cache, leaderboard, pubsub, event stream, token buckets")]
    PG[("Postgres 17 + pgvector 1024")]
    POLL["DevRev poller 20 s"]
    MCP["dedup-mcp container - separate deliverable"]
  end
  OBJ[("Akamai Object Storage - photos, badges")]
  AIH["Akamai hosted inference: hackathon-chat, hackathon-embedding"]
  BR["AWS Bedrock - Claude Haiku 5.5 vision + dispatch"]
  DR["DevRev REST api.devrev.ai - Civic Flow org"]
  COMP["DevRev Computer - Enterprise-Bench ONLY"]
  EDGE["/edge EdgeWorker + EdgeKV bundle - dormant unless access granted"]

  R1 --> CADDY
  R2 --> CADDY
  O1 --> CADDY
  V1 --> CADDY
  CADDY --> API
  API --> ENG
  ENG --> VK
  ENG --> PG
  API --> OBJ
  ENG -->|"new or ambiguous only"| AG
  AG --> BR
  AG --> AIH
  ENG -->|"embeddings, ambiguous band"| AIH
  AG -->|"closure tools"| DR
  POLL --> DR
  POLL --> API
  API -->|"SSE events"| O1
  API -->|"SSE events"| R2
  MCP --> ENG
  COMP -->|"public HTTPS, Bearer"| MCP
  EDGE -.same cell-cache logic.-> VK
```

| Component | Responsibility | Tech | Runs on | Owner |
|---|---|---|---|---|
| `contracts` | Pydantic v2 models = single source of truth; exports `openapi.json`, generated TS types, JSON fixtures + SSE replay used by the mock frontend | pydantic, openapi-typescript | repo, build time | P1 (first 30 min, reviewed by all) |
| `engine` (pure Python, no framework imports) | geohash/GEO candidates, per-category radii, score, merge/judge/create decision, priority formula, DevRev severity map, XP/reputation, fraud basics, `merge_clusters`, EdgeKV-shaped cell cache. Domain-agnostic scoring core reused by MCP | Python 3.12, redis-py, psycopg 3, numpy, imagehash | api container | P1 |
| `api` | REST + SSE, upload to Object Storage, admin/demo endpoints, `/healthz`, Open311 (cut-able) | FastAPI, uvicorn, sse-starlette, boto3, httpx | api container | P1 |
| `agents` | Intake Agent, Graph builder, closure tools, hooks, model factory, `AGENTS_MODE=det` runner, watchdog | strands-agents==1.59.0 | api container | P1 |
| `integrations/devrev` | Bootstrap, upsert ticket, vendor assign, comments, 20 s poller, mock mode, optional webhook | httpx (sync client for tools) | api container | P2 |
| `integrations/storage` + `akamai` | Object Storage with local fallback; hosted embedding client with token bucket + semaphore | boto3, httpx | api container | P2 |
| `infra` | Compose, Caddyfile, Linode provisioning, deploy script, secrets, backups, healthz | Docker Compose 2, Caddy | Linode | P2 |
| `dedup-mcp` | Reusable connector: `find_duplicate_tickets`, `explain_priority`, `preview_consolidation`, `record_consolidation`; adapters; SKILL.md | mcp 1.x FastMCP, Streamable HTTP, Bearer | Linode (separate container, route `/mcp`) | P2 |
| `edge/` | Real EdgeWorker `main.js`, `bundle.json`, `edgekv.js`; Node unit tests with mocked modules | JS | repo only (activate only if access granted) | P2 (cut-first, <=45 min total) |
| `seed/` + scripts | KC 311 snapshot, POIs, vendors, hotspot, simulate, reset, badge-art generator | Python | laptop / Linode | P2 (data), P1 (engine hooks), P3 (badge art) |
| `web` | Citizen app, Ops Theatre, Vendor page, demo panel, mock layer | Vite + React + TS + MapLibre | static build served by Caddy | P3 |

Why one box, Vite (not Next/Vercel): the Akamai criterion scores Akamai Cloud use, so the frontend is served from the Linode; same-origin means no CORS; avoids unverified bleeding-edge framework versions and a split-host setup.

---

## 5. Report lifecycle (sequence)

```mermaid
sequenceDiagram
  autonumber
  participant C as Citizen phone
  participant A as API
  participant E as Engine (Valkey GEO + Postgres)
  participant I as Intake Agent (Bedrock Haiku 5.5)
  participant G as Graph (Akamai chat + Haiku dispatch)
  participant D as DevRev
  participant O as Ops Theatre (SSE)
  participant V as Vendor page

  C->>A: POST /api/reports (photo, GPS, chip)
  A->>A: validate accuracy, rate limit, pHash, store photo in Object Storage
  A->>E: decide(report) under advisory lock
  alt fast MERGE (same category, d within R_auto or score 0.75 or more)
    E-->>A: merged, priority recomputed, XP pending
    A-->>C: 200 outcome merged, neighbors N, xp
    A-->>O: SSE report.merged, stats.tick (LLM calls avoided + 1)
    Note over A,D: DevRev touched only on bucket change or milestone
  else CREATE or AMBIGUOUS (score 0.5 to 0.75)
    E-->>A: provisional cluster inserted, GEO updated before commit
    A-->>C: 202 + stream_url
    A-->>O: SSE cluster.created
    A->>I: Intake (photo, structured Triage)
    I-->>A: Triage (category, severity, hazard, visual signature)
    A->>E: apply triage, recompute priority (plain Python)
    opt ambiguous band
      A->>G: dedup_judge node (text only)
      G-->>A: DedupDecision + reasoning
      A-->>O: SSE judge.decision
    end
    alt judge says merge
      A->>E: merge_clusters(provisional to target)
      A-->>C: SSE report.merged
    else new issue
      A->>G: priority node (rationale) then dispatch node
      G->>D: works.create via closure tool (severity from engine)
      D-->>G: ticket id
      G->>A: assign_vendor (validated against options)
      A-->>C: SSE ticket.created, points.awarded
      A-->>O: SSE agent.node (latency, tokens), ticket.created
    end
  end
  loop every 20 s
    A->>D: works.get for open tickets
    D-->>A: stage
    A-->>C: SSE status.changed (Reported, In progress)
  end
  V->>A: POST /api/vendor/work-orders/{id}/fix
  A->>D: works.update stage resolved
  A-->>C: SSE status.changed Fixed, XP confirmed, confetti
  A-->>O: SSE status.changed (pin turns teal)
```

Notes
- Merge path = ZERO LLM calls and ZERO DevRev calls by default. Live real photos on the merge path are stored but not vision-checked (optional background check is on the cut list).
- Simulated reports (`simulated=true`) use the same engine path and never call a model; vision is skipped.
- Every non-merge report creates a provisional cluster immediately (under the lock) so concurrent reports merge into it. If the judge later says "merge", `merge_clusters` moves the reports (also used by the 60 s sweep that merges same-category open clusters within R_auto).

---

## 6. Tech stack

Only `strands-agents==1.59.0` (PyPI latest, uploaded 2026-10-08, Python >=3.10) was verified. All other pins are conservative choices from the proposals: if the resolver or npm refuses one, take the nearest compatible minor [V12]. Do not upgrade anything mid-event.

| Layer | Choice (pin) | Why | Fallback |
|---|---|---|---|
| Backend | Python 3.12, FastAPI 0.115.x, uvicorn 0.32, sse-starlette 2.1, httpx 0.27, pydantic 2.9 | Strands parity, fast for 3 devs | SSE misbehaves behind Caddy: `GET /api/events?since=` poll every 3 s |
| Agent SDK | `strands-agents==1.59.0` (extras `openai`, `anthropic` [V4]); no `strands-agents-tools`, no `strands-harness` | AWS prize; GraphBuilder + `stream_async` drive the pipeline UI | `AGENTS_MODE=det` |
| Vision + dispatch model | Bedrock `us.anthropic.claude-haiku-5-5` via `BedrockModel`, region set explicitly, `max_tokens` set, NO temperature, NO forced tool_choice [V1] | Cheap, vision, not listed as rejecting forced tool_choice | `MODEL_PROVIDER=anthropic` (`AnthropicModel`) then `VISION=off` |
| Judge + priority rationale | Akamai `hackathon-chat` via `OpenAIModel(client_args={api_key, base_url}, model_id="hackathon-chat", params={"max_tokens": 500})`, text only, no vision, no tools in these two nodes [V3] | Free to team, counts for Akamai; no image-400 risk | `JUDGE_MODEL=haiku` / `PRIORITY_MODEL=haiku`; templated text if all LLMs down |
| No Sonnet / Opus at runtime | - | Sonnet 5.5 rejects forced tool_choice and costs ~20x Haiku; keeps token spend low | - |
| Embeddings | Akamai `hackathon-embedding` (1024-d), batched <=16 inputs, cached by sha1 in Valkey, used ONLY on text visual-signatures in the ambiguous band | Weak-signal tie-break; shows hosted inference | `EMBED=off` (drop term, renormalize) |
| Badge art | `hackathon-image` used OFFLINE once (8 images, 512x512, <=6/min, one call at a time) and committed to `apps/web/public/badges` | Avoids runtime dependency and the 6 img/min cap | Hand-made SVG badges |
| System of record | Postgres 17 + pgvector via `pgvector/pgvector:pg17` container; `psycopg[binary,pool]` 3.2; raw SQL in `db/schema.sql`; haversine in Python (no PostGIS) | Instant start | SQLite with same SQL subset |
| Hot state | `valkey/valkey:8`, redis-py 5.2: GEOADD/GEOSEARCH BYRADIUS in meters (confirmed), ZSET leaderboard, pubsub, STREAM for event replay | Sub-ms geo | Haversine over Postgres rows (<=50k rows is fast) |
| Photos | Akamai Object Storage via boto3 1.35, SERVER-SIDE upload from the API (no presign, no browser CORS) | Powered by Akamai, no CORS risk | `STORAGE=local` (`/data/photos` served by Caddy) |
| Ticketing | DevRev REST (`works.create/update/get`, `parts.create`, `accounts.create`, `groups.create`, `tags.create`, `timeline-entries.create`), PAT in header | Deterministic | `DEVREV_MODE=mock` |
| Edge layer | EdgeKV-shaped adapter on Valkey + committed `/edge` bundle | Honest; no contract dependency | Adapter is the fallback |
| Frontend | Node 22, Vite 5.4, React 18.3.1, TypeScript 5.5, Tailwind 3.4, maplibre-gl 4.7.1 (OpenFreeMap `liberty` + `dark` styles), framer-motion 11, zustand 5, canvas-confetti, sonner, openapi-typescript 7 [V12] | Fast, rich map + motion, no bleeding-edge risk | Raster OSM tiles; list view if WebGL fails |
| Hosting | Linode g6-standard-2, Docker Compose 2, Caddy 2.8 auto-TLS on `<ip-dashed>.sslip.io` (needed for camera, geolocation, webhook, Computer connector) | Required for Akamai criterion | If cert issuance is rate-limited: `cloudflared` quick tunnel to the same compose |
| MCP | `mcp` 1.x FastMCP, Streamable HTTP, Bearer, path ends in `/mcp` | DevRev connector | Skill-only variant |

---

## 7. Strands agent design

### 7.1 Shape (FIX: no function nodes, image never enters the Graph)

| Stage | Where it runs | Model / provider | Tools | Structured output | Runs when |
|---|---|---|---|---|---|
| Intake | STANDALONE `Agent` call before the Graph (plain Python) | Bedrock Haiku 5.5 (vision) | none | `Triage` via `structured_output_model` at invocation | CREATE or AMBIGUOUS, live (non-simulated) reports with `VISION=on` |
| `apply_triage` + priority math | Plain Python (engine) | none | - | - | right after intake (deterministic) |
| `dedup_judge` | Graph node (Agent) | Akamai `hackathon-chat`, text only | none (candidates are in the prompt) | `DedupDecision` (constructor `structured_output_model`; JSON-parse fallback) | only if stage-1 score is in 0.5 to 0.75 |
| `priority` | Graph node (Agent) | Akamai `hackathon-chat`, text only | none | `PriorityScore` rationale; numbers come from engine and are overwritten | new issues |
| `dispatch` | Graph node (Agent) | Bedrock Haiku 5.5 | closure tools: `list_vendor_options`, `create_or_update_cluster_ticket`, `assign_vendor`, `add_status_comment` | `TicketRef` | new issues |
| merge handler | Plain Python AFTER the Graph (`engine.merge_clusters`) | none | - | - | judge says merge |

Why Intake is outside the Graph: Graph nodes get the original task + prior outputs. An image in the task would be re-sent to every node (token cost) AND to Akamai nodes, where image input returns 400. The Graph task is text/JSON only.

Graph (built PER REQUEST; never share Agent instances because concurrent invocation raises `ConcurrencyException`):
- Entry = `dedup_judge` if ambiguous else `priority`.
- Edge `dedup_judge -> priority` has `condition=judged_new`. Edge `priority -> dispatch` unconditional.
- If no edge condition is satisfied after the judge (merge), the Graph just ends; post-Graph code does the merge.
- `set_max_node_executions(6)`, `set_execution_timeout(45)` [V4].
- No `session_manager` on any Graph agent (unsupported).
- Concurrency: `asyncio.Semaphore(2)` around Graph runs; Akamai token bucket 50/min via Valkey (reserve ~4 calls per Graph; if empty -> run this request in `det`).

Closure tools beat `invocation_state` for IDs (robust even if the Graph does not forward invocation_state): `make_dispatch_tools(ctx)` binds `cluster_id`, `report_id`, `severity`, `applies_to_part`, owner, vendor options. The LLM supplies only title/summary text and chooses a vendor from `ctx.vendor_options`. The tool rejects anything else. Still read `tool_context.invocation_state` where convenient (`@tool(context=True)`).

### 7.2 Model/provider rules
- `max_tokens` on EVERY model config (Akamai default is 512 and silently truncates; check `finish_reason == "length"` and retry once with higher cap).
- Bedrock: inference-profile IDs only (`us.anthropic...`), explicit region. Never set temperature/top_p; never force tool_choice. System prompts end with "Always respond using the structured output tool." Catch `StructuredOutputException`, retry once, then fall back to chip-based triage (severity 3).
- Use `agent(prompt, structured_output_model=Model).structured_output`. Never call deprecated `agent.structured_output()`.
- MCP: `MCPClient(url=..., headers={"Authorization": "Bearer ..."})` passed in `tools=[...]` (no `streamablehttp_client` wrapper needed). Used in `scripts/mcp_smoke.py`: a Strands agent calls our own `dedup-mcp` `explain_priority` - proves client + server for the AWS judges.

### 7.3 Hooks and streaming to the UI
- `AuditHooks(HookProvider)`: `AfterToolCallEvent` -> insert `agent_traces` row, emit `ticket.created` / `points.awarded`, enforce "IDs only from ctx". Attach via `Agent(hooks=[...])` [V4].
- `graph.stream_async(task_text)` events `multiagent_node_start / multiagent_node_stop / multiagent_result` -> SSE `agent.node {node, phase, ms, tokens_in, tokens_out, model}`. Intake is emitted by the orchestrator so the UI shows 4 stages: Intake -> Dedup -> Priority -> Dispatch (Dedup lights only when the judge ran or as "geo match" otherwise).
- Persist `judge_log` (candidates, decision, confidence, reason, latency, tokens) and show it as the "judge reasoning" card.
- Observability: hook audit table only. OTel/Jaeger/AgentCore are optional and first on the cut list.

### 7.4 Fallbacks
`AGENTS_MODE=det` runs the same stages as plain functions (rule judge, templated rationale, direct DevRev calls) and emits IDENTICAL SSE events so the UI still animates. Watchdog: 2 consecutive Graph failures flips the Valkey flag `flags:AGENTS_MODE` to `det` and shows a small "safe mode" dot in Ops Theatre. Flags are hot-toggled via `POST /api/admin/flags`.

### 7.5 Skeleton

```python
# agents/models.py
from strands.models import BedrockModel
from strands.models.openai import OpenAIModel
from strands.models.anthropic import AnthropicModel

def vision_model():
    if flags.get("MODEL_PROVIDER") == "anthropic":
        return AnthropicModel(client_args={"api_key": ANTHROPIC_API_KEY},
                              model_id=ANTHROPIC_HAIKU_ID, max_tokens=1024)
    return BedrockModel(model_id=BEDROCK_HAIKU_ID, region_name=AWS_REGION, max_tokens=1024)  # no temperature

def akamai_model(max_tokens=500):
    return OpenAIModel(client_args={"api_key": AKAMAI_AI_KEY, "base_url": AKAMAI_AI_BASE_URL},
                       model_id="hackathon-chat", params={"max_tokens": max_tokens})
```

```python
# agents/pipeline.py
async def run_pipeline(ctx):                       # ctx: per-request dataclass (ids, report, candidates, flags)
    triage = await run_intake(ctx)                 # standalone Agent; the ONLY place image bytes are sent
    ctx.apply_triage(triage)                       # plain Python: severity/hazard -> engine.priority -> ctx.priority
    if flags.get("AGENTS_MODE") == "det":
        return await run_det(ctx)
    async with GRAPH_SEM, akamai_bucket.reserve(4):
        graph = build_graph(ctx)
        async for ev in graph.stream_async(ctx.task_text()):      # TEXT/JSON only
            await bus.emit(translate(ev, ctx))                    # -> agent.node SSE
    if ctx.judge and ctx.judge.decision == "merge":
        await engine.merge_clusters(src=ctx.cluster_id, dst=ctx.judge.cluster_id)
    else:
        await engine.finalize(ctx)                 # recompute priority, write status, XP

async def run_intake(ctx) -> Triage:
    agent = Agent(model=vision_model(), system_prompt=INTAKE_PROMPT, callback_handler=None)
    try:
        r = agent([{"text": ctx.intake_text()},
                   {"image": {"format": "jpeg", "source": {"bytes": ctx.jpeg}}}],
                  structured_output_model=Triage)
        return r.structured_output
    except Exception:
        return Triage.from_chip(ctx.category_hint)  # severity 3, VISION-off style

def build_graph(ctx):
    b = GraphBuilder()
    b.add_node(Agent(model=akamai_model(400), system_prompt=PRIORITY_PROMPT,
                     structured_output_model=PriorityScore, callback_handler=None), "priority")
    b.add_node(Agent(model=vision_model(), system_prompt=DISPATCH_PROMPT,
                     tools=make_dispatch_tools(ctx), hooks=[AuditHooks(ctx)],
                     structured_output_model=TicketRef, callback_handler=None), "dispatch")
    b.add_edge("priority", "dispatch")
    if ctx.needs_judge:
        b.add_node(Agent(model=akamai_model(300), system_prompt=JUDGE_PROMPT,
                         structured_output_model=DedupDecision, callback_handler=None), "dedup_judge")
        b.add_edge("dedup_judge", "priority", condition=lambda s: judged_new(s, ctx))
        b.set_entry_point("dedup_judge")
    else:
        b.set_entry_point("priority")
    b.set_max_node_executions(6); b.set_execution_timeout(45)       # [V4]
    return b.build()

def judged_new(state, ctx) -> bool:                # edge condition = plain Python, idempotent
    d = read_structured(state, "dedup_judge", DedupDecision) or DedupDecision.policy(ctx)  # [V4]
    ctx.judge = engine.apply_confidence_policy(d, ctx.category)    # <0.6: merge for potholes, new for lights/signals
    log_judge(ctx, d)                              # judge_log row for the explainability card
    return ctx.judge.decision == "new"
```

---

## 8. Dedup + priority engine

### 8.1 Principle
Deterministic first. Location + category + time decide >90% of reports in <20 ms with no tokens. Image embeddings cannot tell two potholes on one street apart (published near-dup cutoffs ~0.93-0.96; recall collapses), so they are NOT a dedup signal; pHash is a fraud signal only. LLM judge only in the ambiguous band. Repeat calls do not raise priority by popularity (KCMO practice); priority = impact x confidence.

```mermaid
flowchart TD
  A["Report in: lat, lng, accuracy, category chip, photo"] --> B{"accuracy 100 m or better, under rate limit?"}
  B -->|no| X["Reject with friendly reason"]
  B -->|yes| C["pHash cross-user check: same user = reject, other user = fraud flag, no points"]
  C --> D["Take lock set of geohash6 cells; Valkey GEOSEARCH category group within R_max, nearest 5"]
  D --> E{"Candidates?"}
  E -->|none| N["CREATE provisional cluster"]
  E -->|some| F{"Same category and d within R_auto, or score at least 0.75?"}
  F -->|yes| M["MERGE: attach report, unique reporter +1, recompute priority, XP pending"]
  F -->|no| G{"score below 0.5 or d above R_max?"}
  G -->|yes| N
  G -->|no| J["AMBIGUOUS: create provisional cluster, run dedup_judge"]
  J -->|merge| MC["merge_clusters provisional into target"]
  J -->|new| N2["Continue to priority and dispatch"]
  N --> N2
```

### 8.2 Per-category parameters
R_auto = auto-merge radius; R_max = hard max; window = time window (cluster updated within window counts as 1.0).

| Category | R_auto m | R_max m | Window | Notes |
|---|---|---|---|---|
| pothole | 15 | 40 | any open; closed within 30 d | new report on a recently closed cluster = failed fix -> reopen (+10 priority) |
| streetlight_out | 20 | 50 | open | |
| traffic_signal | 60 | 60 | 7 d | intersection-level |
| sidewalk | 20 | 40 | open | |
| manhole_cover | 10 | 25 | open | |
| graffiti | 25 | 50 | open | |
| illegal_dumping | 50 | 80 | 14 d | |
| downed_tree | 75 | 100 | 72 h | |
| water_main_break | 150 | 200 | 72 h | |
| flooding | 300 | 400 | 48 h | |
| default | 30 | 60 | open | |

Demo scope: ship pothole, streetlight_out, flooding, graffiti configs; others use default. Category groups for GEO sets: `road_surface` (pothole, manhole_cover, road_surface), `street_light` (streetlight_out, traffic_signal at 0.5 related), `sidewalk`, `tree`, `water`, `graffiti_dump`. Search radius = R_max of the group.

### 8.3 Score and thresholds
`score = 0.50*geo + 0.20*cat + 0.15*text + 0.15*time`
- `geo = max(0, 1 - d/R_max)`
- `cat = 1` same category, `0.5` related group, `0` never merge
- `text = clamp((cos - 0.6)/0.3, 0, 1)` from `hackathon-embedding` of visual signatures (ambiguous band only, cached). If unavailable or `EMBED=off`: drop the term and renormalize remaining weights
- `time = 1` inside window, linear to 0 at 2x window
- **MERGE** if `score >= 0.75` OR (same category AND `d <= R_auto`). **CREATE** if `score < 0.5` OR `d > R_max`. **JUDGE** otherwise.
- Judge confidence < 0.6: MERGE for potholes (a false merge is cheaper than a duplicate ticket), CREATE for distinct-asset categories (streetlight, signal).
- Worked check, pothole, same category, no text: d=10 m -> auto-merge; d=20 m -> 0.71 (judge); d=25 m -> 0.63 (judge); d=30 m -> 0.56 (judge); d=35 m -> 0.49 (create).
- Cluster location = first report's location (anchor); no centroid drift (prevents a cluster "walking" onto a neighbor).
- Chip category is trusted by the deterministic stage; Intake may correct it afterward (re-decide only if category changes group).

### 8.4 Concurrency (FIX for storms)
- Lock set = sorted distinct geohash6 of the point and its four points offset +-50 m; acquire `pg_advisory_xact_lock(hashtext(gh6))` in sorted order (no deadlock, no cell-edge miss).
- Inside the lock: query Valkey GEO, decide, INSERT, then `GEOADD` BEFORE COMMIT; on exception compensate with `GEOREM`. Valkey is rebuilt from Postgres on API startup.
- `UNIQUE(cluster_id, user_id)` makes +1 idempotent. 60 s sweep merges same-category open clusters within R_auto of each other as a backstop.
- Hosted-model protection: Valkey token bucket 50/min + semaphore(2) on every Akamai call; storm/simulate never reach it beyond first-of-cluster.

### 8.5 Priority (pure function, unit-tested, recomputed on every merge)
`P = 100 * min(1, 0.30*S + 0.25*R + 0.15*H + 0.15*L + 0.10*A + 0.05*W)`

- `S = (severity - 1)/4` (max triage severity across validated reports)
- `R = min(1, log10(1+u)/log10(1001))`, `u` = sum of reputation over UNIQUE reporters (1 -> 0.10, 10 -> 0.35, 100 -> 0.67, 1000 -> 1.0). Framed as confidence, not popularity; reporter term capped at 25% of score
- `H` = safety-hazard flag
- `L` = location criticality from `seed/pois.json`: school or hospital within 150 m = 1.0; arterial 0.8; bus route 0.7; collector 0.5; residential 0.2 (default)
- `A = min(1, age/SLA)`; SLA defaults (assumptions): pothole 7 d, hazard pothole 48 h, streetlight 10 d, flooding 24 h, graffiti 14 d
- `W` = weather flag, manual admin toggle (no weather API). Equity boost E dropped from MVP.

Worked examples (verified arithmetic):

| Case | S | R | H | L | A | P | Bucket |
|---|---|---|---|---|---|---|---|
| Sev 3, residential, 1 reporter | 0.5 | 0.10 | 0 | 0.2 | 0 | 20.5 | p4 Low |
| Same, 1,000 reporters | 0.5 | 1.0 | 0 | 0.2 | 0 | 43.0 | p3 Medium |
| Sev 4, arterial, 50 reporters, no hazard | 0.75 | 0.57 | 0 | 0.8 | 0 | 48.7 | p3 Medium |
| Sev 5 hazard, arterial near school, 1 reporter | 1.0 | 0.10 | 1 | 1.0 | 0 | 62.5 | p1 Critical (hazard+sev5 rule) |
| Same, 1,000 reporters | 1.0 | 1.0 | 1 | 1.0 | 0 | 85.0 | p1 Critical |
| Same, SLA breached | 1.0 | 1.0 | 1 | 1.0 | 1 | 95.0 | p1 Critical |

Talking point: 1,000 reports on a minor residential pothole (43) still rank below one severity-5 hazard near a school (62.5).

### 8.6 Buckets and DevRev severity mapping
| UI bucket | Rule | DevRev `severity` | Target close |
|---|---|---|---|
| p1 Critical | P >= 80 OR (hazard AND severity 5) | blocker | 24-48 h |
| p2 High | 60 to 79 | high | 72 h |
| p3 Medium | 35 to 59 | medium | SLA days |
| p4 Low | below 35 | low | SLA days |

Numeric score also goes in a tag `priority:p1..p4` and the ticket body (custom fields skipped as too risky). Severity enum is secondary-sourced [V5].

### 8.7 DevRev write-throttling
Update DevRev only on bucket change or reporter milestone (1, 5, 10, 25, 50, 100, 250, 500, 1000), then ONE external timeline comment per milestone. Writes go through a per-cluster coalescing queue (latest state wins) and a global limiter (<=2 writes/s; rate limits are unpublished). Auto-flip to mock after 3 consecutive DevRev failures. Simulated clusters: no tickets by default except the top `SIM_TICKETS=5` by priority (tagged `civicflow-sim`, bulk-closed by reset); every LIVE cluster gets a ticket.

### 8.8 Integrity (MVP only)
Accuracy > 100 m rejected (50-100 m weight 0.5); 10 reports/hour per device; `UNIQUE(cluster_id,user_id)`; cross-user pHash (Hamming <= 6, 30 d) = fraud flag, no points; points pending until a second unique reporter, crew acknowledgment, or Fixed. Capture uses `navigator.geolocation` (never EXIF; iOS strips it). Velocity checks, EXIF staleness, streaks: cut list.

---

## 9. Data model + API contract (the contract all 3 lanes code against)

### 9.1 Postgres (`db/schema.sql`, no PostGIS)

| Table | Key columns |
|---|---|
| `users` | `id uuid pk`, `device_id text unique`, `nickname`, `hood`, `role citizen/vendor/ops`, `reputation real default 1.0 (0.2..1.5)`, `xp_pending int`, `xp_confirmed int`, `level int`, `created_at` |
| `vendors` | `id text pk`, `name`, `categories text[]`, `devrev_group_id`, `devrev_tag`, `sla_hours` |
| `clusters` | `id uuid pk`, `public_id text unique ('CF-1042')`, `category`, `category_group`, `lat`, `lng` (anchor), `geohash7`, `status check in (pending, open, assigned, in_progress, resolved, reopened, closed, merged)`, `merged_into uuid null`, `provisional bool`, `severity int`, `is_hazard bool`, `location_crit real`, `unique_reporters int`, `weighted_reporters real`, `priority real`, `priority_bucket p1..p4`, `summary`, `rationale`, `visual_signature`, `top_photo_key`, `vendor_id`, `devrev_work_id`, `devrev_display_id`, `devrev_url`, `devrev_stage`, `last_devrev_bucket`, `last_devrev_milestone int`, `hood`, `source live/seed/sim`, `sla_due_at`, `first_reported_at`, `last_reported_at`, `resolved_at`. Indexes `(status, category_group)`, `(geohash7)`, `(lat, lng)` |
| `cluster_emb` | `cluster_id pk fk`, `emb vector(1024)` (exact scan over <=5 geo candidates, no ANN index) |
| `reports` | `id uuid pk`, `cluster_id fk`, `user_id fk`, `lat`, `lng`, `accuracy_m`, `photo_key`, `phash`, `note`, `category_hint`, `triage jsonb`, `decision merge/create/judge_merge/judge_create`, `score real`, `d_m real`, `fraud_flag`, `simulated bool`, `created_at`, `UNIQUE(cluster_id,user_id)` |
| `judge_log` | `id`, `report_id`, `cluster_ids text[]`, `candidates jsonb`, `decision`, `confidence`, `reason`, `model`, `latency_ms`, `tokens_in`, `tokens_out`, `created_at` |
| `agent_traces` | `id`, `cluster_id`, `report_id`, `node`, `model`, `output jsonb`, `latency_ms`, `tokens_in`, `tokens_out`, `created_at` |
| `status_events` | `id`, `cluster_id`, `source devrev/admin/vendor/system`, `from_stage`, `to_stage`, `citizen_status`, `created_at` |
| `points_ledger` | `id`, `user_id`, `cluster_id`, `kind`, `points`, `state pending/confirmed/voided`, `created_at` |
| `badges` | `(user_id, badge_id)` pk, `earned_at` |
| `devrev_mock_tickets` | `id`, `display_id`, `cluster_id`, `stage`, `severity`, `body`, `created_at` (only when `DEVREV_MODE=mock`) |
| `kv_meta` | `key pk`, `value jsonb` (DevRev bootstrap ids, stage-name map, poll cursors) |

The cluster-to-DevRev mapping lives in `clusters.devrev_work_id` (FIX: our DB is the idempotency key; `external_ref` is sent as `cf-<cluster_id>` but never relied upon).

### 9.2 Valkey keys
| Key | Type | Purpose |
|---|---|---|
| `geo:open:<category_group>` | GEO | member = `cluster_id`; the dedup index (rebuilt from PG at startup) |
| `cl:<cluster_id>` | HASH | hot copy: priority, count, status, lat, lng, category, display_id |
| `edgekv:civicflow:cells:<geohash6>` | STRING JSON | EdgeKV-shaped item (namespace `civicflow`, group `cells`, item `<geohash6>`): list of open clusters in cell, <10 KB; rewritten on every cluster change; NEVER used for merge decisions |
| `lb:users`, `lb:hoods` | ZSET | confirmed XP; fix-verified rate x1000 |
| `rl:<device>:<yyyymmddhh>` | counter TTL 3700 s | 10 reports/hour |
| `rl:akamai:<minute>` | counter | token bucket cap 50/min |
| `emb:<sha1(text)>` | bytes TTL 24 h | cached embedding |
| `phash:<hex16>` | string TTL 30 d | cross-user fraud check |
| `stats:reports`, `stats:clusters`, `stats:llm_calls`, `stats:llm_skipped`, `stats:tickets` | ints | hero counters |
| `evt:stream` | STREAM (MAXLEN ~500) + pubsub channel `events` | SSE live + replay via `?since=` |
| `flags:<NAME>` | string | hot-toggled fallbacks |
| `dr:seen:<event_id>` | TTL 1 h | webhook dedupe |

### 9.3 Object Storage (`civicflow-photos`)
`photos/<yyyymmdd>/<report_id>.jpg`, `thumbs/<report_id>.jpg` (400 px, Pillow, server-side), `fixes/<cluster_id>-after.jpg`, `seed/*.jpg`. Served through `/api/photo/<key>` (302 to short-lived presigned GET). Badges are static files in the web build, not in the bucket.

### 9.4 Shared Pydantic shapes (`contracts/models.py`)
```
Triage        {is_valid, invalid_reason, category, severity 1-5, is_safety_hazard, hazard_description<=200,
               visual_signature<=160, est_size, location_context, confidence}
DedupDecision {decision: merge|new, cluster_id|null, confidence, reason<=140}
PriorityScore {score 0-100, bucket p1..p4, devrev_severity, rationale<=300, factors:{S,R,H,L,A,W}}
TicketRef     {work_id, display_id, url, stage}
ClusterLite   {id, public_id, category, lat, lng, priority, bucket, unique_reporters, status, citizen_status, devrev:{display_id,url}|null}
ReportResult  {report_id, outcome: merged|created|rejected|processing, reject_reason|null, cluster: ClusterLite|null,
               neighbors:int, dedup:{path: fast|judge|create, score, d_m}, xp:{gained,pending,total,level,level_progress,badges_unlocked[]},
               stream_url|null}
```
`neighbors` = other unique reporters already on the cluster (hotspot demo: 211 prior -> user is #212).

### 9.5 Endpoints (all JSON under `/api`; same origin via Caddy)
Auth-lite: header `X-Device-Id` (uuid in localStorage) + nickname; demo user switcher sets it. Admin/demo routes need `X-Admin-Token`. Vendor routes use `X-Vendor-Id`.

| Method + path | Request | Response |
|---|---|---|
| POST `/session` | `{device_id, nickname, hood}` | `User {id, nickname, hood, xp_pending, xp_confirmed, level, badges[]}` |
| POST `/reports` | multipart: `photo` (JPEG <=1 MB, long edge 1280-1568), `lat`, `lng`, `accuracy_m`, `category_hint`, `note?` | merge: **200** `ReportResult(outcome=merged)`; create/ambiguous: **202** `ReportResult(outcome=processing, stream_url)`; 422 invalid; 429 rate limit |
| GET `/reports/{id}` | - | `ReportResult` (final once pipeline completes) |
| GET `/clusters?bbox=w,s,e,n&status=&cell=<gh6>` | - | `ClusterLite[]`; with `cell`, served from the EdgeKV-shaped adapter; header `X-CivicFlow-Cache: hit` or `miss` (+ `X-CivicFlow-Cache-Ms`) |
| GET `/clusters/{id}` | - | `ClusterLite + {summary, rationale, photo_url, vendor:{id,name}, devrev:{display_id,url,stage}, timeline:[{ts,label,source}], sla_due_at, factors, judge_log[], agent_trace[]}` |
| POST `/clusters/{id}/plus-one` | `{photo?}` multipart | `{xp, unique_reporters}` |
| POST `/clusters/{id}/verify-fix` | `{fixed: bool, photo?}` | `{accepted, cluster_status, xp}` (MVP: +30 simple confirm) |
| GET `/me/reports` | - | `ReportResult[]` with live `citizen_status` |
| GET `/leaderboard?scope=users` | - | `[{rank, name, score, badge_count}]` (hoods = cut) |
| GET `/stats` | - | `{reports_total, unique_issues, tickets_created, llm_calls, llm_skipped, avg_dispatch_seconds, duplicates_absorbed, crew_hours_saved_est, open_by_bucket:{p1,p2,p3,p4}}` |
| GET `/impact` | - | City Impact numbers with `source` and `estimate:true` flags (static JSON; section 12.5) |
| GET `/events` (SSE) and `?since=<id>` | - | `text/event-stream`; poll fallback returns events after id |
| GET `/vendor/work-orders` | `X-Vendor-Id` | `[{cluster_id, display_id, address, priority, bucket, sla_due_at, photo_url, count}]` |
| POST `/vendor/work-orders/{cluster_id}/fix` | multipart `after_photo?` | `{status:"resolved", devrev_stage}`; calls DevRev `works.update` |
| POST `/devrev/webhook` | DevRev event | challenge echo `{challenge}`, HMAC check, answer <3 s (optional) |
| GET `/healthz` | - | `{bedrock, akamai_ai, devrev, s3, valkey, pg, flags}` each `ok/degraded/down` |
| Admin: POST `/admin/simulate` | `{n:1243, center:{lat,lng}, spread_m, clusters:37, seed, rate_per_s:80, vision:false}` | 202; streams events. `clusters:1, n:50` = the storm |
| Admin: POST `/admin/hotspot` | `{lat,lng,prior_reporters:211}` | seeds the hotspot cluster + REAL DevRev ticket |
| Admin: POST `/admin/advance` | `{cluster_id}` | moves DevRev stage queued -> work_in_progress -> resolved |
| Admin: POST `/admin/reset`, `/admin/flags` | - / `{AGENTS_MODE, DEVREV_MODE, VISION, EMBED, STORAGE, JUDGE_MODEL, PRIORITY_MODEL, MODEL_PROVIDER}` | restore seed state in <30 s (bulk-close `civicflow-sim` tickets); hot-toggle |
| GET `/open311/v2/requests.json` | - | Open311 list (`service_request_id`=cluster id, `status_notes`="Merged N citizen reports; DevRev TKT-123"). Cut-able |

### 9.6 SSE envelope and events
`{id, ts, type, data}`; ids come from `evt:stream`; heartbeat every 15 s. Caddy: `reverse_proxy api:8000 { flush_interval -1 }`. One shared EventSource per tab (HTTP/2 via Caddy; browsers cap ~6 connections per origin on HTTP/1.1).

| type | data |
|---|---|
| `report.received` | `{report_id, user_id, simulated}` |
| `report.merged` | `{report_id, cluster_id, unique_reporters, priority, bucket, path}` |
| `cluster.created` / `cluster.updated` | `{cluster: ClusterLite}` |
| `agent.node` | `{report_id, node: intake/dedup/priority/dispatch, phase: start/stop, ms, tokens_in, tokens_out, model, summary}` |
| `judge.decision` | `{report_id, candidates[], decision, confidence, reason, model, latency_ms}` |
| `ticket.created` | `{cluster_id, display_id, url, mock}` |
| `status.changed` | `{cluster_id, citizen_status, devrev_stage}` |
| `points.awarded` | `{user_id, points, state, reason, total}` |
| `badge.unlocked` | `{user_id, badge_id}` |
| `stats.tick` | `{reports_total, unique_issues, tickets_created, llm_skipped, llm_calls}` |

Mock layer: `contracts/fixtures/*.json` for every REST response plus `events.ndjson` replay; frontend runs `VITE_MOCK=1` from minute 30 and flips to real with one env var. `?demo=1` mock-fixtures mode also protects the stage demo if the backend dies.

---

## 10. DevRev integration

### 10.1 City object model (separate DevRev org for Civic Flow; NEVER the Enterprise-Bench playground)
| City concept | DevRev object | Notes |
|---|---|---|
| City | the dev org | |
| Departments | product part "KC Public Works" + capability parts Streets, Lighting, Water, Sanitation | `applies_to_part` = routing target; look up once at startup, cache in `kv_meta` |
| Citizens | NOT modeled as rev users (thousands of reporters stay in our DB); optional account "KC Residents" for realism | avoids reported_by fan-out |
| Vendors | groups (`groups.create`, skip if forbidden) + tag `vendor:<id>`; ticket owned by a team member | vendors are not paid seats |
| Priority/category | `severity` + tags `category:*`, `priority:*`, `civicflow-sim` | custom fields skipped |

`scripts/devrev_bootstrap.py` (idempotent, writes ids to `.env` and `kv_meta`): `dev-users.self` -> own DEVU id; `parts.create` x5; `accounts.create`; `tags.create`; `groups.create` per vendor. Do it once by 1:30.

### 10.2 Ticket payload (verify exact field shapes with one live call [V5])
```json
POST https://api.devrev.ai/works.create     Authorization: Bearer <PAT>
{
  "type": "ticket",
  "title": "[P1] Pothole near 900 Ward Pkwy (212 reports)",
  "applies_to_part": "<Streets part don id>",
  "owned_by": ["<DEVU id>"],
  "severity": "blocker",
  "body": "AI summary...\nPriority 85 (S=1.0 R=0.9 H=1 L=1.0)\nReporters: 212 | Vendor: KC Streets Crew A\nMap: https://<host>/#/c/CF-1042\nPhoto: https://<host>/api/photo/...\n--Open311--\nservice_code=pothole lat=.. long=..",
  "tags": [{"id": "<tag don id>"}],
  "external_ref": "cf-<cluster_id>"
}
```
Required: `type`, `title`, `applies_to_part` (`owned_by` optional but always sent so ownership shows in the demo). Photo is a link in the body (artifact upload cut). Severity comes from the engine, never from the LLM.

### 10.3 Lifecycle and status sync
- Create: dispatch tool -> `create_or_update_cluster_ticket` checks `clusters.devrev_work_id`; creates if null (inside the cluster lock so a retry cannot double-create); stores work id + display id. Update (`works.update`) only on bucket change or milestone. One external `timeline-entries.create` comment per milestone.
- **Status sync = polling (primary).** asyncio task every 20 s: `works.get` per open ticket (round-robin, cap 20), diff `stage.name`, write `status_events`, publish `status.changed`. Webhook (`webhooks.create`, public HTTPS, echo `verify` challenge within 3 min, answer <3 s, HMAC over the raw body, dedupe on event id) is an upgrade only if the URL is stable at the 3:15 checkpoint [V7]. Do not assume `work_updated` exists.
- Stage map (read real names from a live ticket [V6]): `queued` = Reported; `work_in_progress` = In progress ("Crew assigned" is set at dispatch when the vendor is attached); `resolved` = Fixed; `canceled` = Closed; anything unknown = In progress.
- Demo control: `POST /api/admin/advance` and the vendor "Mark fixed" both call `works.update` on the stage, so the presenter never needs to click in DevRev (but the DevRev tab visibly flips).
- Fallback: `DEVREV_MODE=mock` stores tickets in `devrev_mock_tickets` with `TKT-1xxx` ids; automatic switch after 3 consecutive failures with a log line; `scripts/reconcile_devrev.py` pushes mock tickets later. Mock tickets are labeled mock in the Ops feed (`ticket.created.mock=true`).
- Duplicate links are not part of the core (one ticket per cluster). If ever needed: `links.create` takes `custom_link_type` ids from `link-types.custom.list` (the snake_case enum is deprecated); prefer "is related to"/"is duplicate of"; avoid "is merged into".

### 10.4 Prize track: reusable `dedup-mcp` connector (separate owned deliverable, Person 2)
Hard rules: Enterprise-Bench synthetic data only; no civic data; no real customer data, custom datasets or live external enrichment. Therefore the connector uses LOCAL similarity (token-set/TF-IDF), not the Akamai embedding endpoint, and makes no external calls.

| Tool | Behavior |
|---|---|
| `find_duplicate_tickets(records? \| source, threshold)` | Groups likely-duplicate support tickets with evidence (matching fields, timestamps, account); stateless-first: accepts `records` passed by the skill (works even if the data path is unknown [V9]) |
| `explain_priority(record_id \| record)` | Score breakdown citing the exact fields used |
| `preview_consolidation(group_id)` | Diff of the proposed consolidation; NO writes |
| `record_consolidation(group_id, approved_by, idempotency_key)` | Approval-gated; replay is a no-op; stores a consolidation record and returns the exact link operations the skill should run in DevRev (reversible relations, not irreversible merge) |

Adapters: `CivicFlowAdapter` (geo; for our own dogfood `mcp_smoke.py`) and `EnterpriseBenchAdapter` (Maple Payments support tickets, text + time + account). Same scoring core as `engine`. Deliverables: server at `https://<host>/mcp` (Streamable HTTP, Bearer, public HTTPS, tool names frozen after first registration; admin Resync after changes [V9]), `SKILL.md` (preview -> approve -> record, evidence rules, honest limits), run log of a SECOND teammate on different records.
Schedule: skeleton at 3:15 (hour 3), tools + SKILL.md by 4:45, Computer registration + second-teammate run 4:45-5:45 ONLY if the playground exists. No playground by 4:45 => stop, record a local clip with `mcp_smoke.py`, and do not mention the prize on stage. Ask the SE in writing whether the civic REST side may coexist; until answered, say "ticket routing alone may not qualify".

---

## 11. Akamai integration

| Akamai resource | Used for | Visible proof |
|---|---|---|
| Linode g6-standard-2 + Cloud Firewall | Everything: Caddy, API, Strands agents, Postgres+pgvector, Valkey, MCP | Cloud Manager tab shown ~5 s |
| Object Storage | Photos, thumbnails, vendor after-photos | Bucket in Cloud Manager; photo URLs |
| Valkey (container on Linode) | GEO dedup index, EdgeKV-shaped cell cache, leaderboard, pubsub, token buckets | Cell-cache chip |
| `hackathon-chat` (hosted inference) | Dedup judge + priority rationale inside the Strands Graph via `OpenAIModel` | `agent.node` events with model name |
| `hackathon-embedding` (1024-d) | Signature similarity in the ambiguous band; pgvector storage | Judge card shows "embedding similarity" |
| `hackathon-image` | Pre-generated badge art (offline, committed) | Badge shelf |
| "Powered by Akamai" strip | Footer in Ops Theatre listing exactly: Linode, Object Storage, Valkey, pgvector, hackathon-chat, hackathon-embedding. `GET /api/stats` includes `akamai_services_used_last_report` | Strip + Cloud Manager |

Hosted-inference rules: key `hk_...` Bearer; OpenAI-compatible `/chat/completions`, `/embeddings` (<=16 inputs, 8,192 tokens each), `/images/generations` (only `hackathon-image`, n=1, b64 PNG, sizes 512/768/1024); no vision (image input to chat = 400); limits 60 req/min across endpoints, 6 images/min, 100k chat tokens/min, 32,768 context, 4,096 max output, default output 512 so ALWAYS set `max_tokens`. Chat and embeddings ignore the model name. Responses API/audio/image edits return 404.

**EdgeKV strategy (FIX: honest, off the critical path)**
1. `EdgeKV` adapter class (`get/put(namespace, group, item)`, value <= 999,999 B JSON) with backend `EDGEKV_BACKEND=valkey` (default) or `edge`. Key `edgekv:civicflow:cells:<geohash6>`, rewritten on every cluster change. `GET /api/clusters?cell=` reads it first and returns `X-CivicFlow-Cache: hit/miss`. Valkey GEO + Postgres remain the source of truth (real EdgeKV is eventually consistent, no atomic writes).
2. `/edge`: real `main.js` (responseProvider: read cell item, else proxy to Linode origin, set `X-CivicFlow-Edge`), `bundle.json`, `edgekv.js`, Node tests with mocked `http-request`, `create-response`, `edgekv` modules [V10]. Budget <= 45 min total, cut-first.
3. Access: Person 2 asks mentors ONCE, 10-minute cap. Real activation needs an Akamai contract/trial with EdgeWorkers + EdgeKV, a delivery property and hostname (sub-requests fail with HTTP 400 without a delivery product). Hard gate 3:00 PM: no credentials => stop. Akamai Functions KV is separate and not EdgeKV-compatible; do not present it as EdgeKV.
4. Demo line (verbatim): "The location cache is EdgeKV-shaped and runs on Valkey on Akamai Cloud today; the real EdgeWorker bundle is in the repo for when an edge property is available." Never say live EdgeKV unless the header was served by a real edge.

---

## 12. Design system and screens

### 12.1 Direction: "Civic transit map"
A well-made transit diagram crossed with a modern city-services product; deliberately not generic AI purple gradients. Light, warm citizen app; dark mission-control Ops Theatre. (Design polish raises the general 0-10 score; it is NOT a design-award play.)

### 12.2 Tokens (define on `:root`, redefine under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])` and `:root[data-theme="dark"]`; Ops Theatre forces dark; give `body` an explicit background)
```css
:root{
  --paper:#F6F3EC; --ink:#14213D; --surface:#FFFFFF; --map-grey:#D9D4C7;
  --signal:#FF6B1A;      /* primary action, hazard */
  --teal:#0F8B8D;        /* fixed, positive */
  --amber:#F2B134;       /* in progress, p3 */
  --alert:#D7263D;       /* p1 */
  --p1:#D7263D; --p2:#FF6B1A; --p3:#F2B134; --p4:#8B95A7; --fixed:#0F8B8D; --xp:#FFC53D;
  --akamai:#FF8A00;      /* only on Powered-by strip */
  --radius:12px; --gutter:16px;
}
:root[data-theme="dark"]{ --paper:#0B1020; --surface:#141B33; --ink:#EAF0FF; }
```
Type: Space Grotesk (display, tabular numerals) + Inter (UI) + JetBrains Mono (ticket ids, counters), via Google Fonts. Shape: 12 px radius, 2 px ink outlines on key elements, route-line connectors; status shown as a transit line (Reported - Crew assigned - In progress - Fixed) with the current station pulsing. Spring motion only; `prefers-reduced-motion` respected; 44 px touch targets; input font-size >= 16 px (iOS zoom); `dvh` not `vh`; safe-area padding on bottom nav; WCAG AA contrast; skeleton/empty/error states on every screen; 390 px mobile-first, 16:9 for Ops.

### 12.3 Surfaces
| Surface | Route | Contents |
|---|---|---|
| Citizen | `/` | Report (full-bleed camera, 3 taps: shutter, chip, send; GPS accuracy ring; 1.5-2.5 s "AI scan" overlay with rings), Map (clusters sized by reporters, colored by bucket, bottom sheet + "+1"), Track (route-line stepper, DevRev id chip in mono, vendor, SLA countdown), Rewards (XP ring, level, 8 badges, leaderboard) |
| Ops Theatre | `/live` (dark, 16:9) | Left: live map (fly-in to KC from regional zoom with pitch 60 and 3D buildings, `liberty` style; no globe projection on MapLibre 4). Center: pipeline Intake - Dedup - Priority - Dispatch with pulsing nodes, latency and token chips, judge-reasoning card, per-node trace. Right: hero counters "N reports -> M unique issues -> K tickets", "LLM calls avoided", DevRev ticket feed, City Impact panel. Bottom: Powered-by strip. Hidden demo panel |
| Vendor | `/vendor` | Work-order list, detail with before/after compare slider, "Mark fixed" |
| Demo panel | `?demo=1` or hotkeys | Location override chip, Simulate city, Storm, Reset, advance stage, flags |

### 12.4 Hero moments (build first, polish most)
- **H1 "You + 212 neighbors" merge reveal** (phone): scan overlay, card morphs to "You + 212 neighbors", Space Grotesk count-up, priority chip flips to P1, DevRev chip, confetti, +15 XP toast, level ring fills. Backed by the seeded hotspot (real KC location, 211 prior reporters, real DevRev ticket).
- **H2 collapse**: Simulate (1,243 dots flood the map and collapse into 37 pins; counters tick; "LLM calls avoided" climbs). Storm variant: 50 reports at one site -> 1 pin, priority bar climbs on the log curve.
- **H3 pipeline**: a new issue lights Intake -> Dedup -> Priority -> Dispatch with latency/token chips, judge card with reasoning, severity/priority factors, vendor.
- **H4 Fixed loop**: vendor "Mark fixed" (before/after slider) -> DevRev ticket flips to resolved -> pin turns teal -> phone timeline reaches Fixed with confetti, +100 XP, "verify the fix" prompt.

### 12.5 City Impact panel (in-app because slides are banned) - verify every number before showing [V12]
Source: KCMO open data (`d4px-6rwg`, pulled 2026-10-10 by research): about 9,700 KC pothole requests in 2025; median 13 days to close, p90 51; 30% canceled; about 28% of 2024-2026 requests within 50 m and 30 d of an earlier one (label "spatio-temporal duplicate ESTIMATE", not an official rate); NYC formally closed 8.8% of 2025 pothole requests as duplicates; AAA about $600 per repair; TRIP $704/yr extra per KC-area driver. Do NOT quote the unverified 25.5% satisfaction figure. "Crew-hours saved" = duplicates absorbed x 0.5, labeled estimate. If a number cannot be verified, hide it.

### 12.6 Gamification spec
| Action | XP (state) |
|---|---|
| First validated report creating a cluster | +50 (pending) |
| +1 confirmation with photo | +15 |
| "Me too" tap, within 100 m, no photo | +5 |
| Cluster Fixed: first reporter / confirmers | +100 / +20 (confirmed) |
| Verify-the-fix tap | +30 |
| Hazard bonus (validated severity 5) | +20 |
| Invalid/rejected report | -20 |

XP is multiplied by reputation (0.2-1.5) and stays pending until a second unique reporter, crew acknowledgment, or Fixed. Levels: Resident 0, Watcher 250, Guardian 1,000, Champion 3,000, Civic Hero 10,000. Badges (8, art pre-generated offline with `hackathon-image`): First Responder, Pothole Hunter, Confirmer, Lamplighter, Fix Verifier, Storm Watch, Neighborhood Guardian, Civic Hero. Leaderboard = users by confirmed XP. Streaks, neighborhood-vs-neighborhood, Quality Inspector: cut list.

---

## 13. Team split and timeline

### 13.1 Roles
| Person | Role | Owns | Interfaces |
|---|---|---|---|
| P1 | Backend + Agents lead | `contracts`, `engine` (dedup, priority, XP, fraud, EdgeKV adapter, `merge_clusters`), FastAPI endpoints + SSE, Postgres schema, Strands Intake/Graph/hooks/det runner/watchdog, unit tests, `simulate` engine hooks | P3 via `openapi.json`, fixtures, SSE catalog; P2 via `integrations/` Python interfaces and `.env` |
| P2 | Integrations + Infra lead | Accounts, Linode/compose/Caddy/firewall, Object Storage, Bedrock/Akamai/DevRev smoke tests, DevRev bootstrap/client/poller/mock/vendor endpoints, seeds (KC 311, POIs, hotspot), `/edge` bundle, healthz, `dedup-mcp` + SKILL.md + Computer registration, backups, submission text | P1 via function signatures (`upsert_ticket`, `poll`, `store_photo`); P3 via deployed URL and routes |
| P3 | Frontend + Design + Demo director | Tokens, 3 surfaces + demo panel, mock layer, MapLibre + animations, Ops Theatre, badge-art generation script (hackathon-image, one call at a time), backup video, demo rehearsal lead | P1 for generated TS types + SSE events; P2 for base URL + assets |

Merge rule: `main` only; short-lived branches; P1 owns `contracts/` and a PR touching it needs all three to ack. Deploy = `git pull && docker compose up -d --build` on the Linode (P2's script).

### 13.2 Hour-by-hour (clock times, T+0 = 12:15 PM)

| Block | P1 | P2 | P3 | Checkpoint / gate |
|---|---|---|---|---|
| 12:15-12:45 | Contracts + fixtures + stub API; `git init`; engine skeleton + test harness | Section 3 checklist: accounts, VM, firewall, Object Storage, V1/V2, organizer questions | Vite scaffold, tokens, fonts, mock layer, app shell | **CP0 12:45**: contracts merged; mock UI runs; VM reachable; keys distributed via vault (never in repo) |
| 12:45-1:45 | Engine: geo, scoring, decision, priority + unit tests; schema; `POST /reports` deterministic path end-to-end locally; V3, V4 | Compose + Caddy on Linode with stub API (HTTPS, SSE flush); storage helper + local fallback; DevRev bootstrap + V5/V6 (hand-move a ticket); KC 311 snapshot to `seed/` | Report screen (camera, GPS, chip, compress, mock submit), Map on fixtures, Track stepper; V12 | **CP1 1:45**: curl report merges locally; stub stack on Linode over HTTPS; DevRev ticket created from script; stage names saved; V1-V3 resolved or flags set |
| 1:45-3:15 | Intake + Graph (judge/priority/dispatch) + det runner; SSE `agent.node`; stats; simulate; EdgeKV adapter (<=20 min) | DevRev closure tools + mock mode + poller; admin advance; vendor endpoints; `seed.py` (~400 real points + hotspot 211); `pois.json`; deploy API to Linode; `/edge` bundle (<=45 min total) | Rewards/leaderboard, SSE client, flip `VITE_MOCK=0`, H1 first pass, toasts, start Ops Theatre layout | **Gate 3:00**: EdgeKV go/no-go (stop if no credentials). **CP2 3:15 - VERTICAL SLICE on Linode**: phone photo -> merge or create -> DevRev ticket -> advance -> Fixed on phone. If missing, flip failing parts to fallback flags and stop adding scope |
| 3:15-4:45 | Hardening: rate limits, locks, `merge_clusters` + sweep, watchdog, points ledger, simple verify-fix, `judge_log`/`agent_traces` payloads, load test simulate 1,243 in <15 s | **`dedup-mcp` (time-boxed 3:15-4:45)**: tools, adapters, SKILL.md, Caddy `/mcp`; healthz page; DB dump + restart policies; vendor fix -> `works.update`; webhook only if URL stable | Ops Theatre complete (pipeline animation, counters, judge card, DevRev feed, Simulate choreography), vendor page + compare slider (H2-H4), badge art via `gen_badges.py`, Impact panel | **CP3 4:45 - FEATURE FREEZE** (core). Dry run #1 on a real phone over cellular. Triage defect list |
| 4:45-5:45 | Bug fixes only; tune thresholds on seed; confirm no DevRev write amplification during simulate; README arch + mermaid | MCP: Computer registration + second-teammate run (if playground) else `mcp_smoke.py` clip; secrets sweep; submission text; record 90 s backup with P3 | Polish, a11y, 390 px + big-screen checks, demo panel + location override, speaker notes, backup video | **CP4 5:45**: release candidate tagged. Run #2 timed <= 2:50 all flags on. Run #3 with Bedrock and DevRev forced to fallback (proves resilience) |
| 5:45-6:15 | Freeze; final reset + seed; watch logs | Freeze; healthz green; DB snapshot; file submission; tunnel + video ready | Final rehearsal with presenter; pre-grant camera + location on demo phone; second phone | **CP5 6:15**: code frozen, submission filed, backup uploaded. Event allows work until Sun 8:00 AM but no new features; rehearse by ~8:30 AM, demos 9:00 AM |

Rule: if CP2 slips, no new scope until it is green; use the cut list top-down.

---

## 14. 3-minute demo script (no slides)

Prep: pre-logged-in tabs (Ops Theatre, DevRev ticket list, Cloud Manager, vendor page), phone with camera + location pre-granted and tested on cellular, second phone ready, `?demo=1` panel, backup video queued. Label simulated data on screen ("Simulated" chip). Do one fully REAL photo report.

| Time | Screen | Action | Say | What each sponsor sees |
|---|---|---|---|---|
| 0:00-0:15 | Ops Theatre | Counter at 0 | "Civic Flow, built on **Akamai Cloud**, **AWS Strands Agents** and **DevRev**. Kansas City gets thousands of calls about the same pothole." (rules require naming sponsor tech up front) | All three named |
| 0:15-0:45 | Ops Theatre | Hit **Simulate**: 1,243 dots collapse into 37 pins; "LLM calls avoided" climbs | "Simulated: 1,243 reports. Deterministic geo dedup first; agents only where judgement is needed, which also respects the hosted-model limits." | AWS: deliberate agent design. Akamai: Valkey + Linode |
| 0:45-1:20 | Phone (mirrored) | REAL photo at the seeded hotspot: scan overlay -> "You + 212 neighbors", priority P1, DevRev chip, confetti, +15 XP | "Real photo, real GPS. The merge took zero LLM calls." | DevRev chip; Akamai cell-cache chip |
| 1:20-1:55 | Phone then Ops | Report at a NEW spot: pipeline lights Intake (Bedrock Haiku vision) -> Dedup judge card -> Priority (Akamai hosted model) -> Dispatch; severity, factors, vendor | "A Strands graph mixing Bedrock and Akamai-hosted models; the numbers come from code, the agents explain and dispatch." | AWS: Graph, structured output, hooks, two providers |
| 1:55-2:15 | DevRev tab, Cloud Manager (5 s) | Show exactly one ticket: severity, vendor, summary, reporter count; flash Linode + Object Storage | "One ticket, not a thousand. Everything runs on Akamai Cloud: Linode, Object Storage, hosted AI." | DevRev: real ticket. Akamai: resources verifiable |
| 2:15-2:45 | Vendor page -> DevRev -> phone | Open work order, compare slider, **Mark fixed**: DevRev flips to resolved, pin turns teal, phone hits **Fixed** with confetti +100 XP | "The vendor closes it; the citizen sees Fixed." | DevRev: status loop |
| 2:45-3:00 | Ops (City Impact) | Show sourced impact numbers (labeled estimates) | "Edge cache is EdgeKV-shaped on Valkey today with the real EdgeWorker bundle in the repo. Open311 export lets any city plug in." (honest line) | Honesty on EdgeKV |

Conditional segment (only if the connector actually ran in DevRev Computer with a second teammate, +15 s, take time from 0:15-0:45): "The same dedup core is a reusable MCP connector run on Enterprise-Bench." Otherwise say nothing about the DevRev prize track, except "ticket routing alone may not qualify" if asked.

Fallbacks on stage: Wi-Fi dies -> phone hotspot; backend dies -> `?demo=1` mock-fixtures mode, narrate live; everything dies -> play the 90 s 1080p backup video and narrate. Never deploy untested changes before judging.

---

## 15. Risks and fallbacks

| Risk | Likelihood | Mitigation / fallback |
|---|---|---|
| Bedrock Claude blocked (use-case form, zero quota, throttle); Haiku 5.5 profile ID wrong [V1] | Medium | Converse test by 12:30; submit form at T+0; `MODEL_PROVIDER=anthropic`; `VISION=off` (chip + canned triage); `AGENTS_MODE=det`; watchdog auto-flip |
| Haiku/Claude 5.x rejects forced tool_choice in structured-output fallback | Medium | Prompt ends "respond via the structured output tool"; no temperature; catch `StructuredOutputException`, retry once, then chip triage. No Sonnet/Opus at runtime |
| Akamai key late, tool-calling/structured output flaky, limits lower than documented [V2][V3] | Medium | Akamai nodes are text-only and tool-less; `JUDGE_MODEL`/`PRIORITY_MODEL=haiku`; set `max_tokens` everywhere; token bucket 50/min + semaphore(2); simulate never calls models; embeddings cached and optional |
| Linode verification/promo delay | Medium | P2 first; develop on identical local compose; `cloudflared` tunnel interim; Linode must be live by CP1 for the Akamai story |
| Managed PostgreSQL unavailable (sales paused) | High | Not used. pgvector container is the default |
| DevRev API quirks (fields, severity enum, stages, tags/group shapes, rate limits) [V5][V6] | High | Live test by 1:30; `DEVREV_MODE=mock` + auto-switch; coalesced, throttled writes; admin advance; our DB holds the work id |
| DevRev prize mismatch (needs Enterprise-Bench-only skill/connector; playground may not arrive) [V9] | High | Separate owned deliverable; stop at 4:45 if no playground; never mix civic data; do not claim the prize on stage |
| EdgeKV access never granted | High | Off critical path; adapter + dormant bundle; 10-minute ask cap; gate 3:00; honest demo line |
| Strands API differs from assumptions (Graph state shape, hooks, setters) [V4] | Medium | 20-line smoke test by 1:15; `AGENTS_MODE=det` emits identical events |
| Concurrency: duplicate clusters/tickets in a storm | Medium | Advisory-lock set + GEOADD-before-commit, `UNIQUE(cluster_id,user_id)`, sweep, work id in our DB, DevRev writes coalesced |
| Venue Wi-Fi blocks webhook, camera needs HTTPS, WebGL fails, OpenFreeMap down | Medium | Caddy HTTPS on sslip.io; polling not webhook; phone on cellular/hotspot; raster OSM tiles; list-view fallback; second device; backup video |
| sslip.io cert issuance rate-limited | Low | Caddy retries other CA; `cloudflared` tunnel |
| Demo data seen as fake | Low | "Simulated" label; one fully real report; real KC seed + real DevRev ticket |
| Fresh-code rule [V13] | Low | Git history starts after kickoff; third-party libs fine; earliest local file 11:48 AM |
| Scope creep in 5-6 h | High | Contract-first, 6 checkpoints, vertical slice 3:15, freeze 4:45, cut list below |
| Shared 60 req/min or concurrent Agent errors during demo | Low | Per-request Graph, semaphore(2), pre-warmed demo cluster, det fallback |
| Claims on stage differ from reality (EdgeKV, fraud, impact numbers) | Low | Section 11 line, labeled estimates, nothing unbuilt mentioned |

### Ordered cut list (cut from the top first)
1. AgentCore deploy, OTel/Jaeger (never plan; hook audit table is enough)
2. Concierge/chat agent and DevRev remote MCP attachment [V8]
3. Open311 endpoint
4. `/edge` bundle polish and any real EdgeKV activation (keep the adapter)
5. DevRev webhook receiver (polling stays)
6. Streaks, neighborhood leaderboard, cross-user pHash fraud counter, velocity checks (keep `UNIQUE` + rate limit)
7. Verify-the-fix photo judging and reopen flow (keep +30 tap)
8. Embeddings/pgvector (`EMBED=off`)
9. Live Impact computation (hardcode only verified numbers, or hide the panel)
10. DevRev Computer registration (keep server + SKILL.md + local clip)
11. Akamai judge node (rule-only judge)
12. Graph -> `AGENTS_MODE=det` (UI unchanged)
13. `VISION=off` (chip + canned triage)

NEVER CUT: deterministic dedup; one DevRev ticket per live cluster (real or mock); Ops Theatre counters + Simulate; the Fixed loop to the phone; Linode deployment; backup video.

---

## 16. Repo layout and environment

> **Superseded:** the tree below was replaced by a simpler layer-per-folder layout in `code/` (see `code/README.md`: `contracts/`, `frontend/`, `backend/{api,engine,agents,integrations}/`, `data/`, `infra/`, `scripts/`, `optional/`, `docs/`). The `.env.example` below is still current.

```
civicflow/
  README.md                     # arch + mermaid + sponsor mapping (P1/P2 at 4:45)
  .env.example                  # no secrets; real .env never committed
  docker-compose.yml            # caddy, api, postgres(pgvector), valkey, mcp
  Caddyfile                     # sslip.io host, static build, /api proxy (flush_interval -1), /mcp route
  contracts/                    # P1: models.py, openapi.json, fixtures/*.json, events.ndjson, ts types (generated)
  packages/
    engine/                     # P1: pure Python (geo.py, dedup.py, priority.py, xp.py, fraud.py, edgekv.py, merge.py)
    dedup-mcp/                  # P2: server.py, adapters/{civicflow,enterprise_bench}.py, SKILL.md, README.md
  services/
    api/
      app/
        main.py  config.py  flags.py  sse.py  deps.py
        routes/{reports,clusters,vendor,admin,stats,events,health,open311}.py
        agents/{models,pipeline,graph,tools,hooks,prompts,det}.py
        integrations/{devrev,storage,akamai}.py
      db/schema.sql
      requirements.txt          # strands-agents==1.59.0 pinned
      Dockerfile
  apps/
    web/                        # P3: Vite + React + TS
      src/{citizen,live,vendor,demo,mock,lib}/  public/badges/
  edge/                         # P2: main.js, bundle.json, edgekv.js, test/ (dormant)
  seed/                         # kc311_potholes.json, pois.json, vendors.json, devrev_stages.json
  scripts/
    smoke_bedrock.py  smoke_akamai.py  smoke_devrev.py  mcp_smoke.py
    devrev_bootstrap.py  reconcile_devrev.py  seed.py  simulate.py  reset.py  gen_badges.py
    deploy.sh                   # git pull && docker compose up -d --build
```

### `.env.example`
```ini
# --- flags (hot-toggle via POST /api/admin/flags; defaults shown) ---
MODEL_PROVIDER=bedrock        # bedrock | anthropic
AGENTS_MODE=graph             # graph | det
VISION=on                     # on | off
EMBED=on                      # on | off
DEVREV_MODE=live              # live | mock
STORAGE=s3                    # s3 | local
EDGEKV_BACKEND=valkey         # valkey | edge
JUDGE_MODEL=akamai            # akamai | haiku
PRIORITY_MODEL=akamai         # akamai | haiku
SIM_TICKETS=5                 # real DevRev tickets for top-N simulated clusters (0 = none)

# --- Bedrock / Anthropic ---
AWS_BEARER_TOKEN_BEDROCK=
AWS_REGION=us-west-2
BEDROCK_HAIKU_ID=us.anthropic.claude-haiku-5-5      # verify [V1]
ANTHROPIC_API_KEY=
ANTHROPIC_HAIKU_ID=claude-haiku-5-5                 # verify [V1]

# --- Akamai ---
AKAMAI_AI_BASE_URL=https://ws.akamai-workshops.com/v1
AKAMAI_AI_KEY=                                      # hk_...
AKAMAI_CHAT_MODEL=hackathon-chat
AKAMAI_EMBED_MODEL=hackathon-embedding
AKAMAI_RPM_CAP=50
S3_ENDPOINT=                                        # per bucket region [V15]
S3_BUCKET=civicflow-photos
S3_KEY=
S3_SECRET=

# --- Data plane ---
DATABASE_URL=postgresql://civicflow:CHANGE@postgres:5432/civicflow
VALKEY_URL=redis://valkey:6379/0

# --- DevRev (Civic Flow org, NOT the Enterprise-Bench playground) ---
DEVREV_PAT=
DEVREV_OWNER_DEVU=
DEVREV_PART_STREETS=
DEVREV_PART_LIGHTING=
DEVREV_PART_WATER=
DEVREV_PART_SANITATION=
DEVREV_ACCOUNT_ID=
DEVREV_WEBHOOK_SECRET=

# --- App ---
PUBLIC_BASE_URL=https://<ip-dashed>.sslip.io
ADMIN_TOKEN=
MCP_BEARER_TOKEN=
VITE_MOCK=0
```
