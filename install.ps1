<#
.SYNOPSIS
Installs the Harness layout into herdr: its mods, theme, brand assets and program
icons, then the herdr-harness layout itself, and switches to it.

Run it from a clone of this repository. If the clone is the herdr home itself (the
way this repository is kept on the machine it was made on), there is nothing to copy:
it only regenerates the built files and checks the mods.

The work is done by scripts/install.py, which install.sh runs on Linux and macOS.

-NoSwitch installs without switching to the layout.
#>
param([switch]$NoSwitch)
$ErrorActionPreference = 'Stop'

$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) { $python = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $python) { throw 'Python 3 was not found. Install it first.' }

$arguments = @((Join-Path $PSScriptRoot 'scripts\install.py'))
if ($NoSwitch) { $arguments += '--no-switch' }
& $python @arguments
if ($LASTEXITCODE -ne 0) { throw "Installing the Harness layout failed (exit code $LASTEXITCODE)." }
