# contracts/ — the handshake between all three layers
**Owner: P1** · changes need all three people to approve in the PR.

Single source of truth for data shapes. Everyone builds against this, so nobody waits on anybody.

| File | What |
|---|---|
| `models.py` | Pydantic models: Report, Cluster, Triage, DedupDecision, PriorityScore, TicketRef |
| `openapi.json` | API description generated from the backend (P3 generates TypeScript types from it) |
| `fixtures/*.json` | Realistic sample responses. The frontend runs on these until the API is live |
| `events.ndjson` | Recorded live-update (SSE) events, replayable by the frontend |

**Done when (12:45):** models and fixtures are merged, so P3's mock UI runs.
