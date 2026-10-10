<#
  Civic Flow - one-step setup for Windows. Checks for Git, Python and Node, installs what is missing (with winget),
  creates the Python environment, installs all dependencies, creates your .env, and starts the app.
  Safe to run again at any time.

  Run it from the repo folder (the one that contains this file):
      powershell -ExecutionPolicy Bypass -File .\setup.ps1
  or just double-click setup.cmd.

  Options:
      -CheckOnly        only report what is installed, change nothing
      -SkipAgents       skip the optional AI-agent libraries (Strands, boto3)
      -NonInteractive   never ask for keys (you can edit .env later)
      -NoStart          set everything up but do not start the app
      -Phone            also install cloudflared (for testing on a phone over HTTPS)
#>
param(
  [switch]$CheckOnly,
  [switch]$SkipAgents,
  [switch]$NonInteractive,
  [switch]$NoStart,
  [switch]$Phone
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    [ok] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    [!]  $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "    [x]  $m" -ForegroundColor Red }

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Find-Python {
  # Returns the full path of a Python 3.10-3.13 interpreter, or $null. Skips the Microsoft Store stub.
  $cands = @(@('py', '-3.12'), @('py', '-3.13'), @('py', '-3.11'), @('py', '-3.10'), @('python'), @('python3'))
  foreach ($c in $cands) {
    try {
      $exe = $c[0]
      $extra = @(); if ($c.Count -gt 1) { $extra = $c[1..($c.Count - 1)] }
      if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { continue }
      $ver = & $exe @extra -c "import sys;print('%d.%d' % sys.version_info[:2])" 2>$null
      if ($LASTEXITCODE -ne 0 -or -not $ver) { continue }
      if ($ver -match '^3\.(\d+)$') {
        $minor = [int]$Matches[1]
        if ($minor -ge 10 -and $minor -le 13) {
          $path = & $exe @extra -c "import sys;print(sys.executable)" 2>$null
          if ($path) { return $path.Trim() }
        }
      }
    } catch { }
  }
  return $null
}

function Node-Ok {
  if (-not (Have 'node')) { return $false }
  $v = (& node -v) -replace '^v', ''
  return ([int]($v.Split('.')[0]) -ge 20)
}

function Winget-Install($id, $name) {
  if (-not (Have 'winget')) {
    Fail "winget is not available, so I cannot install $name automatically."
    Write-Host "      Install it by hand, then run this script again:" -ForegroundColor Yellow
    switch ($id) {
      'Git.Git'              { Write-Host "      https://git-scm.com/download/win" }
      'Python.Python.3.12'   { Write-Host "      https://www.python.org/downloads/windows/  (tick 'Add python.exe to PATH')" }
      'OpenJS.NodeJS.LTS'    { Write-Host "      https://nodejs.org  (the LTS installer)" }
      default                { Write-Host "      search for: $name" }
    }
    return $false
  }
  Write-Host "    installing $name (a Windows permission prompt may appear)..." -ForegroundColor Gray
  & winget install -e --id $id --accept-source-agreements --accept-package-agreements --silent | Out-Host
  Refresh-Path
  return $true
}

function Set-EnvValue($file, $key, $value) {
  $lines = @()
  if (Test-Path $file) { $lines = @(Get-Content $file) }
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^$([regex]::Escape($key))=") { $lines[$i] = "$key=$value"; $found = $true; break }
  }
  if (-not $found) { $lines += "$key=$value" }
  Set-Content -Path $file -Value $lines -Encoding utf8
}

function Get-EnvValue($file, $key) {
  if (-not (Test-Path $file)) { return '' }
  $line = Get-Content $file | Where-Object { $_ -match "^$([regex]::Escape($key))=" } | Select-Object -First 1
  if (-not $line) { return '' }
  $v = ($line -replace "^$([regex]::Escape($key))=", '')
  return ($v -replace '\s+#.*$', '').Trim()
}

function Read-Secret($prompt) {
  $s = Read-Host $prompt -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

# ---------------------------------------------------------------- 1. prerequisites
Step "Checking your computer"
Refresh-Path
$git = Have 'git'
$pyPath = Find-Python
$nodeOk = Node-Ok
if ($git)    { Ok "Git: $((& git --version))" }       else { Warn "Git is not installed" }
if ($pyPath) { Ok "Python: $pyPath" }                 else { Warn "Python 3.10-3.13 is not installed" }
if ($nodeOk) { Ok "Node.js: $((& node -v))" }         else { Warn "Node.js 20 or newer is not installed" }
if (Have 'winget') { Ok "winget is available (used for installs)" } else { Warn "winget not found (installs must be done by hand)" }

if ($CheckOnly) {
  Write-Host "`nCheck only: nothing was changed." -ForegroundColor Gray
  exit 0
}

if (-not $git)    { [void](Winget-Install 'Git.Git' 'Git');                      $git = Have 'git' }
if (-not $pyPath) { [void](Winget-Install 'Python.Python.3.12' 'Python 3.12');   $pyPath = Find-Python }
if (-not $nodeOk) { [void](Winget-Install 'OpenJS.NodeJS.LTS' 'Node.js LTS');    $nodeOk = Node-Ok }

$missing = @()
if (-not $pyPath) { $missing += 'Python' }
if (-not $nodeOk) { $missing += 'Node.js' }
if ($missing.Count -gt 0) {
  Fail "Still missing: $($missing -join ', ')."
  Write-Host "      Close this window, open a NEW PowerShell window (so the new install is found), and run setup.ps1 again." -ForegroundColor Yellow
  exit 1
}
Ok "All tools are ready"

# ---------------------------------------------------------------- 2. Python environment
Step "Setting up the Python environment (first time takes a few minutes)"
$venvPy = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) {
  & $pyPath -m venv (Join-Path $root '.venv')
  if (-not (Test-Path $venvPy)) { Fail "Could not create the virtual environment."; exit 1 }
}
Ok "Virtual environment: .venv"
& $venvPy -m pip install --quiet --upgrade pip
& $venvPy -m pip install --quiet -r (Join-Path $root 'backend\requirements.txt')
if ($LASTEXITCODE -ne 0) { Fail "Installing the core Python packages failed (see the messages above)."; exit 1 }
Ok "Core Python packages installed"
if (-not $SkipAgents) {
  & $venvPy -m pip install --quiet -r (Join-Path $root 'backend\requirements-agents.txt')
  if ($LASTEXITCODE -eq 0) { Ok "AI-agent libraries installed (Strands, boto3)" }
  else { Warn "AI-agent libraries failed to install. The app still runs with built-in fallbacks. Retry later with: .venv\Scripts\pip install -r backend\requirements-agents.txt" }
}

# ---------------------------------------------------------------- 3. frontend
Step "Installing the web app packages"
Push-Location (Join-Path $root 'frontend')
try {
  & npm.cmd install --no-audit --no-fund 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail "npm install failed."; exit 1 }
} finally { Pop-Location }
Ok "Web app packages installed"

# ---------------------------------------------------------------- 4. .env
Step "Preparing your settings file (.env)"
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $root '.env.example') $envFile; Ok "Created .env from .env.example" }
else { Ok ".env already exists (kept as is)" }

if (-not $NonInteractive) {
  Write-Host "    Keys are optional. Press Enter to skip any of them; the app still runs with built-in fallbacks." -ForegroundColor Gray
  Write-Host "    Get the team keys from the person who shares them privately. NEVER paste keys in chat or commit .env." -ForegroundColor Gray
  if (-not (Get-EnvValue $envFile 'AKAMAI_AI_KEY')) {
    $k = Read-Secret "    Akamai AI key (starts with hk_), or Enter to skip"
    if ($k) { Set-EnvValue $envFile 'AKAMAI_AI_KEY' $k.Trim(); Ok "Akamai key saved to .env" }
  } else { Ok "Akamai key already set" }
  if (-not (Get-EnvValue $envFile 'DEVREV_PAT')) {
    $k = Read-Secret "    DevRev token, or Enter to skip (only one person needs it; others keep the local ticket board)"
    if ($k) { Set-EnvValue $envFile 'DEVREV_PAT' $k.Trim(); Ok "DevRev token saved to .env" }
    else { Set-EnvValue $envFile 'DEVREV_MODE' 'mock'; Ok "DevRev stays on the local ticket board (DEVREV_MODE=mock)" }
  } else { Ok "DevRev token already set" }
}
if (-not (Get-EnvValue $envFile 'DEVREV_PAT')) { Set-EnvValue $envFile 'DEVREV_MODE' 'mock' }
if (-not (Get-EnvValue $envFile 'AKAMAI_AI_KEY')) { Warn "No Akamai key: the AI writing steps use templates. Add AKAMAI_AI_KEY to .env any time." }

if ($Phone) {
  Step "Installing cloudflared (phone testing)"
  if (-not (Have 'cloudflared')) { [void](Winget-Install 'Cloudflare.cloudflared' 'cloudflared') }
  if (Have 'cloudflared') { Ok "cloudflared ready. After the app starts, run .\phone.ps1" } else { Warn "cloudflared not found yet; open a new PowerShell window after install" }
}

# ---------------------------------------------------------------- 5. verify
Step "Verifying"
& $venvPy -c "import fastapi, uvicorn, pydantic, PIL, imagehash, httpx; print('python packages import ok')"
if ($LASTEXITCODE -ne 0) { Fail "Some Python packages did not import."; exit 1 }
& $venvPy -m pytest (Join-Path $root 'backend\tests') -q 2>&1 | Select-Object -Last 2 | ForEach-Object { Write-Host "    $_" }
if (Get-EnvValue $envFile 'AKAMAI_AI_KEY') {
  $out = & $venvPy (Join-Path $root 'scripts\smoke_akamai.py') 2>&1 | Select-Object -First 2
  $out | ForEach-Object { Write-Host "    akamai: $_" }
}

# ---------------------------------------------------------------- 6. run
Write-Host "`nSetup complete." -ForegroundColor Green
if ($NoStart) { Write-Host "Start the app any time with:  .\start.ps1" ; exit 0 }
Step "Starting the app"
& (Join-Path $root 'start.ps1')
