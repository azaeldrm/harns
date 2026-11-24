/** Two paths name the same folder when they match apart from a trailing separator. */
const same = (a, b) => String(a ?? "").replace(/[\\/]+$/, "") === String(b ?? "").replace(/[\\/]+$/, "");

/** Whether pane `p` (an entry of panes(), which names its tab) is in space `s` (an entry of spaces()). */
const inSpace = (p, s) => (s.tabs ?? []).some(t => t.id === p.tab);

/** The shared state key that keeps the folders Home remembers, as { machine key: [folder, newest first] }. */
export const KEPT_FOLDERS = "harness.home.folders";

/** How many folders Home remembers on each machine. */
export const KEPT_PER_MACHINE = 8;

/** The key a machine's remembered folders are kept under: its name, or `@local` for this computer. */
export const machineKey = machine => machine ?? "@local";

/** `folders` without repeats, the first of each kept. */
const unique = folders => folders.filter((f, i) => folders.findIndex(g => same(g, f)) === i);

/**
 * The folders open on `machine` (null for this computer) right now, most likely first: the focused terminal's folder,
 * then the active space's terminals, then every other terminal and space there. `spaces` and `panes` are herdr's
 * spaces() and panes().
 */
export function openFolders(machine, spaces, panes) {
  const here = spaces.filter(s => (s.machine ?? null) === machine);
  const mine = panes.filter(p => p.cwd && here.some(s => inSpace(p, s)));
  const active = here.find(s => s.active);
  return unique([
    ...mine.filter(p => p.focused).map(p => p.cwd),
    ...mine.filter(p => active && inSpace(p, active)).map(p => p.cwd),
    ...(active?.folder ? [active.folder] : []),
    ...mine.map(p => p.cwd),
    ...here.map(s => s.folder).filter(Boolean),
  ]);
}

/**
 * The folders Home offers on `machine`: the ones open there now, then the ones remembered in `kept` (the shared
 * KEPT_FOLDERS value), so a machine with nothing open still offers where work happened before.
 */
export function folderChoices(machine, spaces, panes, kept) {
  return unique([...openFolders(machine, spaces, panes), ...(kept?.[machineKey(machine)] ?? [])]);
}

/**
 * `kept` with `folders` remembered on `machine`, at most KEPT_PER_MACHINE; null when nothing changes, so a caller
 * writes shared state only when there's something new. A folder already remembered keeps its place, unless `front` (a
 * folder someone just started in) moves it first. Past the limit the oldest folder not among `folders` goes, so the
 * folders open now all stay and remembering them again changes nothing.
 */
export function remember(kept, machine, folders, front = false) {
  const key = machineKey(machine);
  const before = kept?.[key] ?? [];
  const added = unique(folders.filter(Boolean)).slice(0, KEPT_PER_MACHINE);
  const adding = f => added.some(g => same(g, f));
  const after = unique(front ? [...added, ...before] : [...added.filter(f => !before.some(g => same(g, f))), ...before]);
  while (after.length > KEPT_PER_MACHINE) {
    let old = after.length - 1;
    while (old >= 0 && adding(after[old])) old--;
    after.splice(old === -1 ? after.length - 1 : old, 1);
  }
  if (after.length === before.length && after.every((f, i) => f === before[i])) return null;
  return { ...(kept ?? {}), [key]: after };
}

/**
 * The herdr command Home runs to start `agent` (a knownAgents() entry, or null for a plain terminal) in `folder` on
 * `machine`, with `task` as its first message: a tab in the space already there (the active one first) when a space
 * on that machine has a terminal in that folder or was made there, else a new space. Returns [command, args].
 */
export function startCommand({ machine, folder, agent, task }, spaces, panes) {
  const here = spaces.filter(s => (s.machine ?? null) === machine);
  const holds = s => same(s.folder, folder) || panes.some(p => inSpace(p, s) && same(p.cwd, folder));
  const space = folder ? (here.find(s => s.active && holds(s)) ?? here.find(holds)) : here.find(s => s.active);
  const args = {};
  if (folder) args.folder = folder;
  if (agent?.run) args.argv = agent.run;
  if (agent?.run && task) args.task = task;
  return space ? ["tab.new", { space: space.id, ...args }] : ["space.new", { machine: machine ?? "", ...args }];
}

/**
 * Where Home starts when shown at `stamp`: the place `where` (HOME_WHERE) asked for then, or null for the active
 * space.
 */
export const homeStart = (where, stamp) => where && where.at === stamp ? { machine: where.machine ?? null, folder: where.folder ?? null } : null;
