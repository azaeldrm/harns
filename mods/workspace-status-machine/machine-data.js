import { View, div } from 'gpui-kit';
import { machines, spaces, agents, focused, exec, hc, shared, setShared, window as appWindow } from 'herdr';
import { windowsProbe, linuxProbe } from './probes.js';

const key = name => name ?? '@local';
const LOCAL_MACHINE_LABEL = 'azael-pc';
const valid = n => typeof n === 'number' && Number.isFinite(n);
export function activeMachine() {
  const focus = focused();
  const address = focus?.agent ?? focus?.shown ?? focus?.terminal;
  if (address?.includes('/')) return address.split('/')[0];
  const agent = agents().find(a => a.address === focus?.agent || a.address === focus?.shown || a.address === focus?.terminal);
  return spaces().find(s => s.id === (agent?.space ?? focus?.space))?.machine ?? null;
}

const CODEX_USAGE_PROBE = String.raw`import json, queue, subprocess, threading, time
p = subprocess.Popen(['codex', 'app-server', '--listen', 'stdio://'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
lines = queue.Queue()
def read_lines():
    for line in p.stdout:
        lines.put(line)
threading.Thread(target=read_lines, daemon=True).start()
messages = [
    {'method':'initialize','id':1,'params':{'clientInfo':{'name':'harness','title':'Harness machine stats','version':'0.1.0'}}},
    {'method':'initialized','params':{}},
    {'method':'account/rateLimits/read','id':2,'params':{}},
]
try:
    for message in messages:
        p.stdin.write(json.dumps(message) + '\n')
        p.stdin.flush()
    deadline = time.time() + 12
    while time.time() < deadline:
        try:
            response = json.loads(lines.get(timeout=0.25))
        except queue.Empty:
            continue
        except Exception:
            continue
        if response.get('id') == 2:
            result = response.get('result', {})
            limits = result.get('rateLimitsByLimitId', {}).get('codex') or result.get('rateLimits') or {}
            print(json.dumps({'primary': limits.get('primary'), 'secondary': limits.get('secondary')}))
            break
    else:
        print('{}')
finally:
    p.terminate()
    try: p.wait(timeout=1)
    except Exception: p.kill()`;

function usageFromCodex(result) {
  if (result.code !== 0) return null;
  try {
    const snapshot = JSON.parse(result.stdout.trim());
    const primary = snapshot.primary ?? snapshot.secondary;
    const secondary = snapshot.primary ? snapshot.secondary : null;
    if (!valid(primary?.usedPercent)) return null;
    const windowName = window => window?.windowDurationMins === 300 ? '5h'
      : window?.windowDurationMins === 10080 ? '7d'
      : valid(window?.windowDurationMins) ? `${window.windowDurationMins}m` : '';
    const reset = epoch => valid(epoch) ? new Date(epoch * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
    return {
      used: Math.max(0, Math.min(100, primary.usedPercent)),
      window: windowName(primary),
      reset: reset(primary.resetsAt),
      updatedAt: Date.now() / 1000,
      secondary: valid(secondary?.usedPercent) ? {
        used: Math.max(0, Math.min(100, secondary.usedPercent)),
        window: windowName(secondary),
        reset: reset(secondary.resetsAt),
      } : null,
    };
  } catch { return null; }
}

function usageFromClaude(result) {
  if (result.code !== 0) return null;
  try {
    const snapshot = JSON.parse(result.stdout.trim());
    const windows = [
      { value: snapshot.fiveHour, window: '5h' },
      { value: snapshot.sevenDay, window: '7d' },
    ].filter(item => valid(item.value?.used_percentage)).sort((a, b) => b.value.used_percentage - a.value.used_percentage);
    const primary = windows[0];
    const secondary = windows[1];
    if (!primary) return null;
    const reset = epoch => valid(epoch) ? new Date(epoch * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
    return {
      used: Math.max(0, Math.min(100, primary.value.used_percentage)),
      window: primary.window,
      reset: reset(primary.value.resets_at),
      secondary: secondary ? {
        used: Math.max(0, Math.min(100, secondary.value.used_percentage)),
        window: secondary.window,
        reset: reset(secondary.value.resets_at),
      } : null,
      updatedAt: snapshot.updatedAt,
    };
  } catch { return null; }
}

export default class MachineStats extends View {
  init(_props, cx) {
    setShared('machine.local-label', LOCAL_MACHINE_LABEL);
    this.samples = {};
    this.pending = {};
    this.providers = {};
    this.raw = {};
    this.usage = {};
    this.usageAt = {};
    this.usagePending = {};
    cx.timer.every(1000, cx => this.refresh(cx));
    this.refresh(cx);
  }

  refresh(cx) {
    const focusedHost = activeMachine();
    this.refreshUsage(cx, focusedHost);
    for (const machine of machines()) {
      const id = key(machine.name);
      if (machine.layout !== 'ready') {
        delete this.samples[id]; delete this.raw[id];
        const published = { ...(shared('machine.stats') ?? {}) };
        delete published[id];
        setShared('machine.stats', published);
        continue;
      }
      if (this.pending[id]) continue;
      this.pending[id] = true;
      cx.spawn(async cx => {
        try {
          const providers = this.providers[id] ? [this.providers[id]]
            : machine.name === null && appWindow().platform === 'windows' ? ['windows'] : ['linux', 'windows'];
          let sample;
          for (const provider of providers) {
            try {
              const result = provider === 'windows'
                ? await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsProbe], { on: machine.name })
                : await exec('python3', ['-c', linuxProbe], { on: machine.name });
              if (result.code !== 0) throw new Error('Probe failed');
              sample = JSON.parse(result.stdout.trim());
              if (!valid(sample.memory) || !Array.isArray(sample.gpu)) throw new Error('Invalid sample');
              if (sample.cpuRaw) {
                const previous = this.raw[id];
                const now = { idle: Number(sample.cpuRaw.idle), time: Number(sample.cpuRaw.time) };
                const elapsed = previous ? now.time - previous.time : 0;
                const idle = previous ? now.idle - previous.idle : -1;
                sample.cpu = elapsed > 0 && idle >= 0 && idle <= elapsed
                  ? Math.max(0, Math.min(100, 100 * (1 - idle / elapsed))) : null;
                this.raw[id] = now;
              }
              this.providers[id] = provider;
              break;
            } catch { sample = null; }
          }
          this.samples[id] = sample ? { ...sample, at: Date.now() } : { error: 'Stats unavailable \u00b7 Windows or Linux + Python 3 required' };
          if (!sample) delete this.providers[id];
        } catch { this.samples[id] = { error: 'Machine unavailable' }; }
        finally {
          this.pending[id] = false;
          const sample = this.samples[id];
          const published = { ...(shared('machine.stats') ?? {}) };
          if (sample && !sample.error) published[id] = { cpu: sample.cpu, memory: sample.memory, gpu: sample.gpu, at: sample.at };
          else delete published[id];
          setShared('machine.stats', published);
          cx.notify();
        }
      });
    }
  }

  refreshUsage(cx, machineName) {
    const id = key(machineName);
    if (this.usagePending[id] || Date.now() - (this.usageAt[id] ?? 0) < 30000) return;
    this.usagePending[id] = true;
    cx.spawn(async cx => {
      try {
        const entries = await Promise.all(['Claude', 'Codex'].map(async tool => {
          if (tool === 'Claude') {
            try {
              const result = machineName === null
                ? await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Content -LiteralPath (Join-Path $env:USERPROFILE ".claude\\herdr-usage.json") -Raw'])
                : await hc(['exec', '--on', machineName, 'sh', '-lc', 'cat "$HOME/.claude/herdr-usage.json"']);
              const usage = usageFromClaude(result);
              if (usage) return [tool, usage];
            } catch {}
          }
          if (tool === 'Codex') {
            try {
              const result = machineName === null
                ? await exec('python', ['-c', CODEX_USAGE_PROBE])
                : await hc(['exec', '--on', machineName, 'python3', '-c', CODEX_USAGE_PROBE]);
              const usage = usageFromCodex(result);
              if (usage) return [tool, usage];
            } catch {}
          }
          return [tool, null];
        }));
        this.usage[id] = Object.fromEntries(entries);
        setShared('machine.usage', { ...(shared('machine.usage') ?? {}), [id]: this.usage[id] });
        this.usageAt[id] = Date.now();
      } finally {
        this.usagePending[id] = false;
        cx.notify();
      }
    });
  }

  render() { return div(); }
}
