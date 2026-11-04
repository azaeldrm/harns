import { View, div } from 'gpui-kit';
import { machines, shared, setShared } from 'herdr';
import { PLATFORMS, platformOf, forgetPlatform, runOn, localMachineName } from './platforms.js';
import { gpuLines } from './gpus.js';
import { fromClaude, fromCodex, mergeReadings } from './usage.js';

const key = name => name ?? '@local';
const valid = n => typeof n === 'number' && Number.isFinite(n);
/** How often each machine is probed (stats and usage), in ms. */
const PROBE_EVERY = 10000;

export default class MachineStats extends View {
  init(_props, cx) {
    const label = () => cx => cx.spawn(async () => {
      const name = await localMachineName();
      if (shared('machine.local-label') !== name) setShared('machine.local-label', name);
    });
    label()(cx);
    cx.timer.every(30000, label());
    this.samples = {};
    this.pending = {};
    this.raw = {};
    this.readings = {};
    cx.timer.every(PROBE_EVERY, cx => this.refresh(cx));
    this.refresh(cx);
  }

  refresh(cx) {
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
          const platform = await platformOf(machine.name);
          let sample = null;
          try {
            const result = await runOn(machine.name, PLATFORMS[platform].probe());
            if (result.code !== 0) throw new Error('Probe failed');
            sample = JSON.parse(result.stdout.trim());
            if (!valid(sample.memory)) throw new Error('Invalid sample');
            this.readings[id] = { Claude: fromClaude(sample.usage?.claude), Codex: fromCodex(sample.usage?.codex) };
            delete sample.usage;
            this.publishUsage();
            sample.gpu = gpuLines(sample.gpus);
            delete sample.gpus;
            if (sample.cpuRaw) {
              const previous = this.raw[id];
              const now = { idle: Number(sample.cpuRaw.idle), time: Number(sample.cpuRaw.time) };
              const elapsed = previous ? now.time - previous.time : 0;
              const idle = previous ? now.idle - previous.idle : -1;
              sample.cpu = elapsed > 0 && idle >= 0 && idle <= elapsed
                ? Math.max(0, Math.min(100, 100 * (1 - idle / elapsed))) : null;
              this.raw[id] = now;
            }
          } catch { sample = null; }
          this.samples[id] = sample ? { ...sample, at: Date.now() }
            : { error: platform === 'windows' ? 'Stats unavailable' : 'Stats unavailable \u00b7 Python 3 required' };
          if (!sample) forgetPlatform(machine.name);
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

  /**
   * The account's usage, one reading per agent: the newest of each window across every machine's
   * reading and the one already published (kept across restarts in herdr's shared state).
   */
  publishUsage() {
    const before = shared('machine.usage') ?? {};
    const usage = {};
    for (const tool of ['Claude', 'Codex']) {
      const merged = mergeReadings([before[tool], ...Object.values(this.readings).map(r => r[tool])]);
      if (merged) usage[tool] = merged;
    }
    if (JSON.stringify(usage) !== JSON.stringify(before)) setShared('machine.usage', usage);
  }

  render() { return div(); }
}
