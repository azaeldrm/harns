import { platformOf, runOn } from './platforms.js';
import { PROBE, distroIcon } from './os-icons.js';

/** The icon name for a machine's system (null: this computer), or null when it couldn't be asked. */
export async function osOf(machine) {
  try {
    const platform = await platformOf(machine);
    if (platform === 'windows') return 'windows';
    if (platform === 'macos') return 'apple';
    const r = await runOn(machine, ['sh', ['-c', PROBE]]);
    return r.code === 0 ? distroIcon(r.stdout) : null;
  } catch { return null; }
}
