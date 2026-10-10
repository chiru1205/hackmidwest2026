# Opens a temporary HTTPS link to the app so you can test the camera and GPS on a real phone.
# Needs the app running first (.\start.ps1). The link changes every time and works only while this window is open.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "cloudflared is not installed. Installing it with winget..." -ForegroundColor Yellow
  winget install -e --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements --silent
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "Still not found. Close this window, open a NEW PowerShell window and run .\phone.ps1 again." -ForegroundColor Red
  exit 1
}
Write-Host "Look for a line like  https://something-random.trycloudflare.com  below, and open it on your phone." -ForegroundColor Cyan
Write-Host "Anyone with the link can open the app, so do not share it. Press Ctrl+C to stop." -ForegroundColor Gray
cloudflared tunnel --url http://localhost:5173
