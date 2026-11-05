import { exec, appHome, readTextFile, window as appWindow } from 'herdr';
import { windowsProbe, linuxProbe, macosProbe, windowsAccountProbe, pythonAccountProbe } from './probes.js';
import { gpuQueries } from './gpus.js';

/**
 * What each platform runs for machine-stats. Every entry gives:
 * - `probe()`: the command (`[program, args]`) that prints a CPU/RAM/GPU sample (probes.js);
 * - `usage(services)`: the command that prints the account's limits for those services (probes.js);
 * - `hostname`: the command that prints the computer's name.
 * To support another platform, add an entry and teach `platformOf` to recognise it.
 */
export const PLATFORMS = {
  windows: {
    probe: () => ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsProbe(gpuQueries('windows'))]],
    usage: services => ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsAccountProbe(services)]],
    hostname: ['hostname', []],
  },
  linux: {
    probe: () => ['python3', ['-c', linuxProbe(gpuQueries('linux'))]],
    usage: services => ['python3', ['-c', pythonAccountProbe(services)]],
    hostname: ['hostname', []],
  },
  macos: {
    probe: () => ['python3', ['-c', macosProbe(gpuQueries('macos'))]],
    usage: services => ['python3', ['-c', pythonAccountProbe(services)]],
    hostname: ['scutil', ['--get', 'ComputerName']],
  },
};

const known = {};

/**
 * The platform a machine runs: this computer's comes from the app; another machine is asked
 * once (`uname -s`: Darwin is macOS, anything else Linux; no uname means Windows) and remembered.
 */
export async function platformOf(machine) {
  if (machine === null) return PLATFORMS[appWindow().platform] ? appWindow().platform : 'linux';
  if (known[machine]) return known[machine];
  try {
    const r = await exec('uname', ['-s'], { on: machine });
    if (r.code === 0) return (known[machine] = r.stdout.trim() === 'Darwin' ? 'macos' : 'linux');
  } catch {}
  return (known[machine] = 'windows');
}

/** Forgets a machine's platform, so the next call asks again (after its probe stopped working). */
export function forgetPlatform(machine) { delete known[machine]; }

/** Runs one of a platform's commands on a machine (null: this computer). */
export function runOn(machine, [program, args]) {
  return exec(program, args, machine === null ? undefined : { on: machine });
}

/**
 * This computer's name for the sidebar and status bar: `localMachineName` from
 * `harness.json` in the herdr home when it's set (a per-person file, not part of the
 * layout), else the computer's own name, else "This computer".
 */
export async function localMachineName() {
  try {
    const text = await readTextFile(`${appHome()}/harness.json`);
    const name = text ? JSON.parse(text).localMachineName : null;
    if (typeof name === 'string' && name.trim()) return name.trim();
  } catch {}
  try {
    const platform = await platformOf(null);
    const r = await runOn(null, PLATFORMS[platform].hostname);
    const name = r.code === 0 ? r.stdout.trim() : '';
    if (name) return name;
  } catch {}
  return 'This computer';
}
