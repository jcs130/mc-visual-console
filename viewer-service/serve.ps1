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

if (-not (Test-Path (Join-Path $root 'node_modules'))) { Write-Log 'ERROR: run npm install in viewer-service first'; exit 1 }
if (-not (Test-Path (Join-Path $root 'server.mjs'))) { Write-Log 'ERROR: server.mjs missing'; exit 1 }

Write-Log 'starting viewer service (port 25702 gate, ag_xiaozhi, 1.21.1)'
Start-Process -FilePath 'node' -ArgumentList @('server.mjs') -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput $out -RedirectStandardError $err
exit 0
