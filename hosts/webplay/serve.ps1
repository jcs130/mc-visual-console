# Start the web-play entry (ASCII only: PowerShell 5.1 mis-decodes UTF-8 comments without BOM).
# Runs prismarine-web-client's own server (express + the WebSocket->TCP proxy).
$ErrorActionPreference = 'Stop'
$root = 'D:\mc-visual-console\hosts\webplay'
$port = if ($env:MC_WEBPLAY_PORT) { $env:MC_WEBPLAY_PORT } else { '8080' }
$out = Join-Path $root 'serve.out.log'
$err = Join-Path $root 'serve.err.log'

if (-not (Test-Path (Join-Path $root 'node_modules\prismarine-web-client\server.js'))) {
    'ERROR: run npm install in hosts/webplay first (npm install --ignore-scripts)' | Out-File -Encoding utf8 (Join-Path $root 'serve.log')
    exit 1
}

# already up? then do nothing (the scheduled task calls this every 5 minutes)
try {
    $r = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $port + "/") -TimeoutSec 4 -UseBasicParsing
    if ($r.StatusCode -eq 200) { exit 0 }
} catch { }

Set-Location (Join-Path $root 'node_modules\prismarine-web-client')
Start-Process -FilePath 'node' -ArgumentList @('server.js', $port) -WorkingDirectory (Get-Location) -WindowStyle Hidden `
    -RedirectStandardOutput $out -RedirectStandardError $err
exit 0
