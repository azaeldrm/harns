// Commands execute through Herdr's existing machine connection; no listener.
export const windowsProbe = `
$ErrorActionPreference = 'Stop'
$cpu = Get-CimInstance Win32_PerfRawData_PerfOS_Processor -Filter "Name='_Total'"
$os = Get-CimInstance Win32_OperatingSystem
$gpu = @()
try { $gpu = @( & nvidia-smi --query-gpu=uuid,utilization.gpu --format=csv,noheader,nounits 2>$null ) } catch {}
@{
  cpu = $null
  cpuRaw = @{idle=$cpu.PercentProcessorTime.ToString();time=$cpu.Timestamp_Sys100NS.ToString()}
  memory = 100 * (1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize)
  gpu = $gpu
} | ConvertTo-Json -Compress
`;

export const linuxProbe = `
import json, time, subprocess
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
try:
    gpu = subprocess.run(['nvidia-smi', '--query-gpu=uuid,utilization.gpu', '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=3).stdout.strip().splitlines()
except (OSError, subprocess.TimeoutExpired): gpu = []
print(json.dumps(dict(cpu=100*(1-(j-i)/(b-a)) if b>a else None, memory=100*(1-memory['MemAvailable']/memory['MemTotal']), gpu=gpu)))
`;
