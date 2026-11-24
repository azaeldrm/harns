import { folderChoices, startCommand, remember, KEPT_PER_MACHINE, homeStart } from '../layouts/harns/mods/machine-sidebar/home-plan.js';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

const spaces = [
  { id: 's1', machine: null, folder: 'C:\\Users\\me', active: true, tabs: [{ id: 'tb1' }, { id: 'tb2' }] },
  { id: 's2', machine: 'homelab', folder: '/srv/docker', active: false, tabs: [{ id: 'homelab/tb1' }] },
  { id: 's3', machine: 'homelab', folder: '/srv/murmur', active: false, tabs: [] },
];
const panes = [
  { tab: 'tb1', cwd: 'C:\\Users\\me\\harns', focused: true },
  { tab: 'tb2', cwd: 'C:\\Users\\me\\notes\\', focused: false },
  { tab: 'homelab/tb1', cwd: '/srv/docker/app', focused: false },
];
const claude = { name: 'Claude Code', run: ['claude'] };

check('this computer: the focused folder, then the active space, each once',
  folderChoices(null, spaces, panes), ['C:\\Users\\me\\harns', 'C:\\Users\\me\\notes\\', 'C:\\Users\\me']);
check('another machine: its terminals, then its spaces',
  folderChoices('homelab', spaces, panes), ['/srv/docker/app', '/srv/docker', '/srv/murmur']);
check('a machine with no spaces offers nothing', folderChoices('homelab-media', spaces, panes), []);

check('a folder a space already holds: a tab there, the text as the first message',
  startCommand({ machine: null, folder: 'C:\\Users\\me\\notes', agent: claude, task: 'fix it' }, spaces, panes),
  ['tab.new', { space: 's1', folder: 'C:\\Users\\me\\notes', argv: ['claude'], task: 'fix it' }]);
check('a folder no space holds: a new space on that machine',
  startCommand({ machine: 'homelab', folder: '/srv/new', agent: claude, task: '' }, spaces, panes),
  ['space.new', { machine: 'homelab', folder: '/srv/new', argv: ['claude'] }]);
check('the space a machine folder was made in',
  startCommand({ machine: 'homelab', folder: '/srv/murmur', agent: claude, task: 'go' }, spaces, panes),
  ['tab.new', { space: 's3', folder: '/srv/murmur', argv: ['claude'], task: 'go' }]);
check('a plain terminal gets no task',
  startCommand({ machine: null, folder: 'C:\\Users\\me', agent: null, task: 'ignored' }, spaces, panes),
  ['tab.new', { space: 's1', folder: 'C:\\Users\\me' }]);
check('this computer is machine "" for a new space',
  startCommand({ machine: null, folder: 'D:\\other', agent: claude, task: '' }, spaces, panes)[1].machine, '');

const kept = { 'homelab-media': ['/srv/media', '/srv/jellyfin'], homelab: ['/srv/old', '/srv/docker/'] };
check('a machine with nothing open offers what it remembers',
  folderChoices('homelab-media', spaces, panes, kept), ['/srv/media', '/srv/jellyfin']);
check('remembered folders follow the open ones, without repeats',
  folderChoices('homelab', spaces, panes, kept), ['/srv/docker/app', '/srv/docker', '/srv/murmur', '/srv/old']);

check('this computer is kept as @local', remember({}, null, ['C:\\a']), { '@local': ['C:\\a'] });
check('new folders go first, the others keep their place',
  remember(kept, 'homelab-media', ['/srv/media', '/srv/new'])['homelab-media'], ['/srv/new', '/srv/media', '/srv/jellyfin']);
check('nothing new: nothing to write', remember(kept, 'homelab-media', ['/srv/jellyfin', '/srv/media/']), null);
check('a folder started in moves first', remember(kept, 'homelab-media', ['/srv/jellyfin'], true)['homelab-media'],
  ['/srv/jellyfin', '/srv/media']);
check('other machines are left as they were', remember(kept, 'homelab-media', ['/x'])['homelab'], kept.homelab);

const many = Array.from({ length: 12 }, (_, i) => `/w/${i}`);
const full = remember({ m: ['/old/a', '/old/b'] }, 'm', many);
check('past the limit the oldest go', full.m.length, KEPT_PER_MACHINE);
check('remembering the same open folders again changes nothing', remember(full, 'm', many), null);
const shifted = remember(full, 'm', ['/w/11', ...many.slice(0, 7)]);
check('a newly open folder stays and the open ones are kept', shifted && shifted.m.includes('/w/11') && many.slice(0, 7).every(f => shifted.m.includes(f)), true);
check('and then it settles', remember(shifted, 'm', ['/w/11', ...many.slice(0, 7)]), null);

check('Home starts where a menu asked, when that was this showing', homeStart({ at: 5, machine: 'homelab', folder: '/srv' }, 5), { machine: 'homelab', folder: '/srv' });
check('an older request is ignored, for the active space', homeStart({ at: 4, machine: 'homelab', folder: null }, 5), null);
check('this computer is null', homeStart({ at: 5, machine: null }, 5), { machine: null, folder: null });
check('no request means the active space', homeStart(null, 5), null);

if (failed) { console.log(`${failed} failed`); process.exit(1); }
