<#
.SYNOPSIS
Installs the Harness layout into herdr: its mods, theme, brand assets and program
icons, then the herdr-harness layout itself, and switches to it.

Run it from a clone of this repository. If the clone is the herdr home itself (the
way this repository is kept on the machine it was made on), there is nothing to copy:
it only regenerates the built files and checks the mods.

-NoSwitch installs without switching to the layout.
#>
param([switch]$NoSwitch)
$ErrorActionPreference = 'Stop'

$repo = $PSScriptRoot
$herdrHome = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } else { Join-Path $env:USERPROFILE '.config\herdr-app' }
$app = (Get-Command herdr-app -ErrorAction SilentlyContinue).Source
if (-not $app) { $app = Join-Path $env:LOCALAPPDATA 'Programs\herdr-app\herdr-app.exe' }
if (-not (Test-Path -LiteralPath $app)) { throw 'herdr-app was not found. Install the Herdr app first.' }
$utf8 = [System.Text.UTF8Encoding]::new($false)
$mods = @('harness-chrome', 'harness-pane', 'harness-tabs', 'machine-agents', 'machine-metrics',
  'machine-new-menu', 'machine-spaces', 'machine-stats', 'workspace-status-machine')

& python (Join-Path $repo 'scripts\build-mods.py')
if ($LASTEXITCODE -ne 0) { throw 'Generating the built mod files failed (python scripts/build-mods.py).' }

$probe = Join-Path $repo ".install-probe-$PID"
[System.IO.File]::WriteAllText($probe, '')
$inPlace = Test-Path -LiteralPath (Join-Path $herdrHome (Split-Path $probe -Leaf))
Remove-Item -LiteralPath $probe

if (-not $inPlace) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  foreach ($mod in $mods) {
    $target = Join-Path $herdrHome "mods\$mod"
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Copy-Item -Path (Join-Path $repo "mods\$mod\*") -Destination $target -Recurse -Force
  }
  New-Item -ItemType Directory -Path (Join-Path $herdrHome 'themes'), (Join-Path $herdrHome 'brand-assets'), (Join-Path $herdrHome 'layouts') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $repo 'themes\harness.json') -Destination (Join-Path $herdrHome 'themes\harness.json') -Force
  Copy-Item -Path (Join-Path $repo 'brand-assets\*') -Destination (Join-Path $herdrHome 'brand-assets') -Force

  $layoutTarget = Join-Path $herdrHome 'layouts\herdr-harness.json'
  if (Test-Path -LiteralPath $layoutTarget) { Copy-Item -LiteralPath $layoutTarget -Destination "$layoutTarget.before-install-$stamp" }
  Copy-Item -LiteralPath (Join-Path $repo 'layouts\herdr-harness.json') -Destination $layoutTarget -Force

  $programsTarget = Join-Path $herdrHome 'programs.json'
  $ours = Get-Content -LiteralPath (Join-Path $repo 'programs.json') -Raw | ConvertFrom-Json
  if (Test-Path -LiteralPath $programsTarget) {
    $theirs = Get-Content -LiteralPath $programsTarget -Raw | ConvertFrom-Json
    if (-not $theirs.programs) { $theirs | Add-Member -NotePropertyName programs -NotePropertyValue ([pscustomobject]@{}) -Force }
    foreach ($entry in $ours.programs.PSObject.Properties) {
      if (-not $theirs.programs.($entry.Name)) { $theirs.programs | Add-Member -NotePropertyName $entry.Name -NotePropertyValue ([pscustomobject]@{}) }
      foreach ($field in $entry.Value.PSObject.Properties) {
        $theirs.programs.($entry.Name) | Add-Member -NotePropertyName $field.Name -NotePropertyValue $field.Value -Force
      }
    }
    [System.IO.File]::WriteAllText($programsTarget, ($theirs | ConvertTo-Json -Depth 50), $utf8)
  } else {
    Copy-Item -LiteralPath (Join-Path $repo 'programs.json') -Destination $programsTarget
  }
}

foreach ($mod in $mods) {
  & $app check (Join-Path $herdrHome "mods\$mod") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "herdr-app check failed for mods\$mod" }
}

$layout = Get-Content -LiteralPath (Join-Path $repo 'layouts\herdr-harness.json') -Raw
$needed = [regex]::Matches($layout, '"mod":\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
$missing = @($needed | Where-Object { -not (Test-Path -LiteralPath (Join-Path $herdrHome "mods\$_")) })
if ($missing.Count) {
  Write-Warning ("The layout also uses mods that aren't installed: " + ($missing -join ', ') +
    '. herdr-chat comes from https://github.com/azaeldrm/herdr-chat; install those before switching, or the layout shows errors in their place.')
}

if (-not $NoSwitch -and -not $missing.Count) {
  & $app do layout.switch --name herdr-harness | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Switching to the herdr-harness layout failed.' }
}
& $app status | Out-Host
