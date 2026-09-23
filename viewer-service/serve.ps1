# Start the mc-visual-console viewer service (Windows, native). ASCII-only on purpose.
# Gate rules: ONLY port 25702; username must start with ag_; version 1.21.1 + offline auth.
param([switch]$Check)

$ErrorActionPreference = 'SilentlyContinue'
$root  = 'D:\mc-visual-console\viewer-service'
$watch = Join-Path $root 'service.log'
$out   = Join-Path $root 'service.out.log'
$err   = Join-Path $root 'service.err.log'
$pport = 7801

function Write-Log([string]$m) {
    Add-Content -Path $watch -Value ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $m) -Encoding UTF8
}

$up = $false
try {
    $r = Invoke-WebRequest ("http://127.0.0.1:$pport/health") -TimeoutSec 3 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $up = $true }
} catch { }

$procs = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object { $_.CommandLine -match 'viewer-service' -and $_.CommandLine -match 'server.mjs' }

if ($Check) {
    if ($up) { Write-Log 'check: up'; exit 0 }
    if ($procs) { Write-Log 'check: process up, protocol not answering yet'; exit 0 }
    Write-Log 'check: down'; exit 1
}

if ($up) { exit 0 }
if ($procs) { Write-Log ('skip: already running pid=' + (($procs | ForEach-Object { $_.ProcessId }) -join ',')); exit 0 }

# Modern-viewer switch and the "through the gate" rule (it refuses to start without MC_GATE_TRANSLATED)
$env:MC_MODERN_VIEWER = '1'
$env:MC_GATE_TRANSLATED = '1'
$env:MC_MODERN_VIEWER_PORT = '7800'
$env:MC_VIEWER_PUBLIC_ORIGIN = 'http://127.0.0.1:7800'
# The modern viewer sends CSP `frame-ancestors 'self' <panel> <console>`
# (mc-modern-viewer.mts:992): only these origins may embed it. The real console is
# served by this service on 7801 (GET / + /assets/*), so both point there;
# pointing elsewhere makes the console's iframe a blank CSP block.
# Keep this file ASCII-only (see header): PowerShell 5.1 mis-decodes UTF-8 comments
# without BOM and can swallow the following line.
$env:MC_PANEL_ORIGIN = 'http://127.0.0.1:7801'
$env:MC_CONSOLE_ORIGIN = 'http://127.0.0.1:7801'

if (-not (Test-Path (Join-Path $root 'node_modules'))) { Write-Log 'ERROR: run npm install in viewer-service first'; exit 1 }
if (-not (Test-Path (Join-Path $root 'server.mjs'))) { Write-Log 'ERROR: server.mjs missing'; exit 1 }

Write-Log 'starting viewer service (port 25702 gate, ag_xiaozhi, 1.21.1)'
Start-Process -FilePath 'node' -ArgumentList @('server.mjs') -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput $out -RedirectStandardError $err
exit 0
