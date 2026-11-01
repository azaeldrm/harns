$ErrorActionPreference = 'Stop'
$styleRoot = Split-Path $PSScriptRoot -Parent
$styleHome = Join-Path $env:USERPROFILE '.config\herdr-app'
$styleUtf8 = [System.Text.UTF8Encoding]::new($false)
& python (Join-Path $styleRoot 'scripts\build-mods.py')
if ($LASTEXITCODE -ne 0) { throw 'Mod asset generation failed' }
foreach ($styleMod in @('harness-tabs', 'harness-pane', 'harness-chrome', 'machine-metrics', 'machine-agents', 'machine-stats', 'machine-new-menu', 'machine-spaces', 'workspace-status-machine')) {
  $styleTarget = Join-Path $styleHome "mods\$styleMod"
  New-Item -ItemType Directory -Path $styleTarget -Force | Out-Null
  Copy-Item -Path (Join-Path $styleRoot "mods\$styleMod\*") -Destination $styleTarget -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $styleRoot 'themes\harness.json') -Destination (Join-Path $styleHome 'themes\harness.json') -Force
$styleLayoutPath = Join-Path $styleHome 'layouts\machine-stats.json'
$styleLayout = Get-Content -LiteralPath $styleLayoutPath -Raw | ConvertFrom-Json
if (-not (Test-Path -LiteralPath "$styleLayoutPath.before-harness-style")) {
  Copy-Item -LiteralPath $styleLayoutPath -Destination "$styleLayoutPath.before-harness-style"
}
$styleLayout | Add-Member -NotePropertyName theme -NotePropertyValue 'harness' -Force
$styleLayout.divider.color = '#00000000'
$styleSidebar = $styleLayout.children | Where-Object id -eq 'sidebar' | Select-Object -First 1
$styleSidebar.background = 'surface'
$styleSidebar | Add-Member -NotePropertyName divider -NotePropertyValue @{width=0;color='#00000000'} -Force
$styleFooter = @($styleSidebar.children | Where-Object id -eq 'sidebar-footer')
foreach ($styleFooterNode in $styleFooter) { $styleFooterNode.size.px = 92 }
$styleOtherChildren = @($styleSidebar.children | Where-Object { $_.id -notin @('machine-stats-panel', 'sidebar-footer', 'usage-section-gap', 'sidebar-free-space') })
$styleLists = $styleOtherChildren | Where-Object id -eq 'sidebar-lists'
$styleLists | Add-Member -NotePropertyName size -NotePropertyValue @{weight=1} -Force
$styleLists.PSObject.Properties.Remove('max')
$styleSidebar.children = @($styleOtherChildren + $styleFooter)
function Set-HarnessStyle($node) {
  if ($node.content.mod -eq 'tabs') { $node.content.mod = 'harness-tabs' }
  if ($node.content.mod -eq 'workspace-chrome') { $node.content.mod = 'harness-chrome' }
  if ($node.content.pane) {
    $node.content.pane.header.content.mod = 'harness-pane'
    $node.content.pane.header.height = 32
    $node.content.pane.border.color = 'border'
    $node.content.pane.focus.color = '#49402c'
    $node.content.pane.radius = 10
  }
  if ($node.id -eq 'work-body') { $node.padding = 12; $node.gap = 12 }
  foreach ($styleChild in $node.children) { Set-HarnessStyle $styleChild }
}
Set-HarnessStyle $styleLayout
[System.IO.File]::WriteAllText($styleLayoutPath, ($styleLayout | ConvertTo-Json -Depth 100), $styleUtf8)
$styleProgramsPath = Join-Path $styleHome 'programs.json'
$stylePrograms = Get-Content -LiteralPath $styleProgramsPath -Raw | ConvertFrom-Json
foreach ($styleAgent in @('codex', 'claude', 'pi')) {
  if (-not $stylePrograms.programs.$styleAgent) {
    $stylePrograms.programs | Add-Member -NotePropertyName $styleAgent -NotePropertyValue ([pscustomobject]@{})
  }
  $stylePrograms.programs.$styleAgent | Add-Member -NotePropertyName tint -NotePropertyValue $true -Force
}
[System.IO.File]::WriteAllText($styleProgramsPath, ($stylePrograms | ConvertTo-Json -Depth 30), $styleUtf8)
