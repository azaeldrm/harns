/**
 * One CPU/RAM probe per platform, run through herdr's machine connection (no listener).
 * Each prints one JSON object: `cpu` (percent, or null with `cpuRaw` counters on Windows,
 * turned into a percent from two samples), `memory` (percent used), `gpus`, the raw
 * output of every GPU command it was given, by vendor (see gpus.js), and `usage`: the last
 * usage-limit reading Claude and Codex made on the machine (`claude`: the status-line relay's
 * snapshot; `codex`: the `rate_limits` of the newest token_count event in its session logs,
 * from the 3 most recently written logs of the last 7 day folders). A part that can't be read
 * is left out; it never fails the probe.
 */

const psString = s => `'${String(s).replace(/'/g, "''")}'`;
const pyString = s => JSON.stringify(String(s));

/** Windows: PowerShell with CIM counters. */
export function windowsProbe(queries) {
  return `
$ErrorActionPreference = 'Stop'
$cpu = Get-CimInstance Win32_PerfRawData_PerfOS_Processor -Filter "Name='_Total'"
$os = Get-CimInstance Win32_OperatingSystem
$queries = ${psString(JSON.stringify(queries))} | ConvertFrom-Json
$gpus = @{}
foreach ($q in @($queries)) {
  $exe, $rest = @($q.argv)
  try { $gpus[$q.vendor] = @( & $exe @($rest) 2>$null ) } catch {}
}
$usage = @{}
try { $usage.claude = Get-Content -Raw -LiteralPath (Join-Path $env:USERPROFILE '.claude\herdr-usage.json') | ConvertFrom-Json } catch {}
try {
  $codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
  $days = @(Get-ChildItem -LiteralPath (Join-Path $codexHome 'sessions') -Directory | Get-ChildItem -Directory | Get-ChildItem -Directory |
    Sort-Object FullName -Descending | Select-Object -First 7)
  $logs = @($days | Get-ChildItem -Filter 'rollout-*.jsonl' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 3)
  $best = $null
  foreach ($log in $logs) {
    $stream = [System.IO.File]::Open($log.FullName, 'Open', 'Read', 'ReadWrite')
    try {
      [void]$stream.Seek([Math]::Max(0, $stream.Length - 1048576), 'Begin')
      $lines = (New-Object System.IO.StreamReader($stream)).ReadToEnd() -split "\n"
    } finally { $stream.Dispose() }
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
      if ($lines[$i] -notlike '*"rate_limits"*' -or $lines[$i] -notlike '*"token_count"*') { continue }
      try { $event = $lines[$i] | ConvertFrom-Json } catch { continue }
      if ($event.payload.rate_limits) {
        if (-not $best -or [string]$event.timestamp -gt [string]$best.timestamp) { $best = $event }
        break
      }
    }
  }
  if ($best) { $usage.codex = $best.payload.rate_limits }
} catch {}
@{
  cpu = $null
  cpuRaw = @{idle=$cpu.PercentProcessorTime.ToString();time=$cpu.Timestamp_Sys100NS.ToString()}
  memory = 100 * (1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize)
  gpus = $gpus
  usage = $usage
} | ConvertTo-Json -Compress -Depth 8
`;
}

const pythonGpus = queries => `
import json, subprocess
gpus = {}
for q in json.loads(${pyString(JSON.stringify(queries))}):
    try:
        gpus[q['vendor']] = subprocess.run(q['argv'], capture_output=True, text=True, timeout=3).stdout.strip().splitlines()
    except (OSError, subprocess.TimeoutExpired):
        pass
`;

const pythonUsage = `
import glob, os
def read_usage():
    usage = {}
    home = os.path.expanduser('~')
    try:
        with open(os.path.join(home, '.claude', 'herdr-usage.json'), encoding='utf-8-sig') as f:
            usage['claude'] = json.load(f)
    except Exception:
        pass
    try:
        sessions = os.path.join(os.environ.get('CODEX_HOME') or os.path.join(home, '.codex'), 'sessions')
        days = sorted(glob.glob(os.path.join(sessions, '[0-9]' * 4, '[0-9]' * 2, '[0-9]' * 2)), reverse=True)[:7]
        logs = sorted((p for d in days for p in glob.glob(os.path.join(d, 'rollout-*.jsonl'))), key=os.path.getmtime, reverse=True)[:3]
        best = None
        for path in logs:
            with open(path, 'rb') as f:
                f.seek(max(0, os.path.getsize(path) - 1048576))
                lines = f.read().decode('utf-8', 'replace').splitlines()
            for line in reversed(lines):
                if '"rate_limits"' not in line or '"token_count"' not in line:
                    continue
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                limits = (event.get('payload') or {}).get('rate_limits')
                if limits:
                    if best is None or str(event.get('timestamp', '')) > best[0]:
                        best = (str(event.get('timestamp', '')), limits)
                    break
        if best:
            usage['codex'] = best[1]
    except Exception:
        pass
    return usage
`;

/** Linux: Python 3 reading /proc. */
export function linuxProbe(queries) {
  return `${pythonGpus(queries)}${pythonUsage}
import time
def cpu():
    a = list(map(int, open('/proc/stat').readline().split()[1:9]))
    return sum(a), a[3] + a[4]
a, i = cpu()
time.sleep(0.25)
b, j = cpu()
memory = {}
for line in open('/proc/meminfo'):
    key, value = line.split(':', 1)
    memory[key] = int(value.strip().split()[0])
print(json.dumps(dict(cpu=100*(1-(j-i)/(b-a)) if b>a else None, memory=100*(1-memory['MemAvailable']/memory['MemTotal']), gpus=gpus, usage=read_usage())))
`;
}

/** macOS: Python 3 with top, vm_stat and sysctl. Not yet run on a Mac. */
export function macosProbe(queries) {
  return `${pythonGpus(queries)}${pythonUsage}
import re
cpu = None
try:
    out = subprocess.run(['top', '-l', '2', '-n', '0', '-s', '1'], capture_output=True, text=True, timeout=5).stdout
    idle = re.findall(r'([0-9.]+)% idle', out)
    if idle: cpu = 100 - float(idle[-1])
except (OSError, subprocess.TimeoutExpired):
    pass
memory = None
try:
    total = int(subprocess.run(['sysctl', '-n', 'hw.memsize'], capture_output=True, text=True, timeout=3).stdout.strip())
    vm = subprocess.run(['vm_stat'], capture_output=True, text=True, timeout=3).stdout
    size = int(re.search(r'page size of (\\d+)', vm).group(1))
    pages = lambda name: int(re.search(name + r':\\s+(\\d+)', vm).group(1))
    used = (pages('Pages active') + pages('Pages wired down') + pages('Pages occupied by compressor')) * size
    memory = 100 * used / total
except Exception:
    pass
print(json.dumps(dict(cpu=cpu, memory=memory, gpus=gpus, usage=read_usage())))
`;
}
