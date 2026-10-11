<#
.SYNOPSIS
  One-device demo layout: opens the resident app in a phone-shaped window on the left and the city portal on the right,
  side by side on this laptop. Use it for the live demo AND for recording the backup video (one screen, one recording).

.DESCRIPTION
  Left  : the resident app, sized like a phone, as a fresh citizen (empty "My requests").
  Right : the city portal (sign in once with PIN: city).
  Add -Demo if your laptop's location is outside Kansas City: it starts the resident app with a Kansas City demo location.

  Run:  powershell -ExecutionPolicy Bypass -File scripts\demo_windows.ps1
  Then drag a window if it lands in the wrong place. Close both windows to finish.
#>
param(
  [string]$Domain = '172-232-2-16.sslip.io',
  [switch]$Demo,
  [int]$PhoneWidth = 430
)

Add-Type -AssemblyName System.Windows.Forms
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$phoneH = [Math]::Min(940, $area.Height)

$q = '?newuser=1'
if ($Demo) { $q += '&demo=1' }

$edge = 'msedge.exe'
foreach ($c in @('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe')) {
  if (Test-Path $c) { $edge = $c; break }
}
Start-Process $edge -ArgumentList @("--app=https://$Domain/$q", "--window-size=$PhoneWidth,$phoneH", "--window-position=$($area.X),$($area.Y)")
Start-Sleep -Milliseconds 800
$cityW = $area.Width - $PhoneWidth
Start-Process $edge -ArgumentList @("--app=https://city.$Domain/ops", "--window-size=$cityW,$($area.Height)", "--window-position=$($area.X + $PhoneWidth),$($area.Y)")

Write-Host ""
Write-Host "Opened the resident app (left) and the city portal (right)." -ForegroundColor Green
Write-Host "  1. In the right window, enter the PIN: city"
Write-Host "  2. Left window: Allow location if asked (or tap the map to place the pin in Kansas City)."
Write-Host "  3. 'My requests' on the left must be empty."
Write-Host "  4. Turn on Do Not Disturb (Win+N, then the bell) so no notification pops up on screen."
Write-Host ""
Write-Host "To record the backup video: press Win+Shift+R (Snipping Tool screen recording), drag over the whole screen, Start."
Write-Host "Record it silent: you will talk over it live if you ever need to play it."
