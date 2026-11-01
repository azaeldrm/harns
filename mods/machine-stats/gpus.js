/**
 * GPU vendors machine-stats can read. Each entry gives, per platform, the command that
 * lists that vendor's GPUs (null where it has none yet), and `parse`, which turns one line
 * of its output into the `"id, load"` line machine-metrics draws (load in percent), or null.
 *
 * To support another vendor, fill in its commands and parser; the probes run every command
 * a platform has, so nothing else changes.
 */
export const GPU_VENDORS = [
  {
    vendor: 'nvidia',
    commands: {
      windows: ['nvidia-smi', '--query-gpu=uuid,utilization.gpu', '--format=csv,noheader,nounits'],
      linux: ['nvidia-smi', '--query-gpu=uuid,utilization.gpu', '--format=csv,noheader,nounits'],
      macos: null,
    },
    parse: line => {
      const [id, load] = String(line).split(',').map(s => s.trim());
      return id && Number.isFinite(Number(load)) ? `${id}, ${Number(load)}` : null;
    },
  },
  { vendor: 'amd', commands: { windows: null, linux: null, macos: null }, parse: () => null },
  { vendor: 'intel', commands: { windows: null, linux: null, macos: null }, parse: () => null },
  { vendor: 'apple', commands: { windows: null, linux: null, macos: null }, parse: () => null },
];

/** The GPU commands to run on a platform, as `{ vendor, argv }`. */
export function gpuQueries(platform) {
  return GPU_VENDORS
    .filter(v => Array.isArray(v.commands[platform]))
    .map(v => ({ vendor: v.vendor, argv: v.commands[platform] }));
}

/** A probe's raw GPU output (`{ vendor: [lines] }`) as the `"id, load"` lines machine-metrics draws. */
export function gpuLines(raw) {
  const lines = [];
  for (const v of GPU_VENDORS) {
    for (const line of raw?.[v.vendor] ?? []) {
      const parsed = v.parse(line);
      if (parsed) lines.push(parsed);
    }
  }
  return lines;
}
