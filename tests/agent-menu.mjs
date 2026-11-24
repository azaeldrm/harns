import { menuItems, actionOf, machineOf, machineMenuItems, machineActionOf, homeTerminal } from '../layouts/harns/mods/machine-sidebar/agent-menu.js';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};
const ids = groups => groups.map(g => g.map(i => i.id));

check('an agent in its own tab gets the whole menu', ids(menuItems({ tab: 'tb1', folder: '/srv/code/murmur' })),
  [['chat', 'terminal', 'peek'], ['message', 'interrupt'], ['pin', 'rename', 'copy', 'new'], ['close']]);
check('a sub-agent gets peeking, talking and closing', ids(menuItems({ sub: true })), [['peek'], ['message', 'interrupt'], ['close']]);
check('without a tab or a folder those items go', ids(menuItems({})), [['chat', 'terminal', 'peek'], ['message', 'interrupt'], ['pin', 'new'], ['close']]);
check('a pinned agent offers to unpin', menuItems({ pinned: true })[2][0].label, 'Unpin');
check('closing is marked as dangerous', menuItems({}).at(-1).at(-1).danger, true);

const agent = { address: 'homelab-compute/t8d', name: 'Murmur orchestrator planning', tab: 'tb9' };
check('opening the chat focuses the agent and shows its chat', actionOf('chat', agent), { run: [['agent.focus', { terminal: 'homelab-compute/t8d' }]], view: 'chat-panel' });
check('opening the terminal shows its terminal', actionOf('terminal', agent).view, 'terminal-panel');
check('interrupting goes through hc', actionOf('interrupt', agent), { hc: ['interrupt', 'homelab-compute/t8d'] });
check('pinning flips the pin', [actionOf('pin', agent, { pinned: false }).pin, actionOf('pin', agent, { pinned: true }).pin], [true, false]);
check('a new session starts on its machine and folder', actionOf('new', agent, { folder: '/srv/code/murmur' }), { start: { machine: 'homelab-compute', folder: '/srv/code/murmur' } });
check('a local agent starts a new session on this computer', actionOf('new', { address: 't4d' }).start.machine, null);
check('closing an agent alone in its tab closes the tab, which asks', actionOf('close', agent, { tabPanes: 1 }), { run: [['tab.close', { id: 'tb9' }]] });
check('closing an agent sharing its tab asks, then ends it', actionOf('close', agent, { tabPanes: 2 }).confirm.command, { name: 'terminal.kill', args: { terminal: 'homelab-compute/t8d' } });
check('closing a sub-agent asks, then ends it', actionOf('close', { address: 'homelab-compute/t9m', name: 's5' }).confirm.title, 'Close s5?');
check('the machine an address names', [machineOf('homelab/t8d'), machineOf('t4d')], ['homelab', null]);

const remote = ['/srv/code/benchmarks', '/srv/code/murmur'];
check('a machine offers a new chat, a home terminal, then its folders', machineMenuItems({ folders: remote }).map(g => g.map(i => i.label)),
  [['New chat…', 'New terminal'], ['New terminal in', 'benchmarks', 'murmur']]);
check('the folders sit under a heading, each with its whole path', [machineMenuItems({ folders: remote })[1][0].heading, machineMenuItems({ folders: remote })[1][2].tip], [true, '/srv/code/murmur']);
check('this computer can browse for any other folder', machineMenuItems({ folders: ['C:\\Users\\Azael\\harns'], local: true })[1].map(i => i.label), ['New terminal in', 'harns', 'Browse…']);
check('at most 8 folders are listed', machineMenuItems({ folders: Array.from({ length: 12 }, (_, i) => `/f${i}`) })[1].length, 9);
check('a remote machine without folders has no folder list', machineMenuItems({}).length, 1);
check('a new chat opens the dialog on that machine', machineActionOf('chat', 'homelab'), { start: { machine: 'homelab' } });
check('New terminal starts in the home folder', machineActionOf('terminal', 'homelab'), { terminal: { machine: 'homelab', folder: null } });
check('a listed folder starts a terminal there', machineActionOf('f1', 'homelab', remote), { terminal: { machine: 'homelab', folder: '/srv/code/murmur' } });
check('the heading does nothing', machineActionOf('in', 'homelab', remote), null);
const spaces = [{ id: 's1', machine: null, active: true }, { id: 's2', machine: 'homelab' }, { id: 's3', machine: 'homelab', active: true }];
check('a home terminal opens as a tab in the machine\'s active space, in its home', homeTerminal('homelab', '/home/azael', spaces), ['tab.new', { space: 's3', folder: '/home/azael' }]);
check('with its home not known yet, a new space on it, which starts there', homeTerminal('homelab', null, spaces), ['space.new', { machine: 'homelab' }]);
check('a machine with no space gets a new one', homeTerminal('media', '/home/azael', spaces), ['space.new', { machine: 'media' }]);
check('this computer is the empty machine name', homeTerminal(null, null, []), ['space.new', { machine: '' }]);

if (failed) { console.log(`${failed} failed`); process.exit(1); }
