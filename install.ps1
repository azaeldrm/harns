param([switch]$NoSwitch, [switch]$NoRelays)
$ErrorActionPreference = 'Stop'

$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) { $python = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $python) { throw 'Python 3 was not found. Install it first.' }

$arguments = @((Join-Path $PSScriptRoot 'scripts\install.py'))
if ($NoSwitch) { $arguments += '--no-switch' }
if ($NoRelays) { $arguments += '--no-relays' }
& $python @arguments
if ($LASTEXITCODE -ne 0) { throw "Installing the Harness layout failed (exit code $LASTEXITCODE)." }
