import { shared, terminals } from 'herdr';

/**
 * What agent-chat found of an agent's session (its shared 'herdr-chat.paths', by address and start): { path, hint, cwd
 * }, or null.
 */
export function sessionOf(address, all = terminals()) {
  const t = all.find(x => x.address === address);
  return t ? (shared('herdr-chat.paths') ?? {})[`${address}:${t.created_ms}`] ?? null : null;
}

/**
 * The folder an agent works in: its session's, as its log says (a session resumed from another folder), else its
 * pane's.
 */
export function agentFolder(a, pane, all) {
  return sessionOf(a.address, all)?.cwd ?? pane?.cwd ?? null;
}
