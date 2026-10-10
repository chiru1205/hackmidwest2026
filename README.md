# hackmidwest2026

> **New to the project? Start with [SETUP.md](SETUP.md)**: one command installs everything and starts the app on Windows.
Repo for CIVIC FLOW — thousands of citizen reports in, one prioritized DevRev ticket per unique issue out.

## Layers and owners

| Folder | Layer | Owner |
|---|---|---|
| `contracts/` | shared data shapes (the handshake) | P1, all approve changes |
| `frontend/` | phone app, Ops Theatre, vendor page | **P3** |
| `backend/api/` | HTTP routes, live updates | **P1** |
| `backend/engine/` | dedup + priority logic | **P1** |
| `backend/agents/` | AWS Strands agents | **P2** (P1 pairs at 1:00) |
| `backend/integrations/` | Akamai AI, AWS Bedrock, storage, mock ticket board (DevRev-shaped) | **P2** |
| `data/` | database schema, seed data | **P2** |
| `infra/` | Docker, Caddy, deploy to Akamai Cloud | **P2** |
| `scripts/` | smoke tests, simulate, reset | P2 / P1 |
| `optional/` | DevRev connector, EdgeKV bundle | P2, only if time |
| `docs/` | architecture, assignments, diagrams | all |

Each folder has a README with what to build and what "done" means.

## Run it locally
Needs Python 3.12 and Node 22. No Docker: SQLite, in-memory geo index and edge cache (Valkey optional).

```
1. python -m venv .venv && .venv\Scripts\pip install -r backend/requirements.txt   # once
2. copy .env.example .env            # optional: add AKAMAI_AI_KEY; without it agents use deterministic fallbacks
3. .\start.ps1                       # opens API (8000) and Vite (5173) windows
   or manually:
   .venv\Scripts\python.exe -m uvicorn backend.api.main:app --port 8000
   cd frontend && npm install && npm run dev      # VITE_MOCK=1 works without the API
4. Citizen http://localhost:5173/  Ops http://localhost:5173/ops  Vendor http://localhost:5173/vendor
5. Phone testing (camera + GPS need HTTPS):  cloudflared tunnel --url http://localhost:5173
```

Tests: `.venv\Scripts\python.exe -m pytest backend/tests -q`

Defaults: `VISION=off`, `DEVREV_MODE=mock`, `STORAGE=local`, text agents on Akamai hosted chat. Flip a flag in `.env` when AWS or DevRev becomes available.

## Rules
- `main` only, short-lived branches.
- No secrets in git. `.env` is ignored; copy `.env.example` to `.env`.
- A change to `contracts/` needs all three people to approve.
