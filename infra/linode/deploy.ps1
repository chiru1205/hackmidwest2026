<#
.SYNOPSIS
  Deploys Civic Flow (citizen app + city staff portal) to ONE Ubuntu 24.04 Linode (Akamai Cloud) over SSH. Safe to re-run.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File infra/linode/deploy.ps1 -Ip 203.0.113.10

.PARAMETER Ip         Public IPv4 of the Linode (required).
.PARAMETER User       SSH user (default root).
.PARAMETER KeyPath    SSH private key (default ~/.ssh/id_ed25519).
.PARAMETER EnvFile    Local .env to turn into the server .env (default .env in the repo root). Never modified.
.PARAMETER SkipBuild  Do not rebuild the frontend; reuse frontend/dist/citizen and frontend/dist/city.
.PARAMETER Domain     Citizen host name. Default: <ip-with-dashes>.sslip.io (real certificate, no DNS work).
                  The city portal is served at city.<Domain> (sslip.io resolves it to the same IP).
.PARAMETER CityPass   Optional password for /api/admin/* (basic auth). Hashed ON the server; never printed or stored locally.
.PARAMETER CityUser   User name for that basic auth (default city).
.PARAMETER DemoMode   true or false (default true) -> DEMO_MODE in the server .env.
.PARAMETER ResetData  Delete the server database and uploaded photos (the demo reseeds on start). Without it data is kept.
#>
param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [string]$User = 'root',
  [string]$KeyPath = '',
  [string]$EnvFile = '.env',
  [switch]$SkipBuild,
  [string]$Domain = '',
  [string]$CityPass = '',
  [string]$CityUser = 'city',
  [ValidateSet('true', 'false')][string]$DemoMode = 'true',
  [switch]$ResetData
)

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

$script:step = 0
function Step([string]$msg) { $script:step++; Write-Host ""; Write-Host ("[{0}] {1}" -f $script:step, $msg) -ForegroundColor Cyan }
function Fail([string]$msg) { Write-Host ""; Write-Host ("ERROR: " + $msg) -ForegroundColor Red; exit 1 }
function Ok([string]$msg) { Write-Host ("    " + $msg) -ForegroundColor Green }

# Repo root = two levels above this script (infra/linode/deploy.ps1)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not (Test-Path (Join-Path $root 'backend\api\main.py'))) { Fail "Cannot find the repo root from $PSScriptRoot (expected backend\api\main.py two folders up)." }
if ($Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { Fail "-Ip must be an IPv4 address like 203.0.113.10 (got '$Ip')." }
if ($User -notmatch '^[a-z_][a-z0-9_-]*$') { Fail "-User looks invalid." }
if ($CityUser -notmatch '^[A-Za-z0-9_.-]+$') { Fail "-CityUser may only contain letters, digits, dot, dash, underscore." }
if ($KeyPath -eq '') { $KeyPath = Join-Path $env:USERPROFILE '.ssh\id_ed25519' }
if (-not [IO.Path]::IsPathRooted($EnvFile)) { $EnvFile = Join-Path $root $EnvFile }
if ($Domain -eq '') { $Domain = ($Ip -replace '\.', '-') + '.sslip.io' }
if ($Domain -notmatch '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$') { Fail "-Domain '$Domain' looks invalid." }
$CityDomain = 'city.' + $Domain
$remote = "$User@$Ip"
$stage = '/root/cf-stage'
$app = '/opt/civicflow'

# ------------------------------------------------------------------ 1. tools
Step 'Checking tools (ssh, scp, tar, key, .env)'
$sshExe = (Get-Command ssh.exe -ErrorAction SilentlyContinue)
$scpExe = (Get-Command scp.exe -ErrorAction SilentlyContinue)
$tarExe = $null
$sysTar = Join-Path $env:SystemRoot 'System32\tar.exe'
if (Test-Path $sysTar) { $tarExe = $sysTar } else { $t = Get-Command tar.exe -ErrorAction SilentlyContinue; if ($t) { $tarExe = $t.Source } }
if (-not $sshExe -or -not $scpExe) { Fail 'ssh/scp not found. Install the Windows OpenSSH Client: Settings > Apps > Optional features > OpenSSH Client.' }
if (-not $tarExe) { Fail 'tar.exe not found (it ships with Windows 10/11 as C:\Windows\System32\tar.exe).' }
if (-not (Test-Path $KeyPath)) { Fail "SSH key not found at $KeyPath. Create one with:  ssh-keygen -t ed25519   (see infra/linode/DEPLOY.md)." }
if (-not (Test-Path $EnvFile)) { Fail "Env file not found: $EnvFile. Copy .env.example to .env and fill in the keys first." }
Ok "ssh, scp, tar, key and $([IO.Path]::GetFileName($EnvFile)) found"

$sshOpts = @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=20')
function Invoke-Ssh([string]$cmd) {
  & $sshExe.Source @sshOpts $remote $cmd
  if ($LASTEXITCODE -ne 0) { throw "Remote command failed (exit $LASTEXITCODE): $cmd" }
}
function Send-File([string]$local, [string]$dest) {
  & $scpExe.Source @sshOpts $local ($remote + ':' + $dest)
  if ($LASTEXITCODE -ne 0) { throw "scp failed for $local" }
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ('civicflow-deploy-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
  # ---------------------------------------------------------------- 2. build
  $distRoot = Join-Path $root 'frontend\dist'
  $distCitizen = Join-Path $distRoot 'citizen'
  $distCity = Join-Path $distRoot 'city'
  if ($SkipBuild) {
    Step 'Skipping frontend build (-SkipBuild)'
  } else {
    Step 'Building both apps (npm run build: citizen + city)'
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) { Fail 'npm.cmd not found. Install Node.js (LTS) or use -SkipBuild with an existing build.' }
    if (-not (Test-Path (Join-Path $root 'frontend\node_modules'))) { Fail 'frontend\node_modules is missing. Run setup.ps1 first.' }
    $pkgText = Get-Content -Raw (Join-Path $root 'frontend\package.json')
    if (-not ($pkgText -match '"build:citizen"' -and $pkgText -match '"build:city"')) {
      Write-Host '    package.json has no build:citizen/build:city scripts; building the single app and using it for both hostnames' -ForegroundColor Yellow
    }
    $oldMock = $env:VITE_MOCK
    $env:VITE_MOCK = '0'
    Push-Location (Join-Path $root 'frontend')
    try { & $npm.Source run build; $code = $LASTEXITCODE } finally { Pop-Location; $env:VITE_MOCK = $oldMock }
    if ($code -ne 0) { Fail 'Frontend build failed (see the messages above). Fix them, or deploy an older build with -SkipBuild.' }
  }
  # Output layout per the contract: dist/citizen and dist/city. Fallback: a single dist/ serves both.
  if (-not (Test-Path (Join-Path $distCitizen 'index.html'))) {
    if (Test-Path (Join-Path $distRoot 'index.html')) { $distCitizen = $distRoot; Write-Host '    frontend\dist\citizen missing; using frontend\dist for the citizen app' -ForegroundColor Yellow }
    else { Fail 'frontend\dist\citizen\index.html is missing. Run once without -SkipBuild.' }
  }
  if (-not (Test-Path (Join-Path $distCity 'index.html'))) {
    $distCity = $distCitizen
    Write-Host '    frontend\dist\city missing; the city hostname will serve the same build as the citizen app (no role separation)' -ForegroundColor Yellow
  }
  Ok "citizen build: $distCitizen"
  Ok "city build:    $distCity"

  # ---------------------------------------------------------------- 3. package
  Step 'Packing the app (no .env, no database, no node_modules)'
  foreach ($p in @('backend', 'contracts', 'scripts', 'data\seed', 'data\photos\seed', 'infra\linode\provision.sh', 'infra\linode\civicflow-api.service', 'infra\linode\Caddyfile.template', 'infra\linode\hashpw.sh', 'backend\requirements.txt')) {
    if (-not (Test-Path (Join-Path $root $p))) { Fail "Expected path missing: $p" }
  }
  $appTgz = Join-Path $tmp 'app.tgz'
  $tarArgs = @('-czf', $appTgz, '-C', $root,
    '--exclude=__pycache__', '--exclude=*.pyc', '--exclude=.venv', '--exclude=node_modules',
    '--exclude=.env', '--exclude=.env.*', '--exclude=*.db', '--exclude=*.db-wal', '--exclude=*.db-shm',
    'backend', 'contracts', 'scripts', 'data/seed', 'data/photos/seed',
    'infra/linode/provision.sh', 'infra/linode/civicflow-api.service', 'infra/linode/Caddyfile.template', 'infra/linode/hashpw.sh')
  & $tarExe @tarArgs
  if ($LASTEXITCODE -ne 0) { Fail 'tar failed while packing the app.' }
  $webTgz = Join-Path $tmp 'web.tgz'
  # --exclude only matters in the single-dist fallback (dist/ then contains the citizen/city subfolders)
  & $tarExe -czf $webTgz -C $distCitizen --exclude=city --exclude=citizen .
  if ($LASTEXITCODE -ne 0) { Fail 'tar failed while packing the citizen app.' }
  $webCityTgz = Join-Path $tmp 'webcity.tgz'
  & $tarExe -czf $webCityTgz -C $distCity --exclude=city --exclude=citizen .
  if ($LASTEXITCODE -ne 0) { Fail 'tar failed while packing the city portal.' }
  Ok ("app {0:N1} MB, citizen web {1:N1} MB, city web {2:N1} MB" -f ((Get-Item $appTgz).Length / 1MB), ((Get-Item $webTgz).Length / 1MB), ((Get-Item $webCityTgz).Length / 1MB))

  # ---------------------------------------------------------------- 4. server .env (local file untouched)
  Step 'Preparing the server .env (written to a temp file; local .env is not changed)'
  $override = [ordered]@{
    'PUBLIC_BASE_URL'  = "https://$Domain"
    'API_INTERNAL_URL' = 'http://127.0.0.1:8000'
    'DB_PATH'          = "$app/data/civicflow.db"
    'EDGEKV_BACKEND'   = 'valkey'
    'VALKEY_URL'       = 'redis://127.0.0.1:6379/0'
    'DEMO_MODE'        = $DemoMode
    'VITE_MOCK'        = '0'
  }
  $dropKeys = @($override.Keys)
  if ($CityPass -ne '') { $dropKeys += @('CITY_USER', 'CITY_PASS_HASH') }
  # CITY_TOKEN: keep a value the local .env defines; otherwise the demo default.
  $cityToken = 'civicflow-city-demo'
  foreach ($line in [IO.File]::ReadAllLines($EnvFile)) {
    if ($line -match '^\s*CITY_TOKEN\s*=\s*(.*)$') {
      $v = (($Matches[1] -replace '\s+#.*$', '').Trim().Trim('"').Trim("'"))
      if ($v -ne '') { $cityToken = $v }
    }
  }
  $dropKeys += 'CITY_TOKEN'
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($line in [IO.File]::ReadAllLines($EnvFile)) {
    $l = $line.TrimEnd("`r")
    if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
      if ($dropKeys -contains $Matches[1]) { continue }
      # systemd's EnvironmentFile does NOT strip trailing "# comments": they would become part of the value
      # (VISION=on   # note  ->  "on   # note"). Write clean KEY=value lines for the server.
      $l = ($l -replace '\s+#.*$', '').TrimEnd()
    }
    $out.Add($l)
  }
  $out.Add('')
  $out.Add('# --- added by deploy.ps1 ---')
  foreach ($k in $override.Keys) { $out.Add("$k=$($override[$k])") }
  $out.Add("CITY_TOKEN=$cityToken")
  $envTmp = Join-Path $tmp 'env'
  [IO.File]::WriteAllText($envTmp, (($out -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
  Ok "PUBLIC_BASE_URL=https://$Domain (citizen URL), CITY_TOKEN set, EDGEKV_BACKEND=valkey (falls back to memory if unreachable), DEMO_MODE=$DemoMode"

  # ---------------------------------------------------------------- 5. connect
  Step "Connecting to $remote"
  try { Invoke-Ssh 'echo connected' } catch {
    Fail ("Cannot log in over SSH. Check: (1) the IP $Ip is right and the Linode is Running, (2) you added the PUBLIC key of $KeyPath when creating the Linode, (3) -User is correct. If you rebuilt the Linode with the same IP, remove the old line from $env:USERPROFILE\.ssh\known_hosts. Details: " + $_.Exception.Message)
  }
  Ok 'SSH works'

  # ---------------------------------------------------------------- 6. upload
  Step 'Uploading'
  Invoke-Ssh "umask 077; mkdir -p $stage"
  Send-File $appTgz "$stage/app.tgz"
  Send-File $webTgz "$stage/web.tgz"
  Send-File $webCityTgz "$stage/webcity.tgz"
  Send-File $envTmp "$stage/env"
  Invoke-Ssh "chmod 600 $stage/env"
  Ok 'app, both frontends and .env uploaded (.env is mode 600 on the server)'

  # ---------------------------------------------------------------- 7. unpack
  Step 'Unpacking on the server'
  if ($ResetData) {
    Write-Host '    -ResetData: deleting the server database and uploaded photos' -ForegroundColor Yellow
    Invoke-Ssh "systemctl stop civicflow-api 2>/dev/null; rm -f $app/data/civicflow.db $app/data/civicflow.db-wal $app/data/civicflow.db-shm; find $app/data/photos -maxdepth 1 -type f -delete 2>/dev/null; true"
  }
  Invoke-Ssh "mkdir -p $app && tar -xzf $stage/app.tgz -C $app --no-same-owner"
  Ok "code unpacked into $app (database and uploads left alone)"

  # ---------------------------------------------------------------- 8. provision
  Step 'Running provision.sh on the server (first run takes about 3 to 6 minutes)'
  try { Invoke-Ssh "DOMAIN=$Domain CITY_DOMAIN=$CityDomain bash $app/infra/linode/provision.sh" } catch {
    Fail ("provision.sh failed. Read the messages above. On the server you can re-run it: ssh $remote 'DOMAIN=$Domain CITY_DOMAIN=$CityDomain bash $app/infra/linode/provision.sh'. Logs: journalctl -u civicflow-api -n 50 --no-pager")
  }

  # ---------------------------------------------------------------- 9. optional admin password
  if ($CityPass -ne '') {
    Step "Setting the admin password for /api/admin/* (user: $CityUser)"
    $pwFile = Join-Path $tmp 'cp'
    [IO.File]::WriteAllText($pwFile, $CityPass, (New-Object System.Text.UTF8Encoding($false)))
    Send-File $pwFile "$stage/cp"
    Invoke-Ssh "chmod 600 $stage/cp"
    $hash = (& $sshExe.Source @sshOpts $remote "bash $app/infra/linode/hashpw.sh $stage/cp" | Select-Object -Last 1)
    $hashCode = $LASTEXITCODE
    Invoke-Ssh "rm -f $stage/cp"
    if ($hashCode -ne 0 -or -not $hash -or -not ([string]$hash).StartsWith('$2')) { Fail 'Could not create the password hash on the server (is caddy installed?).' }
    $cityFile = Join-Path $tmp 'city.env'
    [IO.File]::WriteAllText($cityFile, ("CITY_USER=$CityUser`nCITY_PASS_HASH=$hash`n"), (New-Object System.Text.UTF8Encoding($false)))
    Send-File $cityFile "$stage/city.env"
    Invoke-Ssh "grep -v ^CITY_ $app/.env > $app/.env.new; cat $stage/city.env >> $app/.env.new; chown civic:civic $app/.env.new; chmod 600 $app/.env.new; mv $app/.env.new $app/.env; rm -f $stage/city.env"
    Invoke-Ssh "DOMAIN=$Domain CITY_DOMAIN=$CityDomain bash $app/infra/linode/provision.sh"
    Ok 'Admin basic auth is ON (the browser asks once on the Ops page)'
  }

  # ---------------------------------------------------------------- 10. clean secrets from staging
  Invoke-Ssh "rm -rf $stage"

  # ---------------------------------------------------------------- 11. health
  Step "Waiting for https://$Domain/api/health and https://$CityDomain/ (up to 4 minutes; the first certificate takes 10 to 60 s per host name)"
  function Wait-Url([string]$url, [int]$seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
      try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8
        if ($r.StatusCode -eq 200) { return $true }
      } catch { }
      Start-Sleep -Seconds 4
    }
    return $false
  }
  $healthy = Wait-Url "https://$Domain/api/health" 120
  if ($healthy) { Ok "citizen host answers: https://$Domain/api/health" }
  $cityUp = Wait-Url "https://$CityDomain/" 120
  if ($cityUp) { Ok "city host answers: https://$CityDomain/" }
  if (-not $healthy -or -not $cityUp) {
    Write-Host ''
    if (-not $healthy) { Write-Host "The citizen host https://$Domain did not answer over HTTPS in time." -ForegroundColor Yellow }
    if (-not $cityUp) { Write-Host "The city host https://$CityDomain did not answer over HTTPS in time." -ForegroundColor Yellow }
    Write-Host '  - The API itself was healthy on the server (provision.sh checks that). Usually it is a certificate (one per host name):'
    Write-Host "    ssh $remote 'journalctl -u caddy -n 40 --no-pager'"
    Write-Host '  - Needs ports 80 and 443 open (no Cloud Firewall blocking) and both names resolving to the IP.'
    Write-Host '  - Troubleshooting table: infra/linode/DEPLOY.md'
    exit 2
  }

  Write-Host ''
  Write-Host 'Civic Flow is live on Akamai Cloud (Linode).' -ForegroundColor Green
  Write-Host "  Citizen app:  https://$Domain/"
  Write-Host "  City portal:  https://$CityDomain/   (demo PIN: city)"
  Write-Host "  Health:       https://$Domain/api/health"
  Write-Host ''
  Write-Host 'Logs:    ssh -i <key> ' -NoNewline; Write-Host "$remote 'journalctl -u civicflow-api -f'"
  Write-Host 'Update:  re-run this script (add -SkipBuild if only backend code changed). Data is kept unless -ResetData.'
  Write-Host 'Delete the Linode in Cloud Manager after the event to stop charges.' -ForegroundColor Gray
}
catch {
  Write-Host ''
  Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
finally {
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}
