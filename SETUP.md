# Civic Flow: run it on your Windows laptop

You need nothing installed. The setup script checks your computer, installs what is missing, and starts the app.

## 1. Get the code
Open **PowerShell** (press the Windows key, type `PowerShell`, press Enter) and run:

```
git clone https://github.com/chiru1205/hackmidwest2026.git
cd hackmidwest2026
```
No Git yet? Download it from https://git-scm.com/download/win, install with the defaults, then open a **new** PowerShell window and run the lines above. (Or on the GitHub page click Code, then Download ZIP, and unzip it.)

## 2. Run setup (one command)
```
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```
You can also double-click **setup.cmd** in the folder.

It will:
- check for Git, Python 3.12 and Node.js, and install any that are missing (Windows may ask for permission; click Yes)
- create the Python environment and install everything (the first time takes about 5 minutes)
- create your settings file `.env`
- ask for keys (optional, see below)
- start the app and open your browser

If it says "Still missing ... open a NEW PowerShell window", do exactly that and run the same command again. It is safe to run as many times as you like.

## 3. Use the app
| Page | Address |
|---|---|
| Citizen app | http://localhost:5173/ |
| Operations (city) | http://localhost:5173/ops |
| Vendor work orders | http://localhost:5173/vendor |
| Workflow | http://localhost:5173/workflow |

A good first try: open **Ops** and press **Run the story**. Then open **Workflow** and press **Send a sample report**.

## Daily commands
| What | Command |
|---|---|
| Start the app | `.\start.ps1` |
| Stop the app | `.\stop.ps1` |
| Test on a phone (camera and GPS need HTTPS) | `.\phone.ps1` and open the link it prints |
| Re-run setup (fix problems, update packages) | `.\setup.ps1` |
| Get the latest code from the team | `git pull` |

Start opens two windows (API and Web). Leave them open while you work; close them or run `.\stop.ps1` to stop.

## Keys (optional)
The app works without any keys, using built-in fallbacks. Add keys to make the AI and DevRev parts real.

| Key | What it adds | Who needs it |
|---|---|---|
| `AKAMAI_AI_KEY` (starts with `hk_`) | AI-written priority explanations and ticket text | Everyone, shared by the team lead |
| `DEVREV_PAT` | Real tickets in DevRev | One person only. Everyone else stays on the local ticket board |
| AWS keys | Reading photos with Claude (blocked on our account for now) | Nobody yet |

Setup asks for these. To add or change one later, open the file `.env` in Notepad or VS Code, edit the line, save, then run `.\stop.ps1` and `.\start.ps1`.

**Rules for keys:** get them privately from the team lead. Never paste them in chat or in a message, and never commit `.env` (it is already ignored by Git, so a normal commit will not include it).

## Working with the code
- Layers and who owns them are in `README.md` and `docs/TEAM_ASSIGNMENTS.md`. The full plan is in `docs/ARCHITECTURE.md`.
- Backend: `backend/` (Python, FastAPI). Web app: `frontend/` (React). Shared data shapes: `contracts/`.
- Work on a small branch, then open a pull request or tell the lead. Changes to `contracts/` need everyone's agreement.
- Backend tests: `.venv\Scripts\python -m pytest backend/tests -q`

## If something goes wrong
| Problem | Fix |
|---|---|
| "running scripts is disabled on this system" | Use the full command from step 2 (it includes `-ExecutionPolicy Bypass`), or double-click `setup.cmd` |
| "Python was not found" or the Microsoft Store opens | Close PowerShell, open a **new** one, run setup again. If it persists, install Python 3.12 from python.org and tick "Add python.exe to PATH" |
| "Port 8000 (or 5173) is already in use" | Run `.\stop.ps1`, then `.\start.ps1` |
| Page is blank or says it cannot reach the API | Check the "Civic Flow API" window for an error. Then open http://localhost:8000/api/health, which should show `"status":"ok"` |
| Map is grey with no streets | The map tiles need internet (OpenFreeMap). Check your Wi-Fi |
| The AI steps show template text | There is no Akamai key, or it is mistyped. Keys are long: copy and paste, do not retype. Check with `.venv\Scripts\python scripts\smoke_akamai.py` |
| The demo data looks messy after testing | Stop the app, delete `data\civicflow.db`, start again. It reseeds a clean demo |
| `winget` not found | Install Git, Python 3.12 and Node.js (LTS) by hand from their websites, then run setup again |
