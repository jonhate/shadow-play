@echo off
rem Kiosk duo: delegates to tools\launch.ps1
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\launch.ps1" -Mode duo
