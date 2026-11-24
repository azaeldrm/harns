/**
 * The sidebar's localStorage key keeping each machine's last list of sessions, as { machine key: { at, limit, v, items } }:
 * the list it shows at once, and what a refresh fills in for the logs not written since.
 */
export const PAST_STORE = "past";

/** How many sessions each machine lists, and how many the list shows before "Show more", which adds as many again. */
export const PAST_PER_MACHINE = 100;
export const PAST_SHOWN = 50;

/** The shape of what a machine's list holds, raised when past_sessions.py starts giving more, so lists are read anew. */
const PAST_VERSION = 2;

/** The key a machine's sessions are kept under: its name, or `@local` for this computer. */
export const pastKey = machine => machine ?? "@local";

/** How each harness reopens a session: the arguments after its program, from the session's id or log. */
const RESUME = {
  claude: s => ["--resume", s.id],
  codex: s => ["resume", s.id],
  pi: s => ["--session", s.path],
  opencode: s => ["--session", s.id],
};

/** The harnesses Past sessions lists, by the program key herdr gives each, with the name people know it by. */
export const PAST_HARNESSES = { claude: "Claude Code", codex: "Codex", pi: "Pi", opencode: "OpenCode" };

/**
 * The `python3 -c` program that runs past_sessions.py's source (`source`, base64 of its UTF-8 text) on a machine, kept
 * to one line of plain characters so any shell carries it.
 */
export const listProgram = source => `import base64;exec(compile(base64.b64decode('${source}').decode('utf-8'),'past_sessions.py','exec'))`;

/**
 * A machine's list as past_sessions.py printed it, or null when the output isn't a list: the sessions it can reopen,
 * and the logs not written since the last read as { path, at } alone.
 */
export function parseListing(stdout) {
  try {
    const items = JSON.parse(String(stdout ?? "").trim() || "null");
    if (!Array.isArray(items)) return null;
    return items.filter(s => s && Number.isFinite(s.at) && (s.a ? RESUME[s.a] && s.id && s.cwd : s.path));
  } catch {
    return null;
  }
}

/**
 * How a session's log is told apart from every other machine's: the machine key and the log's path, its separators and
 * case evened out, as both the chat's reader and past_sessions.py may spell a Windows path either way.
 */
export const openKey = (machine, path) => `${pastKey(machine)}|${String(path ?? "").replace(/\\/g, "/").toLowerCase()}`;

/**
 * Where `machine`'s next read starts (past_sessions.py's `since`): the newest log time already kept from it, in that
 * machine's own clock, so logs written at or after it are read again; 0, reading everything, when nothing is kept or it
 * was kept under another limit or shape.
 */
export function sinceFor(kept, machine) {
  const entry = kept?.[pastKey(machine)];
  const current = entry?.limit === PAST_PER_MACHINE && entry.v === PAST_VERSION;
  return current && entry.items?.length ? Math.max(...entry.items.map(s => s.at)) : 0;
}

/**
 * `kept` (the PAST_STORE value) with `items` (parseListing's) as `machine`'s list, read at `at`: a log given alone
 * takes what was kept for it, with its new time, or goes when nothing was (a log without anything to show); the newest
 * PAST_PER_MACHINE are kept.
 */
export function keepListing(kept, machine, items, at) {
  const before = new Map((kept?.[pastKey(machine)]?.items ?? []).map(s => [s.path, s]));
  const list = items.map(s => s.a ? s : before.has(s.path) ? { ...before.get(s.path), at: s.at } : null).filter(Boolean)
    .sort((x, y) => y.at - x.at).slice(0, PAST_PER_MACHINE);
  return { ...(kept ?? {}), [pastKey(machine)]: { at, limit: PAST_PER_MACHINE, v: PAST_VERSION, items: list } };
}

/**
 * Every machine's kept sessions in one list, the last written first, each tagged with its `machine` (null for this
 * computer) and `offline` when that machine can't be reached now: `online` says which keys can. Sessions open as agents
 * now (`open`, a set of their openKey) are left out, and so are those not matching `query`, which looks in
 * the title, folder, machine and harness.
 */
export function pastSessions(kept, online, open, query = "") {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const all = Object.entries(kept ?? {}).flatMap(([key, entry]) => (entry?.items ?? []).map(s => ({
    ...s, machine: key === "@local" ? null : key, offline: !online.has(key), seen: entry.at,
  })));
  return all
    .filter(s => !open.has(openKey(s.machine, s.path)))
    .filter(s => {
      const text = [s.title, s.cwd, s.machine ?? "", PAST_HARNESSES[s.a]].join(" ").toLowerCase();
      return words.every(w => text.includes(w));
    })
    .sort((x, y) => y.at - x.at);
}

/** The sidebar's localStorage key keeping which terminal started which (LINKS), by terminal: see noteLinks. */
export const LINKS_STORE = "past.links";

/** How long a terminal's link is kept, and how soon after its terminal started a session must start to be its. */
const LINK_DAYS = 30;
const MATCH_AFTER = 120000, MATCH_BEFORE = 5000;

/** A terminal's key: its address and when it started, as the chat's `herdr-chat.paths` keys it. */
export const termKey = t => `${t.address}:${t.created_ms}`;

/** The machine an address is on: the part before its slash, or null for this computer. */
const machineOf = address => String(address).includes("/") ? String(address).split("/")[0] : null;

/** Two folders are the same apart from their separators, a trailing one and case. */
const sameDir = (a, b) => String(a ?? "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() === String(b ?? "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/**
 * `links` (the LINKS_STORE value, { terminal key: { m, cwd, created, parent, path? } }) with every live terminal another
 * one started (hc's `parent`) written down, and that parent too, so the sessions keep their nesting once the terminals
 * are gone; links older than LINK_DAYS go. `terms` is herdr's terminals(). Null when nothing changes.
 */
export function noteLinks(links, terms, now) {
  const next = { ...(links ?? {}) };
  let changed = false;
  const live = new Map(terms.filter(t => t.state === "live").map(t => [t.address, t]));
  const note = t => ({ m: machineOf(t.address), cwd: t.cwd, created: t.created_ms, parent: null });
  for (const t of live.values()) {
    const parent = t.parent && live.get(t.parent);
    if (!parent) continue;
    const kid = termKey(t), up = termKey(parent);
    if (!next[up]) { next[up] = note(parent); changed = true; }
    if (next[kid]?.parent !== up) { next[kid] = { ...(next[kid] ?? note(t)), parent: up }; changed = true; }
  }
  for (const [k, r] of Object.entries(next)) if (now - r.created > LINK_DAYS * 86400000) { delete next[k]; changed = true; }
  return changed ? next : null;
}

/**
 * `links` with each terminal's session log found: the one the chat read for it (`known`, the `herdr-chat.paths` value,
 * by terminal key), else the session kept from its machine that started in its folder soonest after it, within
 * MATCH_AFTER, and isn't another terminal's. Null when nothing changes.
 */
export function matchLinks(links, kept, known) {
  const next = { ...(links ?? {}) };
  let changed = false;
  const taken = new Set(Object.values(next).filter(r => r.path).map(r => openKey(r.m, r.path)));
  for (const [k, r] of Object.entries(next)) {
    const exact = known?.[k]?.path;
    if (exact && exact !== r.path) { next[k] = { ...r, path: exact }; taken.add(openKey(r.m, exact)); changed = true; continue; }
    if (r.path) continue;
    const found = (kept?.[pastKey(r.m)]?.items ?? [])
      .filter(s => Number.isFinite(s.start) && sameDir(s.cwd, r.cwd) && s.start >= r.created - MATCH_BEFORE && s.start <= r.created + MATCH_AFTER)
      .filter(s => !taken.has(openKey(r.m, s.path)))
      .sort((x, y) => Math.abs(x.start - r.created) - Math.abs(y.start - r.created))[0];
    if (found) { next[k] = { ...r, path: found.path }; taken.add(openKey(r.m, found.path)); changed = true; }
  }
  return changed ? next : null;
}

/** Whether session `s` matches every word of a search: in its title, folder, machine or harness. */
const matches = (s, words) => {
  const text = [s.title, s.cwd, s.machine ?? "", PAST_HARNESSES[s.a]].join(" ").toLowerCase();
  return words.every(w => text.includes(w));
};

/**
 * Past sessions' rows, the last written first: each session on its own ({ kind: "session", s, at }), except sub-agents
 * (by `links`, see noteLinks), which go under the session that started them, or the one that started that, as one
 * group ({ kind: "group", key, head, live, kids, running, at, opened }). `head` is that session when it's closed; while
 * it runs, `live` is its terminal ({ address, title }) instead, titled from its kept session; when it's neither (not
 * kept), its sub-agents stand alone. `running` counts its sub-agents still live, and `at` is the latest of them all.
 * Searching keeps a group whose head matches whole and folded, and one where only sub-agents match with just those,
 * opened (`opened`). `terms` is herdr's terminals(); `kept`, `online` and `open` are as for pastSessions.
 */
export function pastRows(kept, online, open, links, terms, query = "") {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const closed = pastSessions(kept, online, open);
  const records = links ?? {};
  const byLog = new Map(Object.entries(records).filter(([, r]) => r.path).map(([k, r]) => [openKey(r.m, r.path), k]));
  const root = k => { const seen = new Set(); while (records[k]?.parent && records[records[k].parent] && !seen.has(k)) { seen.add(k); k = records[k].parent; } return k; };
  const live = new Map(terms.filter(t => t.state === "live").map(t => [termKey(t), t]));
  const groups = new Map();
  const group = key => {
    if (!groups.has(key)) groups.set(key, { kind: "group", key, head: null, live: null, kids: [], running: 0, at: 0, opened: false });
    return groups.get(key);
  };
  for (const [k, r] of Object.entries(records)) if (r.parent && live.has(k)) group(root(k)).running++;
  const rows = [], solo = [];
  for (const s of closed) {
    const k = byLog.get(openKey(s.machine, s.path));
    if (k && records[k].parent) group(root(k)).kids.push(s);
    else solo.push({ s, k });
  }
  for (const { s, k } of solo) {
    const g = k && groups.get(k);
    if (g?.kids.length) g.head = s;
    else rows.push({ kind: "session", s, at: s.at });
  }
  for (const [key, g] of groups) {
    if (!g.kids.length) continue;
    const term = live.get(key);
    if (!g.head && term) {
      const r = records[key], own = r?.path && Object.values(kept ?? {}).flatMap(e => e?.items ?? []).find(s => sameDir(s.path, r.path));
      g.live = { address: term.address, title: own?.title || term.title || term.name || term.address, a: own?.a, machine: machineOf(term.address), cwd: r?.cwd };
    }
    if (!g.head && !g.live) { rows.push(...g.kids.map(s => ({ kind: "session", s, at: s.at }))); continue; }
    g.at = Math.max(g.head?.at ?? 0, ...g.kids.map(s => s.at));
    rows.push(g);
  }
  return rows.flatMap(r => {
    if (r.kind === "session") return matches(r.s, words) ? [{ kind: "session", s: r.s, at: r.at }] : [];
    if (matches(r.head ?? { title: r.live.title, cwd: r.live.cwd, machine: r.live.machine, a: r.live.a }, words)) return [r];
    const kids = r.kids.filter(s => matches(s, words));
    return kids.length ? [{ ...r, kids, opened: true }] : [];
  }).sort((x, y) => y.at - x.at);
}

/** Midnight before `ms`, in local time. */
const dayStart = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/**
 * `sessions` (or pastRows' rows, newest first) under the day they were last written (`at`), by `now`: Today,
 * Yesterday, This week (the last 7 days), then Earlier. Only days with sessions are given, as [{ label, items }].
 */
export function dayGroups(sessions, now) {
  const today = dayStart(now), DAY = 86400000;
  const label = at => at >= today ? "Today" : at >= today - DAY ? "Yesterday" : at >= today - 6 * DAY ? "This week" : "Earlier";
  const groups = [];
  for (const s of sessions) {
    const l = label(s.at);
    if (groups.at(-1)?.label !== l) groups.push({ label: l, items: [] });
    groups.at(-1).items.push(s);
  }
  return groups;
}

/**
 * The command that reopens session `s`: the program as `known` (that machine's knownAgents()) starts it, its own
 * arguments kept, then the harness's resume arguments; the bare program when it isn't known there.
 */
export function resumeArgv(s, known) {
  const base = (known ?? []).find(k => k.key === s.a)?.run;
  return [...(base?.length ? base : [s.a]), ...RESUME[s.a](s)];
}
