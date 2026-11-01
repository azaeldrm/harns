import { exec, machines, terminals, shared, setShared, window } from 'herdr';
import { contextProbe } from './context-probe.js';

export function refreshContext(view, cx) {
  view.contextPending ??= new Set();
  for (const machine of machines()) {
    const host = machine.name;
    const key = host ?? '@local';
    if (view.contextPending.has(key)) continue;
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
        const command = host === null && window()?.platform === 'windows' ? 'python' : 'python3';
        const result = await exec(command, ['-c', contextProbe], { on: host });
        publish(result.code === 0 ? JSON.parse(result.stdout) : {});
      } catch { publish({}); }
      finally { view.contextPending.delete(key); }
    });
  }
}
