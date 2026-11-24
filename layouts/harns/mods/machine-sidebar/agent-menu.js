/** The machine an agent's address names ("homelab/t8d"), or null for this computer ("t4d"). */
export const machineOf = address => address.includes("/") ? address.split("/")[0] : null;

/**
 * The right-click menu of an agent in the sidebar, as groups of items ({ id, label, glyph, keys?, danger? }): getting to
 * it, talking to it, organising it and closing it. A sub-agent (`sub`), which has no tab of its own, gets only
 * peeking, talking and closing. `pinned`, `tab` (its tab's id) and `folder` (its working folder) decide the rest.
 */
export function menuItems({ sub = false, pinned = false, tab = null, folder = null } = {}) {
  const talk = [
    { id: "message", label: "Send a message…", glyph: "arrow-up" },
    { id: "interrupt", label: "Interrupt", glyph: "stop", keys: "Esc" },
  ];
  const close = { id: "close", label: "Close session…", glyph: "x", danger: true };
  if (sub) return [[{ id: "peek", label: "Peek", glyph: "zoom" }], talk, [close]];
  return [
    [
      { id: "chat", label: "Open chat", glyph: "message" },
      { id: "terminal", label: "Open terminal", glyph: "terminal" },
      { id: "peek", label: "Peek", glyph: "zoom" },
    ],
    talk,
    [
      { id: "pin", label: pinned ? "Unpin" : "Pin to top", glyph: pinned ? "pin-off" : "pin" },
      ...(tab ? [{ id: "rename", label: "Rename…", glyph: "square-pen" }] : []),
      ...(folder ? [{ id: "copy", label: "Copy folder path", glyph: "copy" }] : []),
      { id: "new", label: "New session here", glyph: "plus" },
    ],
    [close],
  ];
}

/**
 * What choosing an item does to an agent ({ address, name, tab }), as a plan the sidebar carries out: herdr commands
 * to run (`run`), the work view to show after (`view`: its chat or terminal panel), hc
 * arguments (`hc`), the message box to open (`form`), a pin to set (`pin`), text to copy (`copy`), the quick new
 * session dialog (`start`: its machine and folder), or a question before closing (`confirm`). Closing a tab the agent
 * has to itself closes the tab, which asks first; an agent sharing its tab, or a sub-agent, ends after the question.
 */
export function actionOf(id, agent, { pinned = false, tabPanes = 0, folder = null } = {}) {
  const terminal = agent.address, focus = ["agent.focus", { terminal }];
  switch (id) {
    case "chat": return { run: [focus], view: "chat-panel" };
    case "terminal": return { run: [focus], view: "terminal-panel" };
    case "peek": return { run: [["terminal.peek", { terminal }]] };
    case "message": return { form: "message" };
    case "interrupt": return { hc: ["interrupt", terminal] };
    case "pin": return { pin: !pinned };
    case "rename": return { run: [["tab.rename", { id: agent.tab }]] };
    case "copy": return { copy: folder };
    case "new": return { start: { machine: machineOf(terminal), folder } };
    case "close": return agent.tab && tabPanes === 1
      ? { run: [["tab.close", { id: agent.tab }]] }
      : { confirm: { title: `Close ${agent.name || "this session"}?`, detail: "Ends the agent and its sub-agents.", command: { name: "terminal.kill", args: { terminal } } } };
    default: return null;
  }
}

/** A folder's last part, as the menu names it ("/srv/code/murmur" is "murmur"). */
const lastPart = folder => folder.split(/[\\/]/).filter(Boolean).pop() || folder;

/**
 * The right-click menu of a machine's band, in place of its old + button: a new chat (the new session dialog on it)
 * and a terminal in its home folder, then a terminal in one of its folders (`folders`: the ones open there and the
 * ones remembered, at most 8, under a heading), and on this computer (`local`), whose folders herdr's picker can
 * browse, Browse… for any other.
 */
export function machineMenuItems({ folders = [], local = false } = {}) {
  const picks = [
    ...folders.slice(0, 8).map((folder, i) => ({ id: `f${i}`, label: lastPart(folder), glyph: "folder", tip: folder })),
    ...(local ? [{ id: "pick", label: "Browse…", glyph: "search" }] : []),
  ];
  return [
    [{ id: "chat", label: "New chat…", glyph: "message" }, { id: "terminal", label: "New terminal", glyph: "terminal" }],
    ...(picks.length ? [[{ id: "in", label: "New terminal in", heading: true }, ...picks]] : []),
  ];
}

/**
 * What choosing a machine menu item does on `machine` (its name, null for this computer): `start` opens the new
 * session dialog there, `terminal` starts a plain terminal in a folder (null: its home folder), `pick` asks for a
 * folder first.
 */
export function machineActionOf(id, machine, folders = []) {
  if (id === "chat") return { start: { machine } };
  if (id === "terminal") return { terminal: { machine, folder: null } };
  if (id === "pick") return { pick: { machine } };
  const n = /^f(\d+)$/.exec(id)?.[1];
  return n != null && folders[Number(n)] ? { terminal: { machine, folder: folders[Number(n)] } } : null;
}

/**
 * The herdr command for a plain terminal in a machine's home folder (`home`, null while unknown): a tab in its active
 * space, else its first, starting in `home`; with no space there, or no home known, a new space on it, which herdr
 * starts in the machine's home. A tab can't be left to its default, which is the focused terminal's folder, on
 * whichever machine that is.
 */
export function homeTerminal(machine, home, spaces) {
  const here = spaces.filter(s => (s.machine ?? null) === machine);
  const space = here.find(s => s.active) ?? here[0];
  return space && home ? ["tab.new", { space: space.id, folder: home }] : ["space.new", { machine: machine ?? "" }];
}
