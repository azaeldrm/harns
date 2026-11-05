/**
 * What changed on each machine between two looks at herdr's agent list (which herdr-core keeps
 * current): reading a machine's context and usage files is worth it only after one of its agents
 * finished a turn, appeared or went away, or the machine itself came online. No herdr imports:
 * tested alone (tests/turns.mjs). Copied into machine-agents and workspace-status-machine.
 */

/** The machine an agent's address belongs to: "homelab/t5" is on homelab, "t5" on this one (null). */
export const hostOf = address => address.includes('/') ? address.split('/')[0] : null;

/** One look: each agent's status and app by address, and each machine's state by name ('' for this one). */
export function look(agents, machines) {
  return {
    agents: new Map(agents.map(a => [a.address, a.status])),
    apps: new Map(agents.map(a => [a.address, a.app ?? null])),
    machines: new Map(machines.map(m => [m.name ?? '', m.layout])),
  };
}

/** The apps ("claude-code", "codex", "pi", …) of the agents that stopped working since the `before` look. */
export function endedApps(before, now) {
  const apps = new Set();
  if (!before) return apps;
  for (const [address, status] of now.agents) {
    if (before.agents.get(address) === 'working' && status !== 'working') apps.add(now.apps?.get(address) ?? null);
  }
  return apps;
}

/** Whether any machine's state changed since the `before` look (connected, lost, loading). */
export function machinesChanged(before, now) {
  if (!before || before.machines.size !== now.machines.size) return true;
  for (const [name, layout] of now.machines) if (before.machines.get(name) !== layout) return true;
  return false;
}

/**
 * The machines (null for this one) to read again since the `before` look: one of their agents
 * stopped working, appeared or went away, or they became ready. A first look (no `before`)
 * names every ready machine.
 */
export function changedHosts(before, now) {
  const hosts = new Set();
  for (const [name, layout] of now.machines) {
    if (layout === 'ready' && (!before || before.machines.get(name) !== 'ready')) hosts.add(name || null);
  }
  if (!before) return hosts;
  for (const [address, status] of now.agents) {
    const was = before.agents.get(address);
    if (was === undefined || (was === 'working' && status !== 'working')) hosts.add(hostOf(address));
  }
  for (const address of before.agents.keys()) if (!now.agents.has(address)) hosts.add(hostOf(address));
  return hosts;
}
