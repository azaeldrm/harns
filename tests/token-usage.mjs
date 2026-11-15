import { readMachineUsage, dailyUsage, collectUsage, usageDays, usageDue, formatTokens, usagePlace, USAGE_EVERY } from '../layouts/harns/mods/machine-sidebar/token-usage.js';
import { execFile } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${detail}`}`); if (!ok) failed++; };

const home = mkdtempSync(join(tmpdir(), 'harns-usage-'));
const now = Date.now();
const iso = ms => new Date(ms).toISOString();
const hourOf = ms => String(Math.floor(ms / 900000) * 900);
const lines = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';

const claudeDir = join(home, '.claude', 'projects', '-work');
mkdirSync(join(claudeDir, 'sess', 'subagents'), { recursive: true });
const reply = (id, ms, u) => ({ type: 'assistant', requestId: `req-${id}`, timestamp: iso(ms), message: { id, role: 'assistant', usage: u } });
const u1 = { input_tokens: 10, output_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 50000 };
writeFileSync(join(claudeDir, 'sess.jsonl'), lines([reply('m1', now, u1), reply('m1', now, u1), reply('m2', now, { input_tokens: 5, output_tokens: 5 })]));
writeFileSync(join(claudeDir, 'resumed.jsonl'), lines([reply('m1', now, u1)]));
writeFileSync(join(claudeDir, 'sess', 'subagents', 'agent-a.jsonl'), lines([reply('s1', now, { input_tokens: 1, output_tokens: 2 })]));
writeFileSync(join(claudeDir, 'old.jsonl'), lines([reply('o1', now - 40 * 86400000, u1)]));

const day = new Date(now);
const codexDir = join(home, '.codex', 'sessions', String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
mkdirSync(codexDir, { recursive: true });
const count = (ms, input, cached, output) => ({ timestamp: iso(ms), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output } } } });
writeFileSync(join(codexDir, 'rollout-1.jsonl'), lines([count(now, 1000, 800, 50), count(now, 1000, 800, 50), count(now, 3000, 2500, 120)]));

const piDir = join(home, '.pi', 'agent', 'sessions', '--work--');
mkdirSync(piDir, { recursive: true });
writeFileSync(join(piDir, 's.jsonl'), lines([{ type: 'message', id: 'p1', timestamp: iso(now), message: { role: 'assistant', usage: { input: 7, output: 3, cacheRead: 900, cacheWrite: 20 } } }]));

const exec = (cmd, args) => new Promise(resolve => execFile(cmd, args, { env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: '', CODEX_HOME: '', XDG_DATA_HOME: join(home, 'nodata') }, maxBuffer: 1e7 },
  (e, stdout, stderr) => resolve({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, stdout, stderr })));

const read = await readMachineUsage(exec, null);
const h = hourOf(now);
check('Claude Code counts each reply once, across files and subagents', JSON.stringify(read.claude[h]) === JSON.stringify([1110 + 10 + 3, 50000]), JSON.stringify(read.claude));
check('Claude Code leaves out logs older than the window', Object.keys(read.claude).length === 1, JSON.stringify(read.claude));
check('Codex counts the growth of the running total, once per change', JSON.stringify(read.codex[h]) === JSON.stringify([500 + 120, 2500]), JSON.stringify(read.codex));
check('Pi counts input, output and cache writes as fresh', JSON.stringify(read.pi[h]) === JSON.stringify([30, 900]), JSON.stringify(read.pi));
check('OpenCode without a database reads as nothing', JSON.stringify(read.opencode) === '{}', JSON.stringify(read.opencode));
const cacheFile = join(home, '.cache', 'harns', 'token-usage.json');
check('the probe keeps what it read in its cache', existsSync(cacheFile) && Object.keys(JSON.parse(readFileSync(cacheFile, 'utf8')).files).length === 6);
const again = await readMachineUsage(exec, null);
check('a second reading from the cache gives the same hours', JSON.stringify(again) === JSON.stringify(read));

const days = dailyUsage({ a: { claude: { [h]: [100, 1000] } }, b: { claude: { [h]: [50, 0] }, codex: { [h]: [25, 5] } } }, now, 14);
check('two weeks of days, oldest first, today last', days.length === 14 && days[13].today && !days[0].today && days[0].start < days[13].start);
check('machines and harnesses add up into today', days[13].fresh === 175 && days[13].cached === 1005 && days[13].harnesses.claude.fresh === 150 && days[13].harnesses.codex.fresh === 25, JSON.stringify(days[13]));
const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
const edges = dailyUsage({ a: { claude: { [hourOf(midnight.getTime() - 900000)]: [1, 0], [hourOf(midnight.getTime())]: [10, 0] } } }, now);
check('days split at local midnight', edges[12].fresh === 1 && edges[13].fresh === 10, JSON.stringify(edges.slice(-2).map(d => d.fresh)));
check('hours outside the days are left out', dailyUsage({ a: { claude: { [hourOf(now - 30 * 86400000)]: [9, 9] } } }, now).every(d => d.fresh === 0));

const machines = [{ name: null, layout: 'ready' }, { name: 'box', layout: 'ready' }, { name: 'away', layout: 'unavailable' }];
const previous = { hours: { box: { claude: { 1: [1, 0] } }, away: { claude: { 2: [2, 0] } } }, errors: {}, at: 0 };
const got = await collectUsage(machines, async host => { if (host === 'box') throw new Error('No Python answered'); return { claude: {} }; }, previous, 123);
check('every connected machine is read', '@local' in got.hours && got.at === 123);
check('a machine that fails keeps its last hours and says why', JSON.stringify(got.hours.box) === JSON.stringify(previous.hours.box) && got.errors.box === 'No Python answered');
check('an unavailable machine keeps its last hours', JSON.stringify(got.hours.away) === JSON.stringify(previous.hours.away));

check('due when never read', usageDue(null, machines, now));
check('not due right after a reading', !usageDue({ at: now, hours: { '@local': {}, box: {} }, errors: {} }, machines.slice(0, 2), now));
check('due once the interval has passed', usageDue({ at: now - USAGE_EVERY, hours: {}, errors: {} }, [], now));
check('due when a machine comes online unread', usageDue({ at: now, hours: { '@local': {} }, errors: {} }, machines.slice(0, 2), now));

const state = { at: 1, hours: { a: { claude: { [hourOf(now)]: [5, 0] } } } };
const memo = usageDays(state, null, now);
check('usage days come from the reading', memo.days?.at(-1).fresh === 5);
check('usage days are kept while the reading and the day stay the same', usageDays(state, memo, now) === memo);
check('usage days are worked out again for a new reading', usageDays({ ...state, at: 2 }, memo, now) !== memo);
check('no usage days before the first reading', usageDays(undefined, memo, now).days === null);
check('formats counts the way the sidebar holds them', [0, 950, 46000, 2812641, 12000000, 1.6e9].map(formatTokens).join(' ') === '0 950 46K 2.8M 12M 1.6B');
check('usage defaults to the Strip', usagePlace(undefined) === 'strip' && usagePlace('footer') === 'footer' && usagePlace('off') === 'strip');

process.exit(failed ? 1 : 0);
