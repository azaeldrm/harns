import { pastSessions, pastRows, noteLinks, matchLinks, termKey, dayGroups, resumeArgv, parseListing, keepListing, sinceFor, openKey, listProgram, PAST_PER_MACHINE } from '../layouts/harns/mods/machine-sidebar/past-sessions.js';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

const now = new Date(2026, 10, 23, 15, 0).getTime();
const hours = h => now - h * 3600000;
const local = [
  { a: 'claude', id: 'c1', title: 'Fix the tile cache', cwd: 'C:\\code\\trailhead', at: hours(1), path: 'C:\\Users\\me\\.claude\\projects\\x\\c1.jsonl' },
  { a: 'opencode', id: 'o1', title: 'Refactor sync', cwd: 'C:\\code\\trailhead', at: hours(100), path: 'db#o1' },
];
const homelab = [
  { a: 'codex', id: 'x1', title: 'Elevation profile', cwd: '/srv/trailhead', at: hours(3), path: '/home/me/.codex/sessions/r-x1.jsonl' },
  { a: 'pi', id: 'p1', title: 'GPX importer tests', cwd: '/srv/trailhead', at: hours(20), path: '/home/me/.pi/agent/sessions/a/p1.jsonl' },
];
let kept = keepListing(null, null, local, now);
kept = keepListing(kept, 'homelab', homelab, now - 7200000);
const online = new Set(['@local', 'homelab']);

check('every machine in one list, the last written first, tagged by machine',
  pastSessions(kept, online, new Set()).map(s => [s.id, s.machine]), [['c1', null], ['x1', 'homelab'], ['p1', 'homelab'], ['o1', null]]);
check('a machine that can\'t be reached keeps its sessions, offline',
  pastSessions(kept, new Set(['@local']), new Set()).filter(s => s.offline).map(s => [s.id, s.seen]), [['x1', now - 7200000], ['p1', now - 7200000]]);
check('sessions open as agents are left out, however their path is spelt',
  pastSessions(kept, online, new Set([openKey(null, 'c:/users/me/.claude/projects/x/c1.jsonl')])).map(s => s.id), ['x1', 'p1', 'o1']);
check('the same log on another machine stays', pastSessions(kept, online, new Set([openKey('homelab', local[0].path)])).length, 4);
check('search looks in the title, folder, machine and harness, every word',
  ['tile', 'homelab gpx', 'opencode', 'srv', 'nothing here'].map(q => pastSessions(kept, online, new Set(), q).map(s => s.id)),
  [['c1'], ['p1'], ['o1'], ['x1', 'p1'], []]);
check('grouped under the day each was last written',
  dayGroups(pastSessions(kept, online, new Set()), now).map(g => [g.label, g.items.map(s => s.id)]),
  [['Today', ['c1', 'x1']], ['Yesterday', ['p1']], ['This week', ['o1']]]);
check('older than a week is Earlier', dayGroups([{ at: hours(24 * 9) }], now).map(g => g.label), ['Earlier']);
check('each harness reopens with its own resume command, as the machine starts it', [
  resumeArgv(local[0], [{ key: 'claude', run: ['claude', '--model', 'opus'] }]),
  resumeArgv(homelab[0], []),
  resumeArgv(homelab[1], [{ key: 'pi', run: ['pi'] }]),
  resumeArgv(local[1], null),
], [['claude', '--model', 'opus', '--resume', 'c1'], ['codex', 'resume', 'x1'], ['pi', '--session', homelab[1].path], ['opencode', '--session', 'o1']]);
check('a listing keeps only sessions it can reopen', parseListing(JSON.stringify([
  ...local, { a: 'cursor', id: 'z', cwd: '/', at: 1 }, { a: 'claude', id: 'n', at: 2 }, null,
])).map(s => s.id), ['c1', 'o1']);
check('output that isn\'t a list is no listing', [parseListing(''), parseListing('oops'), parseListing('{}')], [null, null, null]);
check('the lister runs from one line of plain characters', /^[\x20-\x7e]+$/.test(listProgram('aGVsbG8=')), true);

const M = 'homelab-compute', DIR = '/srv/code/murmur', T0 = now - 5 * 3600000;
const term = (id, created, parent = null, state = 'live') => ({ address: `${M}/${id}`, created_ms: created, cwd: DIR, parent: parent && `${M}/${parent}`, state, title: id });
const orchestrator = term('t1', T0), kids = ['t2', 't3', 't4'].map((id, i) => term(id, T0 + (i + 1) * 60000, 't1'));
const grandkid = term('t5', T0 + 300000, 't2');
const plain = term('t9', T0 + 30000);
const terms = [orchestrator, ...kids, grandkid, plain];
let links = noteLinks(null, terms, now);
check('a live terminal another one started is written down with it, and that parent too',
  Object.entries(links).map(([k, r]) => [k.split(':')[0], r.parent?.split(':')[0] ?? null]).sort(),
  [[`${M}/t1`, null], [`${M}/t2`, `${M}/t1`], [`${M}/t3`, `${M}/t1`], [`${M}/t4`, `${M}/t1`], [`${M}/t5`, `${M}/t2`]]);
check('nothing new, nothing written', noteLinks(links, terms, now), null);
check('links older than 30 days go', Object.keys(noteLinks(links, [], T0 + 31 * 86400000) ?? {}).length, 0);

const log = (id, start, at, title = id) => ({ a: 'claude', id, title, cwd: DIR, start, at, path: `/home/me/.claude/projects/m/${id}.jsonl` });
const sessions = [
  log('orch', T0 + 2000, now - 7200000, 'Murmur orchestrator'),
  log('k2', T0 + 61000, now - 7300000, 'impl-ingest'), log('k3', T0 + 122000, now - 7400000, 'impl-main'),
  log('k4', T0 + 183000, now - 7500000, 'review-0130'), log('k5', T0 + 302000, now - 7600000, 'ingest-proxy'),
  log('other', T0 + 400000, now - 3600000, 'LLM Benchmark'),
  log('elsewhere', T0 + 1000, now - 9000000, 'Same time, other folder'),
];
sessions.at(-1).cwd = '/srv/other';
const keptM = keepListing(null, M, sessions, now);
links = matchLinks(links, keptM, { [termKey(kids[2])]: { path: sessions[3].path } });
const pathOf = t => links[termKey(t)].path.split('/').at(-1);
check('each terminal finds its session: the one the chat read, else the one that started in its folder soonest after it',
  [orchestrator, ...kids, grandkid].map(pathOf), ['orch.jsonl', 'k2.jsonl', 'k3.jsonl', 'k4.jsonl', 'k5.jsonl']);
check('found once, nothing more to write', matchLinks(links, keptM, {}), null);
check('a session that started long after its terminal isn\'t its', matchLinks(noteLinks(null, [term('a', now - 3 * 3600000), term('b', T0 - 600000, 'a')], now), keptM, {})?.[`${M}/b:${T0 - 600000}`]?.path ?? null, null);

const onlineM = new Set(['@local', M]);
const openOf = (...ts) => new Set(ts.map(t => openKey(M, links[termKey(t)].path)));
const shape = rows => rows.map(r => r.kind === 'group'
  ? [r.head?.title ?? `live:${r.live.title}`, r.kids.map(s => s.title), r.running, r.opened]
  : r.s.title);

const allClosed = [orchestrator, ...kids, grandkid].map(t => ({ ...t, state: 'gone' }));
check('parent closed with all of them: one group, its sub-agents (and theirs) under it',
  shape(pastRows(keptM, onlineM, new Set(), links, allClosed)),
  ['LLM Benchmark', ['Murmur orchestrator', ['impl-ingest', 'impl-main', 'review-0130', 'ingest-proxy'], 0, false], 'Same time, other folder']);
check('a group sits where its newest session was last written', pastRows(keptM, onlineM, new Set(), links, allClosed)[1].at, now - 7200000);

const twoClosed = [orchestrator, kids[2], grandkid, { ...kids[0], state: 'gone' }, { ...kids[1], state: 'gone' }];
const running = pastRows(keptM, onlineM, openOf(orchestrator, kids[2], grandkid), links, twoClosed);
check('two sub-agents closed, parent running: grouped under the running parent, titled from its session',
  shape(running), ['LLM Benchmark', ['live:Murmur orchestrator', ['impl-ingest', 'impl-main'], 2, false], 'Same time, other folder']);
check('the running parent is shown by its terminal', running[1].live.address, `${M}/t1`);

const oneLeft = [{ ...orchestrator, state: 'gone' }, kids[2], ...[kids[0], kids[1], grandkid].map(t => ({ ...t, state: 'gone' }))];
check('parent closed, one sub-agent still running: it stays out, and the group counts it',
  shape(pastRows(keptM, onlineM, openOf(kids[2]), links, oneLeft)),
  ['LLM Benchmark', ['Murmur orchestrator', ['impl-ingest', 'impl-main', 'ingest-proxy'], 1, false], 'Same time, other folder']);

check('a parent not kept leaves its sub-agents on their own',
  shape(pastRows(keepListing(null, M, sessions.filter(s => s.id !== 'orch'), now), onlineM, new Set(), links, allClosed)).filter(r => typeof r === 'string').length, 6);
check('searching a sub-agent opens its group to just the matches', shape(pastRows(keptM, onlineM, new Set(), links, allClosed, 'ingest')),
  [['Murmur orchestrator', ['impl-ingest', 'ingest-proxy'], 0, true]]);
check('searching the parent keeps its group whole and folded', shape(pastRows(keptM, onlineM, new Set(), links, allClosed, 'orchestrator')),
  [['Murmur orchestrator', ['impl-ingest', 'impl-main', 'review-0130', 'ingest-proxy'], 0, false]]);
check('without links every session stands alone', pastRows(keptM, onlineM, new Set(), {}, []).every(r => r.kind === 'session'), true);
check('rows fall under their days', dayGroups(pastRows(keptM, onlineM, new Set(), links, allClosed), now).map(g => [g.label, g.items.length]), [['Today', 3]]);

if (failed) { console.log(`${failed} failed`); process.exit(1); }
