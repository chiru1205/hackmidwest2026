# frontend/ - Civic Flow web app

Vite + React 18 + TypeScript, react-router, MapLibre (OpenFreeMap tiles, no key), framer-motion, canvas-confetti. Plain CSS tokens in `src/styles.css` (light/dark, system aware).
Types come from `../contracts/types.ts` via the `@contracts` alias.

## Commands
```
npm install
npm run dev        # http://localhost:5173, proxies /api and /photos to http://localhost:8000
npm run build      # tsc + vite build (must stay green)
npm run preview
```

## Mock vs real
- Real backend (default): `npm run dev`, with the API on port 8000.
- No backend: `VITE_MOCK=1 npm run dev` (PowerShell: `$env:VITE_MOCK=1; npm run dev`). `src/mock/` is an in-browser fake API (about 40 KC clusters, the 211-reporter Plaza hotspot, a ticking event stream, working report / me-too / simulate / vendor fix). A MOCK badge shows in the header.

## Surfaces
| Route | What |
|---|---|
| `/` | Citizen phone app: Report (camera, GPS, nearby + edge chip, scan overlay, reveal), `/mine` My Reports (live status stepper), `/profile` XP, badges, leaderboard |
| `/ops` | Ops Theatre (forced dark): map, KPIs, pipeline strip, priority queue, SSE feed, SIMULATE / RESET, City Impact, health footer |
| `/vendor` | Work orders, before/after photo, Mark fixed |
| `/?demo=1` | Demo panel: location presets (Plaza, Westport, Crossroads), use GPS, reset |

## Layout
```
src/citizen/    Report, Reveal, MyReports, Profile, location context
src/ops/        Ops screen, OpsMap
src/vendor/     Vendor page
src/components/ shared UI (chips, stepper, toasts, MiniMap, Header)
src/lib/        api.ts (real + mock switch, SSE client), hooks, const, image compression
src/mock/       fake backend
```
Camera and GPS need HTTPS on a phone: use the `cloudflared` tunnel from the top-level README.
