/**
 * Claude's and Codex's usage limits belong to the account, not to a machine: each machine only
 * holds the last reading an agent made there. These turn each agent's raw reading into two
 * windows (5h and 7d, each `{ used, resetsAt }` in percent and epoch seconds) and keep the newest
 * reading of each window across machines. No herdr imports: tested alone (tests/usage.mjs).
 */

const valid = n => typeof n === 'number' && Number.isFinite(n);
const windowOf = (used, resetsAt) => valid(used) ? { used: Math.max(0, Math.min(100, used)), resetsAt: valid(resetsAt) ? resetsAt : null } : null;

/** Claude's reading: the snapshot the status-line relay writes (~/.claude/herdr-usage.json). */
export function fromClaude(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const five = windowOf(snapshot.fiveHour?.used_percentage, snapshot.fiveHour?.resets_at);
  const week = windowOf(snapshot.sevenDay?.used_percentage, snapshot.sevenDay?.resets_at);
  return five || week ? { fiveHour: five, sevenDay: week } : null;
}

/** Codex's reading: the `rate_limits` of a token_count event in its session log. */
export function fromCodex(limits) {
  if (!limits || typeof limits !== 'object') return null;
  const windows = [limits.primary, limits.secondary].filter(w => w && typeof w === 'object');
  const pick = minutes => windows.find(w => w.window_minutes === minutes);
  const five = pick(300), week = pick(10080);
  const result = { fiveHour: five ? windowOf(five.used_percent, five.resets_at) : null, sevenDay: week ? windowOf(week.used_percent, week.resets_at) : null };
  return result.fiveHour || result.sevenDay ? result : null;
}

/**
 * The newer of two readings of one window: a later reset is a newer window, and within one window
 * usage only goes up, so the higher reading is the newer one.
 */
export function newerWindow(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  if ((a.resetsAt ?? 0) !== (b.resetsAt ?? 0)) return (a.resetsAt ?? 0) > (b.resetsAt ?? 0) ? a : b;
  return a.used >= b.used ? a : b;
}

/** The newest of each window across readings (null ones skipped). */
export function mergeReadings(readings) {
  let fiveHour = null, sevenDay = null;
  for (const r of readings) {
    if (!r) continue;
    fiveHour = newerWindow(fiveHour, r.fiveHour);
    sevenDay = newerWindow(sevenDay, r.sevenDay);
  }
  return fiveHour || sevenDay ? { fiveHour, sevenDay } : null;
}

/** A window as the bar shows it at `now` (epoch seconds): past its reset, nothing is used yet. */
export function current(window, now = Date.now() / 1000) {
  if (!window) return null;
  return window.resetsAt != null && window.resetsAt <= now ? { used: 0, resetsAt: null } : window;
}
