# ============================================================
#  Generate all line voices with edge-tts, then refresh manifests.
#
#   powershell -ExecutionPolicy Bypass -File tools\make-voice.ps1
#
# Needs:  python -m pip install edge-tts
# ============================================================
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# --- locate edge-tts (PATH, then user scripts dir, then module) ---
$ttsExe = $null
$cmd = Get-Command edge-tts -ErrorAction SilentlyContinue
if ($cmd) { $ttsExe = $cmd.Source }
if (-not $ttsExe) {
  $cands = @(
    (Join-Path $env:APPDATA "Python\Python314\Scripts\edge-tts.exe"),
    (Join-Path $env:APPDATA "Python\Python313\Scripts\edge-tts.exe"),
    (Join-Path $env:APPDATA "Python\Python312\Scripts\edge-tts.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python314\Scripts\edge-tts.exe")
  )
  foreach ($c in $cands) { if (Test-Path $c) { $ttsExe = $c; break } }
}
$useModule = $false
if (-not $ttsExe) {
  try { & python -c "import edge_tts" 2>$null; if ($LASTEXITCODE -eq 0) { $useModule = $true } } catch {}
}
if (-not $ttsExe -and -not $useModule) {
  Write-Host "edge-tts not found. Run: python -m pip install edge-tts" -ForegroundColor Red
  exit 1
}

# --- per-scene voice ---
$voices = @{
  moon    = "zh-CN-XiaoxiaoNeural"
  battle  = "zh-CN-YunxiNeural"
  crane   = "zh-CN-YunjianNeural"
  xiang   = "zh-CN-XiaoxiaoNeural"
  bawang  = "zh-CN-YunxiNeural"
  baxian  = "zh-CN-YunjianNeural"
  curtain = "zh-CN-XiaoxiaoNeural"
}

$manifestPath = Join-Path $Root "audio\lines.json"
if (-not (Test-Path $manifestPath)) {
  Write-Host "audio\lines.json missing, run: node tools/export-lines.mjs first" -ForegroundColor Red
  exit 1
}
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

$tmp = [System.IO.Path]::GetTempFileName()
$n = 0; $failed = 0
foreach ($sceneProp in $manifest.scenes.PSObject.Properties) {
  $sceneId = $sceneProp.Name
  $voice = $voices[$sceneId]
  if (-not $voice) { $voice = "zh-CN-XiaoxiaoNeural" }
  foreach ($item in $sceneProp.Value) {
    if (-not $item.text) { continue }
    $out = Join-Path $Root ("audio\" + $item.file)
    if (Test-Path $out) { continue }
    $dir = Split-Path -Parent $out
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [System.IO.File]::WriteAllText($tmp, $item.text, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host ("[" + $sceneId + "] " + $item.text)
    if ($useModule) {
      & python -m edge_tts -f $tmp --voice $voice --write-media $out 2>$null | Out-Null
    } else {
      & $ttsExe -f $tmp --voice $voice --write-media $out 2>$null | Out-Null
    }
    if (Test-Path $out) { $n++ } else { $failed++ }
  }
}
Remove-Item $tmp -ErrorAction SilentlyContinue

Write-Host "generated $n file(s), failed $failed; refreshing manifests ..."
node tools/export-lines.mjs
