// The account's usage across machines (mods/machine-stats/usage.js).
//   node tests/usage.mjs
import { fromClaude, fromCodex, newerWindow, mergeReadings, current } from '../mods/machine-stats/usage.js';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};
const w = (used, resetsAt) => ({ used, resetsAt });

check('Claude snapshot', fromClaude({ fiveHour: { used_percentage: 44, resets_at: 100 }, sevenDay: { used_percentage: 81, resets_at: 900 } }),
  { fiveHour: w(44, 100), sevenDay: w(81, 900) });
check('Codex rate_limits, by window length', fromCodex({ primary: { used_percent: 2, window_minutes: 300, resets_at: 100 }, secondary: { used_percent: 65, window_minutes: 10080, resets_at: 900 } }),
  { fiveHour: w(2, 100), sevenDay: w(65, 900) });
check('nothing readable', [fromClaude(null), fromCodex({ primary: null })], [null, null]);

check('a window already reset (older) loses to the current one', newerWindow(w(2, 50), w(44, 100)), w(44, 100));
check('same window: the higher reading is the newer one', newerWindow(w(30, 100), w(44, 100)), w(44, 100));
check('same window: a remote machine read after this one wins', newerWindow(w(44, 100), w(50, 100)), w(50, 100));
check('one missing', [newerWindow(null, w(1, 1)), newerWindow(w(1, 1), null)], [w(1, 1), w(1, 1)]);

check('merge: each window on its own', mergeReadings([
  { fiveHour: w(44, 100), sevenDay: w(10, 900) },
  null,
  { fiveHour: w(2, 50), sevenDay: w(81, 900) },
]), { fiveHour: w(44, 100), sevenDay: w(81, 900) });
check('merge: no readings', mergeReadings([null, null]), null);

check('a window past its reset reads 0%', current(w(80, 100), 200), { used: 0, resetsAt: null });
check('a current window reads as it is', current(w(80, 300), 200), w(80, 300));
process.exit(failed ? 1 : 0);
