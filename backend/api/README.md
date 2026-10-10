# backend/api/ — the front door
**Owner: P1** · FastAPI, one uvicorn worker.

- `routes/`: reports, clusters, vendor, admin (reset, simulate, flags), stats, health
- SSE live events: `agent.node`, `cluster.*`, `ticket.*`
- Orchestrator: runs the pipeline per report, logs once, runs the DevRev poller
- Flags and `DEMO_MODE`

**Depends on:** `contracts/`, `engine/`, `agents/`, `integrations/`.
**Done when:** CP1 (1:45) — `curl` a report and it merges or creates a cluster locally.
