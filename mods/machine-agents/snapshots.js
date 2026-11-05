/**
 * The relays' context snapshots (~/.config/harness/context/<address>.<tool>.json, written by
 * scripts/context-relay.py and the Pi extension) as context.js publishes them: the newest per
 * terminal, by address, leaving out unreadable ones and ones with no percentage (unknown isn't
 * 0%). The same rule as the relay's own collect(), which other machines run. No herdr imports:
 * tested alone (tests/snapshots.mjs).
 */
export function newestSnapshots(texts) {
  const result = {};
  for (const text of texts) {
    let value;
    try { value = JSON.parse(text); } catch { continue; }
    if (!value || typeof value.address !== 'string' || !Number.isFinite(value.percent)) continue;
    const held = result[value.address];
    if (!held || (value.updatedAt ?? 0) > (held.updatedAt ?? 0)) result[value.address] = value;
  }
  return result;
}
