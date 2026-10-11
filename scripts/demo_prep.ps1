<#
.SYNOPSIS
  Gets the live Civic Flow demo ready: resets the data, warms up the AI services, and checks everything.
  Creates NO reports and NO tickets (the warm-up only calls the models). Safe to run more than once.

.DESCRIPTION
  1. checks both sites and the health endpoint
  2. resets the demo data (restores the DevRev baseline: 12 prefilled tickets + the Plaza hotspot)  [skip with -SkipReset]
  3. warms up embeddings, hosted chat, vision and case search (twice: the first call after a restart can be slow)
  4. sets the autonomy mode
  5. prints a PASS / WARN / FAIL list and READY or NOT READY

  Run it from the repo root:   powershell -ExecutionPolicy Bypass -File scripts\demo_prep.ps1
  Options:  -Autonomy off|suggest|auto   (default suggest)   -SkipReset   -Domain <sslip domain>
#>
param(
  [string]$Domain = '172-232-2-16.sslip.io',
  [string]$Token = 'civicflow-city-demo',
  [ValidateSet('off', 'suggest', 'auto')][string]$Autonomy = 'suggest',
  [switch]$SkipReset,
  [string]$CityUrl = '',      # override for testing against a local API, e.g. http://127.0.0.1:8000
  [string]$CitizenUrl = ''
)

$ErrorActionPreference = 'Stop'
$citizen = if ($CitizenUrl) { $CitizenUrl } else { "https://$Domain" }
$city = if ($CityUrl) { $CityUrl } else { "https://city.$Domain" }
$hdr = @{ 'X-Role-Token' = $Token }
$results = New-Object System.Collections.Generic.List[object]

function Add-Result($status, $name, $detail) {
  $results.Add([pscustomobject]@{ Status = $status; Check = $name; Detail = $detail })
  $color = @{ PASS = 'Green'; WARN = 'Yellow'; FAIL = 'Red' }[$status]
  Write-Host ("  [{0}] {1}  {2}" -f $status, $name, $detail) -ForegroundColor $color
}
function Get-Json($url, [int]$timeout = 30) {
  Invoke-RestMethod -Uri $url -Headers $hdr -TimeoutSec $timeout -Method Get
}
function Post-Json($url, $body = $null, [int]$timeout = 30) {
  if ($null -ne $body) {
    Invoke-RestMethod -Uri $url -Headers $hdr -TimeoutSec $timeout -Method Post -ContentType 'application/json' -Body ($body | ConvertTo-Json)
  } else {
    Invoke-RestMethod -Uri $url -Headers $hdr -TimeoutSec $timeout -Method Post
  }
}
function Step($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }

# ------------------------------------------------------------------ 1. reachability and health
Step '1. Sites and health'
foreach ($u in @($citizen, $city)) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 20
    Add-Result 'PASS' $u ("HTTP " + $r.StatusCode)
  } catch { Add-Result 'FAIL' $u $_.Exception.Message }
}
try {
  $h = Get-Json "$city/api/health"
  Add-Result 'PASS' 'API health' $h.status
  if ($h.flags.vision) { Add-Result 'PASS' 'Vision' 'on' } else { Add-Result 'FAIL' 'Vision' 'off: photos will not be read' }
  if ($h.flags.agents_mode -eq 'graph') { Add-Result 'PASS' 'Agents' 'graph (hosted chat agents)' } else { Add-Result 'WARN' 'Agents' ("mode " + $h.flags.agents_mode) }
  if ($h.flags.devrev_mode -eq 'live') { Add-Result 'PASS' 'DevRev' 'live' } else { Add-Result 'FAIL' 'DevRev' ("mode " + $h.flags.devrev_mode) }
  if ($h.flags.demo_mode) { Add-Result 'PASS' 'Demo mode' 'on' } else { Add-Result 'WARN' 'Demo mode' 'off: out-of-area locations and unreadable photos will be rejected' }
  foreach ($p in $h.services.PSObject.Properties) {
    if ($p.Value -notmatch '^(ok|on|live|local|valkey)') { Add-Result 'WARN' ("Service " + $p.Name) $p.Value }
  }
} catch { Add-Result 'FAIL' 'API health' $_.Exception.Message }

# ------------------------------------------------------------------ 2. reset
if ($SkipReset) {
  Step '2. Reset skipped (-SkipReset)'
} else {
  Step '2. Reset demo data (restores the DevRev baseline)'
  try {
    Post-Json "$city/api/admin/reset" | Out-Null
    Add-Result 'PASS' 'Reset' 'sent'
    $ok = $false
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 2
      try {
        $c = Get-Json "$city/api/devrev/cases?group=all&limit=1"
        if ($c.total -ge 12 -and $c.counts.approval -ge 1) { $ok = $true; break }
      } catch { }
    }
    if ($ok) { Add-Result 'PASS' 'Baseline restored' ("{0} tickets, {1} awaiting approval" -f $c.total, $c.counts.approval) }
    else { Add-Result 'FAIL' 'Baseline restored' 'the board did not reach 12 tickets within 60 s' }
  } catch { Add-Result 'FAIL' 'Reset' $_.Exception.Message }
}

# ------------------------------------------------------------------ 3. warm-up (twice)
Step '3. Warm up the AI services (creates no reports or tickets)'
foreach ($pass in 1, 2) {
  try {
    $w = Post-Json "$city/api/admin/warmup" $null 150
    $line = ($w.steps.PSObject.Properties | ForEach-Object { "{0} {1}ms {2}" -f $_.Name, $_.Value.ms, $(if ($_.Value.ok) { 'ok' } else { 'FAILED' }) }) -join '   '
    Write-Host ("  pass {0}: {1}" -f $pass, $line)
    if ($pass -eq 2) {
      foreach ($s in $w.steps.PSObject.Properties) {
        if ($s.Value.ok) { Add-Result 'PASS' ("Warm: " + $s.Name) ("{0} ms" -f $s.Value.ms) }
        else { Add-Result 'FAIL' ("Warm: " + $s.Name) 'did not respond' }
      }
    }
  } catch { Add-Result 'FAIL' "Warm-up pass $pass" $_.Exception.Message }
}

# ------------------------------------------------------------------ 4. autonomy mode
Step "4. Autonomy mode: $Autonomy"
try {
  $a = Post-Json "$city/api/devrev/autonomy" @{ mode = $Autonomy }
  Add-Result 'PASS' 'Autonomy' ("{0} (auto-closes {1} at {2:P0}+ confidence)" -f $a.mode, ($a.auto_buckets -join '/'), $a.min_confidence)
} catch { Add-Result 'FAIL' 'Autonomy' $_.Exception.Message }

# ------------------------------------------------------------------ 5. content checks
Step '5. What the audience will see'
try {
  $v = Get-Json "$city/api/vendor/orders"
  if ($v.Count -ge 10) { Add-Result 'PASS' 'Vendors page' ("{0} work orders" -f $v.Count) } else { Add-Result 'FAIL' 'Vendors page' ("only {0} work orders (expected 10+)" -f $v.Count) }
} catch { Add-Result 'FAIL' 'Vendors page' $_.Exception.Message }
try {
  $i = Get-Json "$city/api/impact/live"
  Add-Result 'PASS' 'Impact page' ("{0} reports -> {1} tickets" -f $i.reports, $i.unique_issues)
} catch { Add-Result 'FAIL' 'Impact page' $_.Exception.Message }
try {
  $p = Get-Json "$city/api/platform"
  $withCalls = @($p.parts | Where-Object { $_.calls -gt 0 }).Count
  if ($withCalls -ge 3) { Add-Result 'PASS' 'Under the hood' ("{0} services show live calls; hosting: {1}" -f $withCalls, $p.hosting) }
  else { Add-Result 'WARN' 'Under the hood' ("only {0} services show calls yet; hosting: {1}" -f $withCalls, $p.hosting) }
} catch { Add-Result 'FAIL' 'Under the hood' $_.Exception.Message }
try {
  $q = [uri]::EscapeDataString('water everywhere on the road')
  $s = Get-Json "$city/api/devrev/cases?group=all&q=$q&limit=3" 60
  if ($s.semantic) { Add-Result 'PASS' 'Smart search' ("'water everywhere on the road' -> " + $s.items[0].title) }
  else { Add-Result 'WARN' 'Smart search' 'index still building; retry in a minute (the page falls back to normal search)' }
} catch { Add-Result 'WARN' 'Smart search' $_.Exception.Message }

# ------------------------------------------------------------------ summary
Write-Host ""
$fail = @($results | Where-Object { $_.Status -eq 'FAIL' }).Count
$warn = @($results | Where-Object { $_.Status -eq 'WARN' }).Count
if ($fail -eq 0) {
  Write-Host ("READY  ({0} warnings)" -f $warn) -ForegroundColor Green
} else {
  Write-Host ("NOT READY: {0} failing checks, {1} warnings. Fix the FAIL lines above and run again." -f $fail, $warn) -ForegroundColor Red
}
Write-Host ""
Write-Host "Open before you start:" -ForegroundColor Cyan
Write-Host "  Phone  : $citizen/?newuser=1          (fresh citizen, empty My requests)"
Write-Host "  Laptop : $city/ops                    (PIN: city)   then /workflow, /vendor, /impact"
Write-Host "  Laptop : the DevRev ticket list in another tab"
Write-Host "  Judges : $city/under-the-hood         (open it last, after a few live reports)"
if ($fail -gt 0) { exit 1 }
