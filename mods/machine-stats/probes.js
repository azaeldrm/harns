/**
 * One CPU/RAM probe per platform, run through herdr's machine connection (no listener).
 * Each prints one JSON object: `cpu` (percent, or null with `cpuRaw` counters on Windows,
 * turned into a percent from two samples), `memory` (percent used) and `gpus`, the raw
 * output of every GPU command it was given, by vendor (see gpus.js).
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
@{
  cpu = $null
  cpuRaw = @{idle=$cpu.PercentProcessorTime.ToString();time=$cpu.Timestamp_Sys100NS.ToString()}
  memory = 100 * (1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize)
  gpus = $gpus
} | ConvertTo-Json -Compress -Depth 4
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

/** Linux: Python 3 reading /proc. */
export function linuxProbe(queries) {
  return `${pythonGpus(queries)}
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
print(json.dumps(dict(cpu=100*(1-(j-i)/(b-a)) if b>a else None, memory=100*(1-memory['MemAvailable']/memory['MemTotal']), gpus=gpus)))
`;
}

/** macOS: Python 3 with top, vm_stat and sysctl. Not yet run on a Mac. */
export function macosProbe(queries) {
  return `${pythonGpus(queries)}
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
print(json.dumps(dict(cpu=cpu, memory=memory, gpus=gpus)))
`;
}
