@echo off
rem ============================================================
rem  Shadow Play launcher wrapper
rem  real logic lives in tools\launch.ps1
rem  usage: this.cmd          normal window
rem         this.cmd kiosk    fullscreen kiosk
rem         this.cmd duo      two players
rem ============================================================
setlocal
cd /d "%~dp0"
set "MODE=%~1"
if /i "%MODE%"=="" goto plain
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\launch.ps1" -Mode %MODE%
goto end
:plain
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\launch.ps1"
:end
endlocal
