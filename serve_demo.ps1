# mc-viewer M0 demo launcher: keep the demo alive across tool calls.
# ASCII-only on purpose: PowerShell 5.1 reads .ps1 as ANSI, non-ASCII breaks parsing.
# Usage: serve_demo.ps1 [-Check]
param([switch]$Check)

$ErrorActionPreference = 'SilentlyContinue'
$root  = 'D:\mc-visual-console'
$watch = Join-Path $root 'demo.log'
$out   = Join-Path $root 'demo.out.log'
$err   = Join-Path $root 'demo.err.log'
$port  = 7799

function Write-Log([string]$m) {
    Add-Content -Path $watch -Value ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $m) -Encoding UTF8
}

$up = $false
try {
    $r = Invoke-WebRequest ("http://127.0.0.1:$port/health") -TimeoutSec 3 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $up = $true }
} catch { }

$procs = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object { $_.CommandLine -match 'mc-viewer' }

if ($Check) {
    if ($up) { Write-Log 'check: up'; exit 0 }
    if ($procs) { Write-Log 'check: process up, not answering yet'; exit 0 }
    Write-Log 'check: down'; exit 1
}

if ($up) { exit 0 }
if ($procs) { Write-Log ('skip: node already running pid=' + (($procs | ForEach-Object { $_.ProcessId }) -join ',')); exit 0 }

$tsx = Join-Path $root 'node_modules\tsx\dist\cli.mjs'
if (-not (Test-Path $tsx)) { Write-Log "ERROR: tsx missing: $tsx"; exit 1 }

Write-Log "starting demo: node $tsx src/demo.ts"
Start-Process -FilePath 'node' -ArgumentList @($tsx, 'src/demo.ts') -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput $out -RedirectStandardError $err
exit 0
