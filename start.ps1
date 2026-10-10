# Starts Civic Flow: the API (port 8000) and the web app (port 5173), each in its own window, then opens the browser.
# Run:  .\start.ps1            (first time on a new machine? run .\setup.ps1 instead)
# Options:  -NoBrowser   do not open the browser
param([switch]$NoBrowser)

$root = $PSScriptRoot
$py = Join-Path $root '.venv\Scripts\python.exe'

if (-not (Test-Path $py)) {
  Write-Host "The Python environment is missing. Run setup first:  powershell -ExecutionPolicy Bypass -File .\setup.ps1" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $root 'frontend\node_modules'))) {
  Write-Host "Web app packages are missing. Run setup first:  powershell -ExecutionPolicy Bypass -File .\setup.ps1" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $root '.env'))) { Copy-Item (Join-Path $root '.env.example') (Join-Path $root '.env'); Write-Host "Created .env from .env.example" }

function Port-Busy($p) { return [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }
if (Port-Busy 8000) { Write-Host "Port 8000 is already in use. Run .\stop.ps1 first (or the app is already running)." -ForegroundColor Yellow; exit 1 }
if (Port-Busy 5173) { Write-Host "Port 5173 is already in use. Run .\stop.ps1 first (or the app is already running)." -ForegroundColor Yellow; exit 1 }

Start-Process powershell -WorkingDirectory $root -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='Civic Flow API'; & '$py' -m uvicorn backend.api.main:app --port 8000"
Start-Process powershell -WorkingDirectory (Join-Path $root 'frontend') -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='Civic Flow Web'; npm run dev -- --port 5173"

Write-Host "Starting... waiting for the API to come up (the first start seeds the demo data)." -ForegroundColor Gray
$up = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  try { $h = Invoke-RestMethod -Uri 'http://localhost:8000/api/health' -TimeoutSec 2; if ($h.status -eq 'ok') { $up = $true; break } } catch { }
}
if (-not $up) { Write-Host "The API did not answer in 40 seconds. Look at the 'Civic Flow API' window for the error." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Civic Flow is running." -ForegroundColor Green
Write-Host "  Citizen:   http://localhost:5173/"
Write-Host "  Ops:       http://localhost:5173/ops"
Write-Host "  Vendor:    http://localhost:5173/vendor"
Write-Host "  Workflow:  http://localhost:5173/workflow"
Write-Host "  API check: http://localhost:8000/api/health"
Write-Host "  Stop it with:  .\stop.ps1" -ForegroundColor Gray
if (-not $NoBrowser) { Start-Process 'http://localhost:5173/' }
