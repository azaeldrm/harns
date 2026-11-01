$ErrorActionPreference = 'Stop'
$statsHome = Join-Path $env:USERPROFILE '.config\herdr-app'
$statsApp = Join-Path $env:LOCALAPPDATA 'Programs\herdr-app\herdr-app.exe'
$statsSource = Join-Path $PSScriptRoot 'mods\machine-stats'
& $statsApp check $statsSource | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Mod validation failed' }
$statsTarget = Join-Path $statsHome 'mods\machine-stats'
New-Item -ItemType Directory -Path $statsTarget -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $statsSource 'main.js'),(Join-Path $statsSource 'probes.js'),(Join-Path $statsSource 'mod.json') -Destination $statsTarget
Copy-Item -Path (Join-Path $statsSource '*.svg') -Destination $statsTarget
$statsRingTarget = Join-Path $statsTarget 'rings'
New-Item -ItemType Directory -Path $statsRingTarget -Force | Out-Null
Copy-Item -Path (Join-Path $statsSource 'rings\*.svg') -Destination $statsRingTarget -Force
$statsBrandTarget = Join-Path $statsHome 'brand-assets'
New-Item -ItemType Directory -Path $statsBrandTarget -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'brand-assets\chatgpt-knot.svg') -Destination $statsBrandTarget -Force
$statsProgramsPath = Join-Path $statsHome 'programs.json'
if (Test-Path -LiteralPath $statsProgramsPath) {
  $statsPrograms = Get-Content -LiteralPath $statsProgramsPath -Raw | ConvertFrom-Json
  if (-not $statsPrograms.programs) { $statsPrograms | Add-Member -NotePropertyName programs -NotePropertyValue ([pscustomobject]@{}) -Force }
  $statsPrograms.programs | Add-Member -NotePropertyName codex -NotePropertyValue ([pscustomobject]@{icon='brand-assets/chatgpt-knot.svg';tint=$false}) -Force
  $statsProgramsJson = $statsPrograms | ConvertTo-Json -Depth 50
  [System.IO.File]::WriteAllText($statsProgramsPath, $statsProgramsJson, [System.Text.UTF8Encoding]::new($false))
} else {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'programs.json') -Destination $statsProgramsPath
}
$statsLayoutPath = Join-Path $statsHome 'layouts\machine-stats.json'
if (Test-Path -LiteralPath $statsLayoutPath) {
  & (Join-Path $PSScriptRoot 'scripts\apply-style.ps1')
  Write-Host 'Updated mods and applied the Harness style to the existing layout.'
  return
}
$statsCurrent = (& $statsApp status | ConvertFrom-Json).layout
$statsArgs = @{name=$statsCurrent;as='machine-stats'} | ConvertTo-Json -Compress
if ($PSVersionTable.PSVersion.Major -lt 7) { $statsArgs = $statsArgs.Replace('"', '\"') }
& $statsApp do layout.clone $statsArgs | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Layout clone failed' }
$statsLayout = Get-Content -LiteralPath $statsLayoutPath -Raw | ConvertFrom-Json
function Find-StatsSidebar($node) {
  if ($node.id -eq 'sidebar') { return $node }
  foreach ($child in $node.children) { $found = Find-StatsSidebar $child; if ($found) { return $found } }
}
$statsSidebar = Find-StatsSidebar $statsLayout
if (-not $statsSidebar) { throw 'Layout has no sidebar; add a machine-stats block to the personal layout manually.' }
$statsPanel = [pscustomobject]@{id='machine-stats-panel';type='block';size=@{px=205};min=190;content=@{mod='machine-stats'}}
$statsChildren = @($statsSidebar.children)
$statsSidebar.children = @($statsChildren | Where-Object { $_.id -ne 'sidebar-footer' }) + @($statsPanel) + @($statsChildren | Where-Object { $_.id -eq 'sidebar-footer' })
$statsJson = $statsLayout | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($statsLayoutPath, $statsJson, [System.Text.UTF8Encoding]::new($false))
& $statsApp check $statsTarget | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Installed mod validation failed' }
& (Join-Path $PSScriptRoot 'scripts\apply-style.ps1')
& $statsApp status | Out-Host
