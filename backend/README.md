# backend/ — Python 3.12, FastAPI (one worker)

| Folder | Owner | What |
|---|---|---|
| `api/` | P1 | HTTP routes, live-update stream (SSE), health, admin |
| `engine/` | P1 | dedup + priority logic (pure Python, no network, no LLM) |
| `agents/` | P2 (P1 pairs at 1:00) | AWS Strands agents |
| `integrations/` | P2 | Akamai AI, AWS Bedrock, storage, mock ticket board (DevRev-shaped), each with a fallback |
| `tests/` | P1 | unit tests, mostly for `engine/` |

Dependency direction: `api → agents → engine`, and `api` / `agents` → `integrations`. `engine/` imports nothing else.
