import { exec, appHome, readTextFile, window as appWindow } from 'herdr';
import { windowsProbe, linuxProbe, macosProbe, windowsAccountProbe, pythonAccountProbe } from './probes.js';
import { gpuQueries } from './gpus.js';

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
 * The platform a machine runs (windows, linux or macos), asked once and remembered; throws while the machine can't say.
 */
export async function platformOf(machine) {
  if (machine === null) return PLATFORMS[appWindow().platform] ? appWindow().platform : 'linux';
  if (known[machine]) return known[machine];
  const unix = await exec('uname', ['-s'], { on: machine }).catch(() => null);
  if (unix?.code === 0) return (known[machine] = unix.stdout.trim() === 'Darwin' ? 'macos' : 'linux');
  const windows = await exec('cmd.exe', ['/c', 'ver'], { on: machine }).catch(() => null);
  if (windows?.code === 0 && /windows/i.test(windows.stdout)) return (known[machine] = 'windows');
  throw new Error(`${machine} can't say which system it runs`);
}

/** Forgets a machine's platform, so the next call asks again (after its probe stopped working). */
export function forgetPlatform(machine) {
  delete known[machine];
}

/** Runs one of a platform's commands on a machine (null: this computer). */
export function runOn(machine, [program, args]) {
  return exec(program, args, machine === null ? undefined : { on: machine });
}

/** This computer's name for the sidebar and status bar. */
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
