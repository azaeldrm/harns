$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$claudeHome = Join-Path $env:USERPROFILE '.claude'
$settingsPath = Join-Path $claudeHome 'settings.json'
$statusScriptPath = Join-Path $claudeHome 'herdr-usage-statusline.ps1'
New-Item -ItemType Directory -Path $claudeHome -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot 'scripts\claude-usage-statusline.ps1') -Destination $statusScriptPath -Force

if (Test-Path -LiteralPath $settingsPath) {
  $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
} else {
  $settings = [pscustomobject]@{}
}
if ($settings.statusLine) {
  throw "Claude Code already has a custom statusLine in $settingsPath. Merge the Herdr usage relay into that script to preserve the existing status line."
}

$backupPath = "$settingsPath.before-herdr-usage"
if ((Test-Path -LiteralPath $settingsPath) -and -not (Test-Path -LiteralPath $backupPath)) {
  Copy-Item -LiteralPath $settingsPath -Destination $backupPath
}
$commandPath = $statusScriptPath.Replace('\', '/')
$settings | Add-Member -NotePropertyName statusLine -NotePropertyValue @{
  type = 'command'
  command = "powershell -NoProfile -NonInteractive -File $commandPath"
} -Force
$json = $settings | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($settingsPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output "Installed Claude usage relay at $statusScriptPath"
Write-Output "Backed up existing settings to $backupPath when applicable"
