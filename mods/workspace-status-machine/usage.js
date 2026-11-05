/**
 * Claude's and Codex's usage limits belong to the account, so one reading from either service
 * stands for every machine. These turn the account probe's answer (probes.js) into the two
 * windows the bar shows (5h and 7d, each `{ used, resetsAt }` in percent and epoch seconds). No
 * herdr imports: tested alone (tests/usage.mjs).
 */

const valid = n => typeof n === 'number' && Number.isFinite(n);
const windowOf = (used, resetsAt) => valid(used) ? { used: Math.max(0, Math.min(100, used)), resetsAt: valid(resetsAt) ? resetsAt : null } : null;

/**
 * One service's reading from the probe: `{ fiveHour, sevenDay }` (each a window or null) when it
 * answered, `{ error }` when it couldn't be read (not installed, signed out, no answer).
 */
export function fromProbe(part) {
  if (!part || typeof part !== 'object') return { error: 'No answer' };
  if (typeof part.error === 'string') return { error: part.error };
  const five = windowOf(part.fiveHour?.used, part.fiveHour?.resetsAt);
  const week = windowOf(part.sevenDay?.used, part.sevenDay?.resetsAt);
  return five || week ? { fiveHour: five, sevenDay: week } : { error: 'No limits reported' };
}

/** The services an agent's ended turn spends: Claude Code and Codex their own; Pi and others either. */
export function servicesOf(app) {
  if (app === 'claude-code') return ['Claude'];
  if (app === 'codex') return ['Codex'];
  return ['Claude', 'Codex'];
}

/** A window as the bar shows it at `now` (epoch seconds): past its reset, nothing is used yet. */
export function current(window, now = Date.now() / 1000) {
  if (!window) return null;
  return window.resetsAt != null && window.resetsAt <= now ? { used: 0, resetsAt: null } : window;
}
