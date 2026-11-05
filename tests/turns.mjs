// Which machines to read after a look at herdr's agent list (mods/machine-stats/turns.js).
//   node tests/turns.mjs
import { look, changedHosts, machinesChanged, hostOf, endedApps } from '../mods/machine-stats/turns.js';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};
const ready = [{ name: null, layout: 'ready' }, { name: 'homelab', layout: 'ready' }];
const at = (list, machines = ready) => look(list.map(([address, status]) => ({ address, status })), machines);
const hosts = (before, now) => [...changedHosts(before, now)].sort();

check('addresses name their machine', [hostOf('t5'), hostOf('homelab/t5')], [null, 'homelab']);
check('the first look reads every ready machine', hosts(null, at([['t1', 'working']], [...ready, { name: 'off', layout: 'unavailable' }])), [null, 'homelab'].sort());
const before = at([['t1', 'working'], ['homelab/t5', 'working'], ['homelab/t6', 'idle']]);
check('nothing changed: nothing to read', hosts(before, before), []);
check('a turn ends on homelab: read homelab only', hosts(before, at([['t1', 'working'], ['homelab/t5', 'done'], ['homelab/t6', 'idle']])), ['homelab']);
check('still working, or done turning idle: no read', hosts(before, at([['t1', 'working'], ['homelab/t5', 'working'], ['homelab/t6', 'done']])), []);
check('an agent starts on this computer', hosts(before, at([['t1', 'working'], ['t2', 'idle'], ['homelab/t5', 'working'], ['homelab/t6', 'idle']])), [null]);
check('an agent goes away on homelab', hosts(before, at([['t1', 'working'], ['homelab/t5', 'working']])), ['homelab']);
check('a machine comes online', hosts(at([['t1', 'working']], [{ name: null, layout: 'ready' }, { name: 'homelab', layout: 'loading' }]), at([['t1', 'working']])), ['homelab']);
check('machine states: unchanged, then one lost', [machinesChanged(before, before), machinesChanged(before, at([], [{ name: null, layout: 'ready' }, { name: 'homelab', layout: 'unavailable' }]))], [false, true]);
const agent = (address, status, app) => ({ address, status, app });
const working = look([agent('t1', 'working', 'claude-code'), agent('h/t2', 'working', 'codex'), agent('t3', 'working', 'pi'), agent('t4', 'idle', 'codex')], []);
const later = look([agent('t1', 'done', 'claude-code'), agent('h/t2', 'working', 'codex'), agent('t3', 'blocked', 'pi'), agent('t4', 'idle', 'codex')], []);
check('the apps of agents that stopped working, and only theirs', [...endedApps(working, later)].sort(), ['claude-code', 'pi']);
check('a first look ends no turns', endedApps(null, later).size, 0);
process.exit(failed ? 1 : 0);
