@echo off
rem Kiosk single player: delegates to tools\launch.ps1
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\launch.ps1" -Mode kiosk
