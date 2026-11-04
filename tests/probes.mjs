// The Linux probe's usage part, run against a stand-in home folder.
//   node tests/probes.mjs
import { linuxProbe } from '../mods/machine-stats/probes.js';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${detail}`}`); if (!ok) failed++; };
const probe = home => JSON.parse(execFileSync('python3', ['-c', linuxProbe([])], { env: { ...process.env, HOME: home, CODEX_HOME: '' } }).toString());
const tokenCount = (timestamp, used) => JSON.stringify({ timestamp, type: 'event_msg', payload: { type: 'token_count', info: {},
  rate_limits: { primary: { used_percent: used, window_minutes: 300, resets_at: 100 }, secondary: { used_percent: 1, window_minutes: 10080, resets_at: 900 } } } });

const home = mkdtempSync(join(tmpdir(), 'harness-probe-'));
mkdirSync(join(home, '.claude'));
writeFileSync(join(home, '.claude', 'herdr-usage.json'), JSON.stringify({ updatedAt: 1, fiveHour: { used_percentage: 44, resets_at: 100 } }));
const day = (d, name, lines, mtime) => {
  const dir = join(home, '.codex', 'sessions', '2026', '11', d);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), lines.join('\n') + '\n');
  utimesSync(join(dir, name), mtime, mtime);
};
day('01', 'rollout-resumed.jsonl', [tokenCount('2026-11-01T10:00:00Z', 5), tokenCount('2026-11-03T20:00:00Z', 30)], 3000);
day('03', 'rollout-today.jsonl', [tokenCount('2026-11-03T09:00:00Z', 20), '{"type":"event_msg","payload":{"type":"agent_message"}}'], 2000);

const out = probe(home);
check('stats still there', typeof out.memory === 'number');
check("Claude's snapshot is read", out.usage?.claude?.fiveHour?.used_percentage === 44, JSON.stringify(out.usage?.claude));
check('Codex: the newest event, from a resumed session in an older day folder', out.usage?.codex?.primary?.used_percent === 30, JSON.stringify(out.usage?.codex));

const empty = probe(mkdtempSync(join(tmpdir(), 'harness-probe-empty-')));
check('no Claude or Codex: no usage, and the stats still report', JSON.stringify(empty.usage) === '{}' && typeof empty.memory === 'number', JSON.stringify(empty));
process.exit(failed ? 1 : 0);
