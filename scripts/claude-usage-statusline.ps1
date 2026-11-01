$ErrorActionPreference = 'Stop'
$inputJson = $input | Out-String
if ([string]::IsNullOrWhiteSpace($inputJson)) { exit 0 }

try {
  $session = $inputJson | ConvertFrom-Json
  $address = ($env:HC_TERMINAL_ID -split '/')[-1]
  if ($address -match '^t[0-9a-z]+$') {
    $contextDir = Join-Path $env:USERPROFILE '.config\harness\context'
    New-Item -ItemType Directory -Path $contextDir -Force | Out-Null
    $contextPath = Join-Path $contextDir "$address.claude.json"
    $context = $session.context_window
    $contextSnapshot = @{
      address=$address; tool='claude'; sessionId=$session.session_id
      percent=$context.used_percentage; contextWindow=$context.context_window_size
      updatedAt=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    }
    [System.IO.File]::WriteAllText("$contextPath.tmp", ($contextSnapshot | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath "$contextPath.tmp" -Destination $contextPath -Force
  }
  $limits = $session.rate_limits
  if (-not $limits) { exit 0 }

  $snapshotPath = Join-Path $env:USERPROFILE '.claude\herdr-usage.json'
  $snapshot = [ordered]@{
    updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    fiveHour = $limits.five_hour
    sevenDay = $limits.seven_day
  }
  $snapshotJson = $snapshot | ConvertTo-Json -Depth 8 -Compress
  $tempPath = "$snapshotPath.tmp"
  [System.IO.File]::WriteAllText($tempPath, $snapshotJson, [System.Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $tempPath -Destination $snapshotPath -Force
} catch {
  exit 0
}
