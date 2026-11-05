import { exec, hc, home, machines, agents, terminals, shared, setShared } from 'herdr';
import { readdir, readFile } from 'fs/promises';
import { hostOf } from './turns.js';
import { contextProbe } from './context-probe.js';
import { newestSnapshots } from './snapshots.js';

/**
 * Reads the context of every machine's agents, or of `only`'s (a machine's name, null for this
 * computer), and publishes it in shared `agents.context`: Claude's and Pi's from their relays'
 * snapshots (this computer's read directly, readLocal; another machine's with the relay's
 * collect(), run there), Codex's from the "Context N% left" its footer shows (codexFooter). Footers are read
 * only with `footers` (after a turn ends: a footer changes then and only then); otherwise each
 * Codex terminal keeps its last. A read asked for a machine while one runs there runs again after it.
 */
export function refreshContext(view, cx, only, { footers = true } = {}) {
  view.contextPending ??= new Set();
  view.contextAgain ??= new Set();
  view.footersDue ??= new Set();
  view.codexContext ??= {};
  for (const machine of machines()) {
    const host = machine.name;
    if (only !== undefined && host !== only) continue;
    const key = host ?? '@local';
    if (footers) view.footersDue.add(key);
    if (view.contextPending.has(key)) { view.contextAgain.add(key); continue; }
    const publish = values => {
      const all = { ...(shared('agents.context') ?? {}) };
      for (const address of Object.keys(all)) {
        const owner = address.includes('/') ? address.split('/')[0] : null;
        if (owner === host) delete all[address];
      }
      for (const [id, snapshot] of Object.entries(values)) {
        const address = host ? `${host}/${id}` : id;
        const terminal = terminals().find(t => t.address === address && t.state === 'live');
        if (!terminal || snapshot.updatedAt * 1000 < (terminal.created_ms ?? 0)) continue;
        if (Number.isFinite(snapshot.percent)) all[address] = snapshot;
      }
      setShared('agents.context', all);
    };
    if (machine.layout !== 'ready') { publish({}); continue; }
    view.contextPending.add(key);
    cx.spawn(async cx => {
      try {
        let values = {};
        if (host === null) values = await readLocal();
        else {
          const result = await exec('python3', ['-c', contextProbe], { on: host });
          values = result.code === 0 ? JSON.parse(result.stdout) : {};
        }
        const codex = agents().filter(a => a.app === 'codex' && hostOf(a.address) === host);
        if (view.footersDue.delete(key)) {
          for (const a of codex) {
            const left = await codexFooter(a.address);
            if (left != null) view.codexContext[a.address] = { percent: 100 - left, updatedAt: Date.now() / 1000 };
            else delete view.codexContext[a.address];
          }
        }
        for (const a of codex) if (view.codexContext[a.address]) values[a.address.split('/').at(-1)] = view.codexContext[a.address];
        publish(values);
      } catch { publish({}); }
      finally {
        view.contextPending.delete(key);
        if (view.contextAgain.delete(key)) refreshContext(view, cx, host, { footers: false });
      }
    });
  }
}

/**
 * The context a Codex terminal's footer says is left, in percent ("Context 77% left"), or null when
 * its footer doesn't show it: Codex's status line shows it when `context-remaining` is one of its
 * `tui.status_line` items.
 */
export async function codexFooter(address) {
  try {
    const r = await hc(['read', address, '--lines', '4']);
    const found = r.code === 0 ? [...r.stdout.matchAll(/Context (\d+(?:\.\d+)?)% left/g)].at(-1) : null;
    return found ? Number(found[1]) : null;
  } catch { return null; }
}

/** This computer's snapshots, read from their folder without starting a process. */
export async function readLocal() {
  const sep = home().includes('\\') ? '\\' : '/';
  const dir = [home(), '.config', 'harness', 'context'].join(sep);
  let names;
  try { names = await readdir(dir); } catch { return {}; }
  const texts = await Promise.all(names.filter(n => n.endsWith('.json')).map(n => readFile(dir + sep + n, 'utf8').catch(() => '')));
  return newestSnapshots(texts);
}
