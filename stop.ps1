# Stops Civic Flow (frees ports 8000 and 5173).
foreach ($port in 8000, 5173) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop; Write-Host "Stopped the process on port $port" } catch { Write-Host "Could not stop the process on port $port : $($_.Exception.Message)" -ForegroundColor Yellow }
  }
  if (-not $conns) { Write-Host "Nothing was running on port $port" -ForegroundColor Gray }
}
