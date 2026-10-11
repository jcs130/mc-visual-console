$ErrorActionPreference = 'Stop'
$overlayRoot = $PSScriptRoot
Set-Location -LiteralPath $overlayRoot
python server.py
