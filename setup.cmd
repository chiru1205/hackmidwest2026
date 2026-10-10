@echo off
rem Double-click this file to set up and start Civic Flow. It runs setup.ps1 with the right permissions for this one run.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
echo.
pause
