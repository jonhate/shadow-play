# Shadow Play launcher
param([string]$Mode = '', [switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Port = 5173
$Query = ''
if ($Mode -eq 'kiosk') { $Query = '?kiosk=1' } elseif ($Mode -eq 'duo') { $Query = '?duo=1' }
$Url = "http://127.0.0.1:$Port/$Query"

function Test-Port([int]$p) {
  try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $p); $c.Close(); return $true } catch { return $false }
}
function Test-Http([string]$u) {
  try { $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2; return ($r.StatusCode -eq 200) } catch { return $false }
}

if (Test-Port $Port) {
  Write-Host "[1/2] server already running on $Port"
} else {
  $node = (Get-Command node -ErrorAction SilentlyContinue)
  if (-not $node) { Write-Host "*** Node.js not found: https://nodejs.org ***" -ForegroundColor Red; if (-not $NoOpen) { Read-Host "Press Enter" }; exit 1 }
  Write-Host "[1/2] starting local server ..."
  Start-Process -FilePath $node.Source -ArgumentList 'tools\serve.mjs' -WorkingDirectory $Root -WindowStyle Hidden
}

$ok = $false
for ($i = 0; $i -lt 25; $i++) { if (Test-Http "http://127.0.0.1:$Port/") { $ok = $true; break }; Start-Sleep -Milliseconds 800 }
if (-not $ok) { Write-Host "server did not start; see server.log" -ForegroundColor Red; if (-not $NoOpen) { Read-Host "Press Enter" }; exit 1 }
Write-Host "[2/2] opening $Url"
if ($NoOpen -or $env:SHADOWPLAY_NOOPEN -eq '1') { exit 0 }

$cands = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) }
$browser = $cands | Select-Object -First 1
if ($Mode -eq 'kiosk' -and $browser) {
  Start-Process -FilePath $browser -ArgumentList @('--kiosk', "--user-data-dir=$Root\.edge-kiosk", '--no-first-run', '--disable-session-crashed-bubble', $Url)
} elseif ($browser) {
  Start-Process -FilePath $browser -ArgumentList @('--new-window', $Url)
} else {
  Start-Process $Url
}
Write-Host "done."
