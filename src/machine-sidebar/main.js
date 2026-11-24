import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, Popup, ScrollHandle, Textarea, TextareaState } from "gpui-base";
import { machines, agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, nextCommand, openOverlay, closeOverlay, props, layout, hc, notify, home, watchFolder, exec, pickFolder, knownAgents, appHome } from "herdr";
import { readFile } from "fs/promises";

import { machineMetrics } from "./machine-metrics.js";
import { refreshContext } from "./context.js";
import { machineDetails } from "./details.js";
import { osOf } from "./os.js";
import { look, changedHosts, machinesChanged } from "./turns.js";
import { agentFolder, sessionOf } from "./sessions.js";
import { PAST_STORE, LINKS_STORE, PAST_PER_MACHINE, PAST_SHOWN, PAST_HARNESSES, pastKey, openKey, listProgram, parseListing, keepListing, sinceFor, pastSessions, pastRows, noteLinks, matchLinks, dayGroups, resumeArgv } from "./past-sessions.js";
import { base64Utf8, python } from "./python.js";
import { menuItems, actionOf, machineMenuItems, machineActionOf, homeTerminal } from "./agent-menu.js";
import { Home } from "./home.js";
import { showHome, showWork, atHome } from "./open-home.js";
import { KEPT_FOLDERS, folderChoices, openFolders, remember, startCommand } from "./home-plan.js";
import { find, narrow } from "./layout.js";
import { sessionTitle } from "./session-title.js";
import { folderName } from "./paths.js";
import { alertColors, rangeColor, brandIcons, monochrome } from "./tones.js";
import { OrbPool, orbsOn, workState } from "./orbs.js";
import { collectUsage, readMachineUsage, usageDays, usageDue, usagePlace } from "./token-usage.js";
import { usageDetails, usageRailMark, usageStrip } from "./usage-card.js";
import { contextText, healthBars, healthFill } from "./context-bar.js";

/** How far the work area's window sits from the sidebar (the layout's padding there), where the details cards line up. */
const WORK_INSET = 12;

/** The title colour of an agent or sub-agent at work, in Monochrome. */
const WHITE = "#ffffff";

/** The shared state key holding each remote machine's home folder, learnt once, for its menu's New terminal. */
const MACHINE_HOMES = "harness.machine.homes";

const localMachineLabel = () => shared("machine.local-label") ?? "This computer";
const statsFor = (machine, t) => machineMetrics(machine, false, t);
const classic = () => ["classic", "contained"].includes(shared("harness.sidebar"));
/** Hex color a laid over b at share (0 to 1), as one solid color; b when either isn't a 6-digit hex. */
const mix = (a, b, share) => {
  const rgb = c => /^#[0-9a-f]{6}/i.test(c ?? "") ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : null;
  const [x, y] = [rgb(a), rgb(b)];
  if (!x || !y) return b;
  return "#" + x.map((v, i) => Math.round(v * share + y[i] * (1 - share)).toString(16).padStart(2, "0")).join("");
};
const treeColor = t => mix(t.dim, t.surface, 0.4);
/**
 * A tree's lines in a row at x px, starting from px above it: on down past the row, and an elbow reach px into it
 * elbowAt px down.
 */
const treeLines = (t, x, elbowAt, down, elbow, from = 0, reach = 9) => {
  const color = treeColor(t);
  return [
    ...(down ? [div().absolute().left(x).top(from).bottom(0).w(1).bg(color)] : []),
    ...(elbow ? [div().absolute().left(x).top(from).w(reach).h(elbowAt - from).overflow_hidden()
      .child(div().absolute().left(0).bottom(0).w(2 * reach).h(Math.max(elbowAt - from, 2 * reach)).border_l(1).border_b(1).border_color(color).rounded_bl(reach))] : []),
  ];
};
/**
 * One of a machine's agents or terminals, its rows hung from the machine's icon, 19 px in: the line at 18 and its
 * elbow reaching the row at 28.
 */
const underMachine = (t, rows, last, elbowAt) => {
  return rows.map((r, i) => v_flex().relative().w_full().flex_none().pl(28).child(r)
    .children(treeLines(t, 18, elbowAt, !last, i === 0, 0, 10)));
};

/**
 * The context window as harns's Settings chose: filling with what's used, coloured along the theme's range (tones.js),
 * or as the health bar draining to what's left (`healthFill`, shared with the chat's meter). Its track is the tree lines'
 * gray, a step above a selected or hovered card, so it stays visible on either.
 */
function contextBar(t, used, width, height = 3) {
  const { share, color } = healthFill(t, used) ?? { share: used, color: rangeColor(t, used / 100) };
  return div().w(width).h(height).flex_none().rounded_full().bg(treeColor(t))
    .when(share > 0, el => el.child(div().h_full().rounded_full().w(Math.max(2, Math.round(width * share / 100))).bg(color)));
}

function lead(tab, all = panes()) {
  const mine = all.filter(p => p.tab === tab.id && p.terminal);
  return mine.find(p => p.program?.agent) ?? mine.find(p => p.focused) ?? mine[0];
}

const paneBranch = a => panes().find(p => p.pane === a.pane)?.branch ?? spaces().find(s => s.id === a.space)?.branch ?? null;
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
/** A sub-agent without a pane isn't in agents(): its raw word, error counting as blocked. */
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/** The agent's icon from the app's program table: a one-color glyph or a picture. */
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.icon.endsWith('.svg') && !brandIcons(theme(), p) ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

const HOP_MS = 700, FEET = 8.8 / 12;
const HALO = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/**
 * A program's logo set on the bot: a one-color glyph sits on a halo of itself in the row's color (copies nudged 1 px
 * every way), which hides the bot behind it and fills the glyph's small gaps, shaped like the logo; a picture, which
 * can't be recolored, sits on a disc of that color. Its box is the logo plus 1 px all round.
 */
function badgeOf(p, size, color, ring) {
  if (!p?.icon) return null;
  if (!p.icon.endsWith('.svg') || brandIcons(theme(), p)) return div().p(1).rounded_full().bg(ring).child(image(p.icon).w(size).h(size).flex_none());
  return haloed(p.icon, size, color, ring);
}

/** A one-color glyph on a halo of itself in the row's color: copies nudged 1 px every way, under it. */
function haloed(src, size, color, ring) {
  const glyph = (dx, dy, c) => svg(src).size(size).flex_none().text_color(c).absolute().left(1 + dx).top(1 + dy);
  return div().relative().size(size + 2).flex_none()
    .children(HALO.map(([dx, dy]) => glyph(dx, dy, ring)))
    .child(glyph(0, 0, color));
}

/**
 * The agent icon (a sub-agent's: the same bot without its antenna), with its program's icon small at its bottom right
 * on a halo of the row's color (badgeOf). `hop` (working; its own place in its hops, { n, up, go, ripple }, from
 * hopFor): that logo hops in amber from side to side over the bot, its halo masking the bot as it passes, a ripple
 * spreading where it lands. `orb` (Monochrome, from orbFor) stands in for the bot; the program's icon stays on it only
 * where it's given (the rail), as a full card shows it in its bottom line, before the folder, and a sub-agent's row
 * beside its name.
 */
function agentPic(t, p, size, color, ring, sub = false, hop = false, tint = null, corner = null, orb = null) {
  const bot = svg(`mods/machine-sidebar/icons/${sub ? "bot-small" : "bot"}.svg`).size(size).flex_none().text_color(color);
  const badge = badgeOf(p, Math.round(size * 0.65), hop ? t.working : tint ?? color, ring);
  const mark = corner === "ask" ? ["mods/machine-sidebar/icons/question.svg", t.blocked]
    : corner === "done" ? ["mods/machine-sidebar/icons/circle-check.svg", alertColors(t).done] : null;
  const cornerMark = () => haloed(mark[0], Math.round(size * 0.6), mark[1], ring).absolute().right(-5).top(-3);
  if (orb) return div().relative().size(size).mr(2).flex_none()
    .child(div().absolute().left((size - 20) / 2).top((size - 20) / 2).child(orb))
    .when(Boolean(badge), el => el.child(badge.absolute().right(-5).bottom(-4)))
    .when(Boolean(mark), el => el.child(cornerMark()));
  if (!hop || !badge) return div().relative().size(size).flex_none().child(bot)
    .when(Boolean(badge), el => el.child(badge.absolute().right(-5).bottom(-4)))
    .when(Boolean(mark), el => el.child(cornerMark()));
  const box = Math.round(size * 0.65) + 2, rest = size + 5 - box;
  return div().relative().size(size).flex_none().child(bot)
    .children(hopParts(t, badge, box, size + 6 - box, [rest - 2, rest + 3], size / 16, hop));
}

/**
 * A logo hopping between lefts a and b at `top` (its box `box` px), with its ripple, for a relative parent. The view's
 * beat (hopTick) drives it, each step a native transition: across to the other side over one hop at an even pace
 * while it rises (slowing) and falls (speeding up), so it traces a round arc. Every landing starts a fresh ripple ring
 * there, spreading and fading, so ring and landing stay together however long it runs. Each ring is a new element,
 * named by its logo's address and the beat it landed on (`ripple`): herdr keeps an element's last state by its id,
 * so a ring that reused an older one's id, or another logo's landing on the same beat, would animate from that.
 */
function hopParts(t, badge, box, top, [a, b], scale, hop) {
  const to = hop.n % 2 ? b : a, landed = hop.n % 2 ? a : b, ground = top + box * FEET;
  const w = (hop.go ? 16 : 5) * scale, h = (hop.go ? 4 : 1.4) * scale, policy = { duration: 480, easing: "ease-out" };
  return [
    ...(hop.n > 0 ? [svg("mods/machine-sidebar/icons/ripple.svg").id(`ripple-${hop.ripple}`).absolute().left(landed + box / 2 - w / 2)
      .top(ground - h / 2).w(w).h(h).text_color(t.working).opacity(hop.go ? 0 : 0.9)
      .transition("width", policy).transition("height", policy).transition("left", policy).transition("top", policy).transition("opacity", policy)] : []),
    div().absolute().top(top).left(to).transition("left", { duration: HOP_MS, easing: "linear" })
      .child(badge.relative().top(hop.up ? -4 : 0).transition("top", { duration: HOP_MS / 2, easing: hop.up ? "ease-out" : "ease-in" })),
  ];
}

const READ_AFTER = [1000, 4000];

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.loginBar) return;
    if (props()?.agentMenu || props()?.machineMenu) return;
    if (props()?.agentMessage) { this.initMessage(cx); return; }
    if (props()?.home) {
      this.menu = new Home();
      this.menu.init(cx, { form: "space", icons: "mods/machine-sidebar/icons", onStart: () => closeOverlay(props().overlay) });
      return;
    }
    this.orbs = new OrbPool(cx, "machine-sidebar", 32);
    this.folded = new Set();
    this.past = { open: false, shown: PAST_SHOWN, read: 0, busy: new Set(), unfolded: new Set() };
    try { this.pastLinks = JSON.parse(localStorage.getItem(LINKS_STORE) ?? "{}"); } catch { this.pastLinks = {}; }
    try { this.pastKept = JSON.parse(localStorage.getItem(PAST_STORE) ?? "{}"); } catch { this.pastKept = {}; }
    this.pastQuery = TextareaState.new({ placeholder: "Search past sessions", rows: 1 });
    this.pastQuery.on("change", (_e, cx) => { this.past.shown = PAST_SHOWN; cx.notify(); });
    this.hosts = {};
    this.retrying = {};
    this.refreshHosts(cx);
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    this.pins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    this.order = JSON.parse(localStorage.getItem("order") ?? "[]");
    this.drag = null; this.drop = null;
    this.machineOrder = JSON.parse(localStorage.getItem("machines.order") ?? "[]");
    this.mdrag = null; this.mdrop = null;
    this.scrollY = 0; this.viewH = 0; this.rowsH = 0;
    try { this.osIcons = JSON.parse(localStorage.getItem("os") ?? "{}"); } catch { this.osIcons = {}; }
    this.osAsked = {};
    this.osConfirmed = new Set();
    this.scrollHandle = ScrollHandle.new();
    this.scrollHandle.scroll_to_item(0);
    this.hop = { beat: 0, go: true };
    this.hopFrom = new Map();
    this.hopSeen = new Set();
    cx.timer.every(HOP_MS / 2, (cx) => this.hopTick(cx));
    cx.timer.every(1000, (cx) => {
      this.noticeOs(cx);
      this.noticeTurns(cx);
      if (this.detailsWanted && Date.now() < this.detailsWanted.until) this.readDetails(this.detailsWanted.name, cx);
      this.readUsage(cx);
      this.notePastLinks();
      const live = new Set(agents().map(a => a.address)), gone = [...(this.past.live ?? [])].some(a => !live.has(a));
      this.past.live = live;
      if (this.past.open && (gone || Date.now() - this.past.read > 30000)) this.readPast(cx);
      cx.notify();
    });
    this.noticeTurns(cx);
    this.watchLocalContext(cx);
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        if (c === "next-machine") this.jumpMachine(1);
        else if (c === "prev-machine") this.jumpMachine(-1);
      }
    });
  }

  /**
   * Reads every connected machine's token usage into shared `usage.tokens` when it's due (see `usageDue`), one reading
   * at a time.
   */
  readUsage(cx) {
    if (this.usageBusy) return;
    const state = shared("usage.tokens");
    const list = machines();
    if (!usageDue(state, list)) return;
    this.usageBusy = true;
    cx.spawn(async cx => {
      try { setShared("usage.tokens", await collectUsage(list, host => readMachineUsage(exec, host), state)); }
      finally { this.usageBusy = false; cx.notify(); }
    });
  }

  /**
   * Usage at the bottom of the sidebar: open, the Strip (today's tokens over two weeks of columns) when harns's settings
   * put it here; on the rail, always, as five small columns over today's tokens, since the rail's footer has no room.
   * Resting on either hangs the two-week card right against the sidebar, as a machine's band does.
   */
  usageRow(t, collapsed) {
    const key = "usage";
    const state = shared("usage.tokens");
    const days = (this.usageMemo = usageDays(state, this.usageMemo)).days;
    return div().id("usage-trig").relative().w_full().flex_none().pt(4).pb(6)
      .when(collapsed, el => el.flex().justify_center())
      .when(!collapsed, el => el.px(8))
      .on_hover((on, cx) => { if (on) this.detailsEnter(key, cx); else { if (this.muted === key) this.muted = null; this.detailsLeave(key, cx); } })
      .child((collapsed ? usageRailMark : usageStrip)(t, days, { icon: "mods/machine-sidebar/icons/coins.svg" }))
      .child(this.hang(key, usageDetails(t, days, { icon: "mods/machine-sidebar/icons/coins.svg", errors: state?.errors }), 0));
  }

  /**
   * Shows the top agent of the next machine (dir 1) or the previous one (-1) that has agents, in the list's order,
   * from the machine of the agent or terminal in front; past the last it comes round to the first.
   */
  jumpMachine(dir) {
    const listed = this.machineTops ?? [];
    if (!listed.length) return;
    const f = focused(), list = agents();
    const shown = f?.terminal ?? f?.agent ?? list.find(a => a.tab === f?.tab && a.space === f?.space)?.address
      ?? list.find(a => a.focused)?.address ?? "";
    const here = shown.includes("/") ? shown.split("/")[0] : "";
    const at = listed.findIndex(m => m.machine === here);
    const next = at < 0 ? (dir > 0 ? 0 : listed.length - 1) : (at + dir + listed.length) % listed.length;
    if (next !== at) run("agent.focus", { terminal: listed[next].top });
  }

  /**
   * Asks each machine that answers what it runs, once a run (the icon kept from the last run shows until it answers);
   * one that couldn't say is asked again a minute later.
   */
  noticeOs(cx) {
    for (const m of machines()) {
      const key = m.name ?? "";
      if (this.osConfirmed.has(key) || Date.now() - (this.osAsked[key] ?? 0) < 60000 || (m.name && m.layout !== "ready")) continue;
      this.osAsked[key] = Date.now();
      cx.spawn(async (cx) => {
        const os = await osOf(m.name ?? null);
        if (!os) return;
        this.osConfirmed.add(key);
        this.osIcons[key] = os;
        try { localStorage.setItem("os", JSON.stringify(this.osIcons)); } catch {}
        cx.notify();
      });
    }
  }

  /** Its system's icon once known, else a drive (another machine) or a screen (this computer). */
  machineIcon(machine) {
    const os = this.osIcons?.[machine?.name ?? ""];
    return os ? `mods/machine-sidebar/os/${os}.svg` : `mods/machine-sidebar/icons/${machine?.name ? "hard-drive" : "monitor"}.svg`;
  }

  /**
   * Half a hop: for each logo, a landing that starts its next hop, or the top of its arc. Nothing to draw while no
   * logo hops. Logos that stopped hopping since the last beat are forgotten. When one lands, its ripple is drawn small
   * and let go to spread on the next frame (30 ms on); a beat where none lands needs no second frame.
   */
  hopTick(cx) {
    for (const address of this.hopFrom.keys()) if (!this.hopSeen.has(address)) this.hopFrom.delete(address);
    if (!this.hopping) return;
    const h = this.hop;
    h.beat++;
    const lands = [...this.hopFrom.values()].some(from => (h.beat - from) % 2 === 0);
    h.go = !lands;
    cx.notify();
    if (lands) cx.timer.after(30, (cx) => { h.go = true; cx.notify(); });
  }

  /**
   * A working logo's place in its own hops ({ n, up, go, ripple } for agentPic): counted from the beat it was first
   * drawn working on, rising on its even beats (each landing starts a hop) and falling on its odd ones.
   * `ripple` names its latest landing's ring: its address, so two logos landing on one beat don't share a ring, and
   * the shared beat of that landing, since its own count starts again at 0 each time it starts working.
   */
  hopFor(address) {
    if (!this.hopFrom.has(address)) this.hopFrom.set(address, this.hop.beat);
    this.hopSeen.add(address);
    const from = this.hopFrom.get(address), k = this.hop.beat - from, up = k % 2 === 0, n = Math.floor(k / 2);
    return { n, up, go: up ? this.hop.go : true, ripple: `${address}-${from + 2 * n}` };
  }

  /**
   * A machine's band in Tree, with the start of its agents' line: from its icon (under the disc) down through the band
   * and its 2 px margin to the first agent's elbow. Drawn before the band, so the band's hover covers it there.
   */
  treeTop(t, g, collapsed, band) {
    const hangs = !collapsed && !this.folded.has(g.id) && (g.members.length > 0 || this.plainTerminals(g.machine).length > 0);
    return div().relative().w_full().flex_none().pb(2)
      .when(hangs, el => el.child(div().absolute().left(18).top(19).bottom(0).w(1).bg(treeColor(t))))
      .child(band);
  }

  /**
   * The icon a machine's header shows, open or on the rail: in Classic its system's, in Tree a server or this laptop.
   */
  headerIcon(machine) {
    return classic() ? this.machineIcon(machine) : `mods/machine-sidebar/icons/${machine?.name ? "server" : "laptop"}.svg`;
  }

  /** Once a second: reads the context of machines where a turn ended, an agent came or went, or that came online. */
  noticeTurns(cx) {
    const now = look(agents(), machines());
    const first = !this.seen;
    if (!first && machinesChanged(this.seen, now)) this.refreshHosts(cx);
    this.due ??= [];
    for (const host of changedHosts(this.seen, now)) {
      if (first) refreshContext(this, cx, host);
      else for (const ms of READ_AFTER) this.due.push({ host, at: Date.now() + ms });
    }
    this.seen = now;
    const ready = this.due.filter(d => d.at <= Date.now());
    this.due = this.due.filter(d => d.at > Date.now());
    for (const host of new Set(ready.map(d => d.host))) refreshContext(this, cx, host);
  }

  /** Reads this computer's context each time its relays write a snapshot. */
  watchLocalContext(cx) {
    const sep = home().includes("\\") ? "\\" : "/";
    const dir = [home(), ".config", "harness", "context"].join(sep);
    cx.spawn(async cx => {
      for (;;) {
        try { await watchFolder(dir); } catch { return; }
        refreshContext(this, cx, null, { footers: false });
      }
    });
  }

  /**
   * Stamps agents whose state changed; one that finished or started needing you, or is new, goes to the top of the
   * order.
   */
  track(list, now) {
    let dirty = false;
    const seeding = this.order.length === 0;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (seeding) { this.order.push(a.address); continue; }
      const was = this.changed[a.address]?.s;
      if (!this.order.includes(a.address) || (was !== s && (s === "blocked" || (s === "idle" && was === "working")))) this.toTop(a.address);
    }
    if (seeding && list.length) localStorage.setItem("order", JSON.stringify(this.order));
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    const kept = this.order.filter(k => listed.has(k) || this.changed[k]);
    if (kept.length !== this.order.length) { this.order = kept; localStorage.setItem("order", JSON.stringify(kept)); }
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  /** Reads a hovered machine's details now (if over 3 s old) and keeps them fresh for a while. */
  wantDetails(name, cx) {
    this.detailsWanted = { name, until: Date.now() + 30000 };
    this.readDetails(name, cx);
  }

  readDetails(name, cx) {
    const key = name ?? "@local";
    this.details ??= {};
    if (this.detailsBusy?.[key] || Date.now() - (this.details[key]?.at ?? 0) < 3000) return;
    (this.detailsBusy ??= {})[key] = true;
    cx.spawn(async cx => {
      try { this.details[key] = { ...(await machineDetails(name)), at: Date.now() }; }
      finally { this.detailsBusy[key] = false; cx.notify(); }
    });
  }

  detailsEnter(key, cx) {
    const OPEN_AFTER = 900, LIVE = 400;
    this.hot = key;
    if (this.muted === key) return;
    this.detailsTimer?.cancel();
    if (this.detailsKey || Date.now() - (this.detailsClosed ?? 0) < LIVE) { this.detailsKey = key; cx.notify(); return; }
    this.detailsTimer = cx.timer.after(OPEN_AFTER, cx => { if (this.hot === key && !this.drag?.moved && !this.mdrag?.moved) { this.detailsKey = key; cx.notify(); } });
  }

  /** Closes a little after the pointer has left both the row and its card. */
  detailsLeave(key, cx) {
    if (this.hot === key) this.hot = null;
    cx.timer.after(150, cx => {
      if (this.detailsKey !== key || this.hot === key || this.overCard === key) return;
      this.detailsKey = null; this.detailsClosed = Date.now(); cx.notify();
    });
  }

  /**
   * The card, hung from the row's top-right corner (the row must be relative), while it's the one up: `edge` px
   * further (the row's distance from the sidebar's edge) and then WORK_INSET, so the card lines up with the work
   * area's window beside the sidebar.
   */
  hang(key, card, edge = 8) {
    return Popup.new(`details-${key}`, div()).absolute().top(-1).right(-1).size(1)
      .when(this.detailsKey === key && !this.drag?.moved && !this.mdrag?.moved, pop => pop.content(div().id(`details-hover-${key}`).pl(edge + WORK_INSET)
        .on_hover((on, cx) => { if (on) this.overCard = key; else { if (this.overCard === key) this.overCard = null; this.detailsLeave(key, cx); } })
        .child(card)));
  }

  /**
   * A machine's band (its header, and in Classic its rings); resting on it shows its details beside the sidebar, level
   * with it.
   */
  machineCard(t, machine, trigger, edge = 8) {
    const key = `m:${machine.name ?? "@local"}`;
    return div().id(`mtrig-${key}`).relative().w_full()
      .on_hover((on, cx) => {
        if (on) { this.wantDetails(machine.name, cx); this.detailsEnter(key, cx); }
        else { if (this.muted === key) this.muted = null; this.detailsLeave(key, cx); }
      })
      .when(machine.layout === "ready", el => el.on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        this.detailsTimer?.cancel();
        this.muted = key;
        this.detailsKey = null;
        cx.notify();
        this.learnHome(machine.name ?? null, cx);
        openOverlay({ mod: "machine-sidebar", kind: "popup", at: "pointer", width: 250, height: this.machineMenuHeight(machine.name ?? null),
          props: { machineMenu: machine.name ?? "@local" } });
      }))
      .child(trigger)
      .child(this.hang(key, this.detailsCard(t, machine), edge));
  }

  /**
   * A grid: each section a title (icon, name), then rows of label | bar | value in fixed columns, so every bar and
   * value lines up.
   */
  detailsCard(t, machine) {
    const key = machine.name ?? "@local";
    const d = this.details?.[key];
    const s = (shared("machine.stats") ?? {})[key];
    const fresh = s && !s.error && Date.now() - s.at <= 15000;
    const GB = 1024 ** 3;
    const gb = b => b == null ? "?" : (b / GB >= 100 ? Math.round(b / GB) : (b / GB).toFixed(1));
    const ok = v => Number.isFinite(v);
    const { warn: WARN, crit: CRIT } = alertColors(t);
    const level = (v, warn, crit) => v >= crit ? CRIT : v >= warn ? WARN : t.accent;
    const BAR = 148, LABEL = 44, VALUE = 90;
    const row = (label, fill, color, value) => h_flex().w_full().pl(18).gap(8).items_center().h(18)
      .child(div().w(LABEL).flex_none().text_size(11).text_color(t.dim).child(label))
      .child(div().w(BAR).h(4).flex_none().rounded_full().bg(t.border)
        .child(div().h_full().rounded_full().w(ok(fill) ? Math.max(2, Math.round(BAR * Math.max(0, Math.min(100, fill)) / 100)) : 0).bg(color)))
      .child(h_flex().w(VALUE).flex_none().justify_end().text_size(11).text_color(color === t.accent ? t.muted : color).child(value));
    const pct = v => ok(v) ? `${Math.round(v)}%` : "\u2013";
    const usage = (label, v, size) => row(label, v, ok(v) ? level(v, 80, 95) : t.dim, size ?? pct(v));
    const temp = c => ok(c) ? row("Temp", c, level(c, 70, 85), `${Math.round(c)}\u00b0C`) : null;
    const section = (icon, title, ...rows) => v_flex().w_full().gap(3)
      .child(h_flex().w_full().gap(6).items_center()
        .child(svg(`mods/machine-sidebar/stats/${icon}.svg`).size(12).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(title)))
      .children(rows.filter(Boolean));
    const note = text => div().pl(18).text_size(11).text_color(t.dim).truncate().child(text);
    const up = sec => { if (!ok(sec)) return ""; const m = Math.floor(sec / 60), h = Math.floor(m / 60), dd = Math.floor(h / 24); return dd ? `up ${dd}d ${h % 24}h` : h ? `up ${h}h ${m % 60}m` : `up ${m}m`; };
    const card = v_flex().w(340).p(12).gap(10).rounded(10).border_1().border_color(t.border).bg(t.surface).text_size(12).shadow_md()
      .child(h_flex().gap(10).items_center()
        .child(svg(this.machineIcon(machine)).size(26).flex_none().text_color(t.muted))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().text_size(13.5).font_semibold().text_color(t.foreground).child(machine.name || localMachineLabel()))
          .when(Boolean(d && !d.error), el => el.child(div().text_size(11).text_color(t.dim).truncate().child([d.os, up(d.uptime)].filter(Boolean).join(" \u00b7 "))))));
    if (!d) return card.child(div().text_color(t.dim).child("Reading details\u2026"));
    if (d.error) return card.child(div().text_color(t.dim).child(d.error));
    const used = d.memory.total && d.memory.available != null ? d.memory.total - d.memory.available : null;
    const memPct = fresh && ok(s.memory) ? s.memory : used != null ? 100 * used / d.memory.total : null;
    const memUsed = used ?? (ok(memPct) && d.memory.total ? d.memory.total * memPct / 100 : null);
    return card
      .child(section("cpu", d.cpu.model || "CPU",
        usage("Load", fresh ? s.cpu : null),
        temp(d.cpu.temp),
        note([d.cpu.cores && `${d.cpu.cores} cores`, d.cpu.threads && `${d.cpu.threads} threads`, d.load && `load ${d.load.map(x => x?.toFixed(2)).join(" ")}`].filter(Boolean).join(" \u00b7 "))))
      .child(section("ram", "Memory", usage("Used", memPct, `${gb(memUsed)} / ${gb(d.memory.total)} GB`)))
      .children(d.gpus.filter(g => g.load != null || g.temp != null || g.memTotal).map(g => section("gpu", g.name,
        ok(g.load) ? usage("Load", g.load) : null,
        g.memTotal ? usage("VRAM", 100 * g.memUsed / g.memTotal, `${gb(g.memUsed)} / ${gb(g.memTotal)} GB`) : null,
        temp(g.temp),
        ok(g.power) ? row("Power", g.powerLimit ? 100 * g.power / g.powerLimit : null, g.powerLimit ? level(100 * g.power / g.powerLimit, 85, 98) : t.dim,
          g.powerLimit ? `${Math.round(g.power)} / ${Math.round(g.powerLimit)} W` : `${Math.round(g.power)} W`) : null)))
      .children(d.disks.map(k => section("usage", `Disk ${k.mount}`, usage("Used", 100 * (k.total - k.free) / k.total, `${gb(k.total - k.free)} / ${gb(k.total)} GB`))))
      .when(Boolean(d.board), el => el.child(section("board", "Board", note(d.board))));
  }

  /**
   * Status and for how long, its turn, where it runs (machine, space and tab, folder, branch), context used, and its
   * sub-agents.
   */
  agentDetails(t, a, all, name) {
    const now = Date.now();
    const term = all.find(x => x.address === a.address);
    const since = term?.status_ms ?? this.since(a);
    const word = { working: "Working", blocked: "Needs you", done: "Finished \u00b7 not yet seen", idle: "Idle" };
    const color = { working: t.working, blocked: t.blocked, done: alertColors(t).done }[a.status] ?? t.muted;
    const machine = a.address.includes("/") ? a.address.split("/")[0] : localMachineLabel();
    const tab = spaces().flatMap(s => s.tabs).find(x => x.id === a.tab);
    const folder = agentFolder(a, tab ? lead(tab) : null, all);
    const branch = paneBranch(a);
    const context = (shared("agents.context") ?? {})[a.address];
    const used = Number.isFinite(context?.percent) ? Math.max(0, Math.min(100, context.percent)) : null;
    const LABEL = 64;
    const row = (label, value) => h_flex().w_full().gap(8).items_start()
      .child(div().w(LABEL).flex_none().text_size(11).text_color(t.dim).child(label))
      .child(div().flex_1().min_w(0).whitespace_normal().text_color(t.muted).child(value));
    const kids = this.tree(all, a.address);
    return v_flex().w(340).p(12).gap(8).rounded(10).border_1().border_color(t.border).bg(t.surface).text_size(12).shadow_md()
      .child(h_flex().w_full().gap(10).items_center()
        .child(icon(a.program, 26, t.muted) ?? svg("mods/machine-sidebar/icons/bot.svg").size(26).flex_none().text_color(t.muted))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().text_size(13.5).font_semibold().text_color(t.foreground).whitespace_normal().child(name || a.program?.name || a.address))
          .child(div().text_size(11).text_color(t.dim).truncate().child([a.program?.name, machine].filter(Boolean).join(" \u00b7 ")))))
      .child(row("Status", h_flex().gap(6).items_center()
        .child(div().text_color(color).child(word[a.status] ?? a.status))
        .when(Boolean(since), el => el.child(div().text_color(t.dim).child(`\u00b7 ${duration(now - since)}`)))
        .when(Number.isFinite(term?.turn), el => el.child(div().text_color(t.dim).child(`\u00b7 turn ${term.turn}`)))))
      .child(row("Space", [a.space_name, a.tab_name || (Number.isFinite(a.tab_index) ? `tab ${a.tab_index + 1}` : "")].filter(Boolean).join(" / ")))
      .when(Boolean(folder), el => el.child(row("Folder", folder)))
      .when(Boolean(branch), el => el.child(row("Branch", branch)))
      .child(row("Context", used == null ? "No reading yet" : h_flex().gap(8).items_center()
        .child(contextBar(t, used, 148, 4))
        .child(div().text_size(11).child(contextText(used)))))
      .when(kids.length > 0, el => el.child(v_flex().w_full().gap(4).pt(2)
        .child(div().text_size(11).text_color(t.dim).child(`Sub-agents \u00b7 ${kids.length}`))
        .children(kids.map(({ t: k, lines }) => {
          const st = kidStatus(k, this.listed);
          return h_flex().w_full().gap(6).items_center().pl(Math.max(0, lines.length - 1) * 12)
            .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(k.name || k.template || k.program?.name || k.address))
            .child(div().flex_none().text_size(11).text_color({ working: t.working, blocked: t.blocked }[st] ?? t.dim)
              .child([word[st] ?? st, k.status_ms ? duration(now - k.status_ms) : ""].filter(Boolean).join(" \u00b7 ")));
        }))));
  }

  /**
   * Cards whose place within their machine changed since the last draw: each starts offset by the places it moved
   * (CARD px apiece), with a fresh id so its transition starts there, and slides to 0 a frame later.
   */
  noticeMoves(list, cx) {
    const CARD = 50;
    const machineOf = x => x.includes("/") ? x.split("/")[0] : "";
    const place = new Map(), count = {};
    for (const a of list) { const m = machineOf(a.address); place.set(a.address, count[m] = (count[m] ?? -1) + 1); }
    const before = this.places;
    this.places = place;
    if (!before) return;
    let moved = false;
    for (const [address, now] of place) {
      const was = before.get(address);
      if (was === undefined || was === now) continue;
      (this.slides ??= {})[address] = (was - now) * CARD;
      (this.moveGen ??= {})[address] = (this.moveGen[address] ?? 0) + 1;
      moved = true;
    }
    if (moved) cx.timer.after(32, cx => { this.slides = {}; cx.notify(); });
  }

  /** The rail band's CPU reading: its ring alone, centred under the machine's icon, in the open rings row's 22 px. */
  railCpu(t, machine) {
    const sample = (shared("machine.stats") ?? {})[machine ?? "@local"];
    const value = sample && !sample.error && Date.now() - sample.at <= 15000 && Number.isFinite(sample.cpu) ? sample.cpu : null;
    const name = machine ?? localMachineLabel();
    return h_flex().h(22).flex_none().items_center().justify_center()
      .child(div().id(`rail-cpu-${machine ?? "local"}`).tooltip(`${name} · CPU: ${value == null ? "unavailable" : `${Math.round(value)}%`}`)
        .child(svg(`mods/machine-sidebar/stats/rings/ring-${value == null ? 0 : Math.max(0, Math.min(100, Math.round(value)))}.svg`).size(12).flex_none()
          .text_color(value == null ? t.dim : t.accent)));
  }

  toTop(address) {
    this.order = [address, ...this.order.filter(x => x !== address)];
    localStorage.setItem("order", JSON.stringify(this.order));
  }

  /** A dragged agent, put before (or after) another. */
  moveTo(address, target, after) {
    if (address === target) return;
    const rest = this.order.filter(x => x !== address);
    const at = rest.indexOf(target);
    if (at < 0) return;
    rest.splice(after ? at + 1 : at, 0, address);
    this.order = rest;
    localStorage.setItem("order", JSON.stringify(this.order));
  }

  /** Machines in the order dragged to, the ones never dragged after them in Herdr's order. */
  sortMachines(list) {
    const at = name => { const i = this.machineOrder.indexOf(name ?? ""); return i < 0 ? Infinity : i; };
    return list.map((m, i) => [m, i]).sort(([a, i], [b, j]) => at(a.name) - at(b.name) || i - j).map(([m]) => m);
  }

  /** A dragged machine, put before (or after) another, and kept. */
  moveMachine(key, target, after) {
    if (key === target) return;
    const names = this.sortMachines(machines().filter(m => !m.temporary)).map(m => m.name ?? "");
    const rest = names.filter(x => x !== key);
    const at = rest.indexOf(target);
    if (at < 0) return;
    rest.splice(after ? at + 1 : at, 0, key);
    this.machineOrder = rest;
    localStorage.setItem("machines.order", JSON.stringify(rest));
  }

  /**
   * A machine's rows as drawn, or in the Classic style one box: its band on top, a rule, then its agents and terminals.
   */
  boxed(t, g, index, items) {
    if (!classic() || !g.machine) return items;
    const [band, ...rest] = items;
    return [
      ...(index > 0 ? [div().h(12).flex_none()] : []),
      v_flex().w_full().flex_none().rounded(10).border_1().border_color(t.border).overflow_hidden()
        .child(band)
        .when(rest.length > 0, el => el.child(div().h(1).flex_none().bg(t.border)).child(v_flex().w_full().p(4).children(rest))),
    ];
  }

  setPins(pins) {
    this.pins = pins;
    localStorage.setItem("pins", JSON.stringify(pins));
  }

  /** Drops pins of agents that ended. */
  prunePins(all) {
    const machine = (addr) => (addr.includes("/") ? addr.split("/")[0] : "");
    const heard = new Set(all.map((k) => machine(k.address)));
    const live = new Set(all.filter((k) => k.state === "live").map((k) => k.address));
    const kept = this.pins.filter((p) => !heard.has(machine(p)) || live.has(p));
    if (kept.length !== this.pins.length) this.setPins(kept);
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  refreshHosts(cx) {
    cx.spawn(async cx => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) this.hosts = Object.fromEntries((JSON.parse(r.stdout).machines ?? []).map(m => [m.name, m]));
      } catch {}
      cx.notify();
    });
  }

  /** Retry a machine that isn't connected. */
  retry(name, cx) {
    if (this.retrying[name]?.busy) return;
    this.retrying[name] = { busy: true };
    cx.notify();
    cx.spawn(async cx => {
      const failed = message => notify({ title: `Couldn't reconnect to ${name}`, body: message, level: "error" });
      try {
        const r = await hc(["machine", "login", name, "--json"]);
        let error = null;
        if (r.code !== 0) {
          try { error = JSON.parse(r.stdout || r.stderr).error ?? null; } catch {}
          error ??= { message: (r.stderr || r.stdout || "hc machine login failed").trim() };
        }
        if (!error) notify({ title: `Reconnected to ${name}`, level: "success", timeout: 4000 });
        else if (/terminal/i.test(error.message ?? "") || /types the password/i.test(error.hint ?? "")) await this.loginInTerminal(name, failed);
        else failed(error.message);
      } catch (e) {
        failed(String(e?.message ?? e));
      }
      this.retrying[name] = { busy: false };
      this.refreshHosts(cx);
      cx.notify();
    });
  }

  async loginInTerminal(name, failed) {
    const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 20);
    const r = await hc(["run", "--bg", "--json", "--no-parent", "--name", `login-${slug}-${Date.now().toString(36).slice(-5)}`,
      "--", "hc", "machine", "login", name]).catch(() => null);
    let address = null;
    try { address = r?.code === 0 ? JSON.parse(r.stdout).address : null; } catch {}
    if (!address) return failed(`Couldn't open a terminal for it. Run \`hc machine login ${name}\` in one.`);
    openOverlay({
      kind: "dialog",
      key: `machine-login-${name}`,
      width: 640,
      height: 300,
      layout: {
        type: "column",
        children: [
          { type: "block", size: { px: 34 }, content: { mod: "machine-sidebar", props: { loginBar: name, terminal: address } } },
          { type: "block", content: { terminal: address } },
        ],
      },
    });
  }

  /** The login dialog's title bar. */
  loginBar(t) {
    const { loginBar: name, terminal } = props();
    return h_flex()
      .size_full()
      .px(12)
      .gap(8)
      .items_center()
      .bg(t.chrome ?? t.background)
      .border_b(1)
      .border_color(t.border)
      .text_size(12)
      .child(svg("mods/machine-sidebar/icons/hard-drive.svg").size(13).flex_none().text_color(t.dim))
      .child(div().flex_none().text_color(t.foreground).font_medium().child(`Log in to ${name}`))
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child("Type the password or code below; this closes when it connects."))
      .child(div()
        .id("login-close")
        .size(20)
        .flex_none()
        .rounded(5)
        .flex()
        .items_center()
        .justify_center()
        .text_color(t.dim)
        .hover(s => s.bg(t.hover).text_color(t.foreground))
        .tooltip("Cancel")
        .on_click(() => {
          run("terminal.kill", { terminal });
          closeOverlay(props().overlay);
        })
        .child(svg("mods/machine-sidebar/icons/x.svg").size(12)));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  /** Live sub-agents of `addr`, depth first, each with the tree lines in front of it. */
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const on = k.address === shown;
    const hops = !classic() && healthBars() && Boolean(k.program?.icon) && st === "working" && !orbsOn(t);
    const bright = on || (st !== "idle" && !hops);
    const color = on ? t.accent : compact && bright ? t.foreground : t.muted;
    const ring = this.hoveredSub === k.address ? t.hover : on ? t.raised : t.surface;
    if (hops) this.hopping = true;
    const orb = classic() ? null : this.orbFor(t, k.address, st);
    const pic = classic() ? icon(k.program, 14, color)
      : agentPic(t, orb ? null : k.program, 14, color, ring, true, hops ? this.hopFor(k.address) : null, null, null, orb);
    const name = k.name || k.template || k.program?.name || k.address;
    const box = h_flex().id(`sub-${k.address}`).relative().h(26).flex_none().items_center().rounded(8)
      .when(on, (el) => el.bg(t.raised)).hover((s) => s.bg(t.hover)).cursor_pointer()
      .on_hover((over, cx) => {
        if (over) this.hoveredSub = k.address; else if (this.hoveredSub === k.address) this.hoveredSub = null;
        cx.notify();
      })
      .on_click(() => this.peek(k.address))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.openAgentMenu(k.address, true, cx); });
    if (compact) return box.justify_center().tooltip(name).child(pic ?? this.status(t, { status: st }, true));
    return box
      .pl(classic() ? 17 * s.lines.length + 17 : 23 * s.lines.length + 9)
      .pr(8)
      .text_size(12.5)
      .children(classic()
        ? s.lines.flatMap((l, j) => l ? [div().absolute().left(17 + 17 * j).top(0).w(1).bg(mix(t.dim, t.surface, 0.4))
          .when(l === "└", el => el.h(13)).when(l !== "└", el => el.bottom(0))] : [])
        : s.lines.flatMap((l, j) => treeLines(t, 15 + 23 * j, 13, l === "│" || l === "├", l === "├" || l === "└")))
      .when(Boolean(pic), el => el.child(div().mr(classic() ? 8 : 10).child(pic)))
      .when(Boolean(orb) && Boolean(k.program?.icon), el => el.child(div().mr(6).flex_none().tooltip(k.program?.name ?? "").child(icon(k.program, 11, t.dim))))
      .child(div().flex_1().truncate().text_color(st === "working" && monochrome(t) ? WHITE : on ? t.foreground : t.muted).child(name))
      .child(hops ? div().size(14).flex_none() : this.status(t, { status: st, address: k.address, orbed: Boolean(orb) }));
  }

  /** The machine's panes that aren't agents: a shell, a dev server, lazygit. */
  plainTerminals(machine) {
    const key = machine.name ?? "";
    const agentPanes = new Set(agents().map((a) => a.pane).filter(Boolean));
    return panes().filter((p) => p.terminal && !agentPanes.has(p.pane)
      && (p.terminal.includes("/") ? p.terminal.split("/")[0] : "") === key);
  }

  /**
   * The machine's plain terminals at the bottom of its group, under its agents, a row each: the program's icon in the
   * agent cards' icon column (their 2 px stripe and 8 px padding), the program running now, its folder. A click focuses
   * the pane and shows the Terminal view, as a shell has no chat. In Classic their count is in the machine's header. On
   * the rail (compact) just the icon, centred as the agents' are, with the rest in its tooltip.
   */
  terminalRows(t, machine, compact = false) {
    const shown = atHome(layout) ? null : focused()?.pane;
    return this.plainTerminals(machine).map((p) => {
      const on = p.pane === shown, name = p.program?.name || p.title || "shell", where = folderName(p.cwd);
      const pic = icon(p.program, 16, on ? t.accent : t.muted) ?? svg("mods/machine-sidebar/icons/terminal.svg").size(15).flex_none().text_color(on ? t.accent : t.muted);
      const open = () => {
        run("pane.focus", { pane: p.pane });
        showWork(run, layout);
        if (find(layout(), "chat-view")) run("layout.select", { stack: "chat-view", child: "terminal-panel" });
      };
      const box = h_flex().id(`term-${p.pane}`).h(28).flex_none().items_center().rounded(6).border_l(2)
        .border_color(on && compact ? t.accent : t.surface).when(on, (el) => el.bg(compact ? t.selected : t.raised))
        .hover((s) => s.bg(t.hover)).cursor_pointer()
        .tooltip([name, p.title && p.title !== name ? p.title : "", p.cwd].filter(Boolean).join(" · "))
        .on_click(open);
      if (compact) return box.justify_center().pr(2).child(h_flex().w(16).flex_none().justify_center().child(pic));
      return box.pl(8).pr(8).gap(10).text_size(12.5)
        .child(h_flex().size(16).flex_none().items_center().justify_center().child(pic))
        .child(div().flex_none().text_color(on ? t.foreground : t.muted).child(name))
        .when(Boolean(where), (el) => el.child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(where)));
    });
  }

  /**
   * The orb that stands in for an agent's bot in Monochrome (Tree): its own while it works, listening while it needs
   * you, and breathing while it's idle or done. Null outside Monochrome, or once the pool is handed out.
   */
  orbFor(t, address, status) {
    if (!orbsOn(t) || !address) return null;
    return this.orbs.orb(status === "working" ? workState(address) : status === "blocked" ? "listening" : "breathing");
  }

  /**
   * An agent's status mark (compact: a ! for blocked, under a "Needs you" header); hovering any of them gives the
   * context window used. In Monochrome a working agent's mark is its orb and one that needs you leads with a listening
   * orb, while the pool lasts (orbs.js); with `orbed` the bot already carries it, so the mark leaves it out.
   */
  status(t, a, compact = false) {
    const context = a.address ? (shared('agents.context') ?? {})[a.address] : null;
    const known = Number.isFinite(context?.percent);
    const percent = known ? Math.max(0, Math.min(100, context.percent)) : 0;
    const state = { working: "Working", done: "Finished · not yet viewed", blocked: "Needs you" }[a.status];
    const tip = a.address ? `Context: ${known ? contextText(percent) : "unavailable"}${state ? ` · ${state}` : ""}` : state;
    const mark = el => div().size(14).flex_none().flex().items_center().justify_center().when(Boolean(tip), d => d.tooltip(tip)).child(el);
    if (a.orbed && a.status === "working") return mark(div());
    const orb = orbsOn(t) && !a.orbed && a.address && (a.status === "working" || a.status === "blocked")
      ? this.orbs.orb(a.status === "working" ? workState(a.address) : "listening") : null;
    if (a.status === "working" && orb) return mark(orb);
    if (a.status === "working") return mark(svg("mods/machine-sidebar/icons/spinner.svg").size(15).flex_none().text_color(t.working).spin(900));
    if (a.status === "done") return mark(svg("mods/machine-sidebar/icons/circle-check.svg").size(13).flex_none().text_color(alertColors(t).done));
    if (a.status === "blocked" && compact && orb) return mark(orb);
    if (a.status === "blocked" && compact) return mark(div().size(14).rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!"));
    if (a.status === "blocked" && orb) return h_flex().flex_none().gap(6).items_center().child(mark(orb))
      .child(div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center()
        .when(Boolean(tip), d => d.tooltip(tip)).child("Needs you"));
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center()
      .when(Boolean(tip), d => d.tooltip(tip)).child("Needs you");
    if (compact) return (known ? contextBar(t, percent, 14) : div().w(14).h(3).flex_none().rounded_full().bg(t.border)).when(Boolean(tip), d => d.tooltip(tip));
    return div().size(14).flex_none();
  }

  /** A machine's folders the menu lists for a new terminal: Home's choices there (open ones, then remembered). */
  machineFolders(machine) {
    return folderChoices(machine, spaces(), panes(), shared(KEPT_FOLDERS));
  }

  /** A machine's home folder: this computer's at once, another's as learnt by learnHome, null until then. */
  machineHome(machine) {
    return machine === null ? home() : (shared(MACHINE_HOMES) ?? {})[machine] ?? null;
  }

  /** Asks a machine for its home folder once (`hc exec`), keeping it in shared state for its menu's New terminal. */
  learnHome(machine, cx) {
    if (machine === null || this.machineHome(machine)) return;
    cx.spawn(async () => {
      const r = await hc(["exec", "--on", machine, 'printf %s "$HOME"']).catch(() => null);
      const path = (r?.stdout ?? "").trim();
      if (path.startsWith("/")) setShared(MACHINE_HOMES, { ...(shared(MACHINE_HOMES) ?? {}), [machine]: path });
    });
  }

  /** A machine's right-click menu (props `{ machineMenu }`: its name, "@local" for this computer). */
  machineMenu(t, machine) {
    const folders = this.machineFolders(machine);
    const item = it => it.heading
      ? div().h(22).flex_none().px(8).pt(4).text_size(11).text_color(t.dim).child(it.label)
      : h_flex().id(`menu-${it.id}`).h(28).flex_none().px(8).gap(9).items_center().rounded(6).cursor_pointer()
        .hover(s => s.bg(t.hover)).text_size(12.5).text_color(t.foreground)
        .when(Boolean(it.tip), el => el.tooltip(it.tip))
        .on_click(() => this.carryOutMachine(it.id, machine, folders))
        .child(svg(`mods/machine-sidebar/icons/${it.glyph}.svg`).size(13).flex_none().text_color(t.muted))
        .child(div().flex_1().truncate().child(it.label));
    const groups = machineMenuItems({ folders, local: machine === null });
    return v_flex().size_full().p(5).bg(t.popover ?? t.surface).text_color(t.foreground)
      .children(groups.flatMap((g, i) => [...(i ? [div().h(1).mx(4).my(4).flex_none().bg(t.border)] : []), ...g.map(item)]));
  }

  /** How tall a machine's menu is: its items, its folders' heading and the rule between its groups. */
  machineMenuHeight(machine) {
    const groups = machineMenuItems({ folders: this.machineFolders(machine), local: machine === null });
    return groups.flat().reduce((sum, it) => sum + (it.heading ? 22 : 28), 0) + (groups.length - 1) * 9 + 12;
  }

  /** Carries out a machine menu item (agent-menu.js's machineActionOf), closing the menu. */
  carryOutMachine(id, machine, folders) {
    const plan = machineActionOf(id, machine, folders);
    if (!plan) return;
    const terminal = where => {
      const [command, args] = where
        ? startCommand({ machine, folder: where, agent: null }, spaces(), panes())
        : homeTerminal(machine, this.machineHome(machine), spaces());
      run(command, args);
      showWork(run, layout);
    };
    if (plan.pick) {
      pickFolder({ prompt: "Where should the terminal start?" }).then(f => { closeOverlay(props().overlay); if (f) terminal(f); });
      return;
    }
    closeOverlay(props().overlay);
    if (plan.start) showHome(run, layout, setShared, { machine });
    if (plan.terminal) terminal(plan.terminal.folder);
  }

  /** What the agent menu and message box know of an agent or sub-agent: its name, tab, folder and whether it's pinned. */
  menuTarget(address) {
    const a = agents().find(x => x.address === address) ?? terminals().find(x => x.address === address);
    if (!a) return null;
    const tab = spaces().flatMap(s => s.tabs).find(x => x.id === a.tab);
    const pane = tab ? lead(tab) : null;
    const name = sessionTitle(pane ?? a) || a.name || a.title || a.program?.name || address;
    const folder = agentFolder(a, pane) || a.cwd || null;
    const pinned = JSON.parse(localStorage.getItem("pins") ?? "[]").includes(address);
    return { agent: { address, name, tab: tab?.id ?? null }, folder, pinned, tabPanes: tab ? panes().filter(p => p.tab === tab.id).length : 0 };
  }

  /**
   * Opens an agent's right-click menu at the pointer, sized to its items, closing the row's details card and keeping it
   * shut until the pointer leaves the row, so the two never overlap.
   */
  openAgentMenu(address, sub, cx) {
    this.detailsTimer?.cancel();
    this.muted = address;
    this.detailsKey = null;
    cx.notify();
    const target = this.menuTarget(address);
    if (!target) return;
    const groups = menuItems({ sub, pinned: target.pinned, tab: target.agent.tab, folder: target.folder });
    const height = groups.reduce((sum, g) => sum + g.length * 28, 0) + (groups.length - 1) * 9 + 12;
    openOverlay({ mod: "machine-sidebar", kind: "popup", at: "pointer", width: 250, height, props: { agentMenu: address, sub } });
  }

  /** The right-click menu itself (props `{ agentMenu, sub }`): its groups of items, each carrying out its plan. */
  agentMenu(t, address, sub) {
    const target = this.menuTarget(address);
    if (!target) return div();
    const groups = menuItems({ sub, pinned: target.pinned, tab: target.agent.tab, folder: target.folder });
    const item = it => h_flex().id(`menu-${it.id}`).h(28).flex_none().px(8).gap(9).items_center().rounded(6).cursor_pointer()
      .hover(s => s.bg(t.hover)).text_size(12.5).text_color(it.danger ? t.blocked : t.foreground)
      .on_click((_e, cx) => this.carryOut(it.id, target, cx))
      .child(svg(`mods/machine-sidebar/icons/${it.glyph}.svg`).size(13).flex_none().text_color(it.danger ? t.blocked : t.muted))
      .child(div().flex_1().child(it.label))
      .when(Boolean(it.keys), el => el.child(div().text_size(11).text_color(t.dim).child(it.keys)));
    return v_flex().size_full().p(5).bg(t.popover ?? t.surface).text_color(t.foreground)
      .children(groups.flatMap((g, i) => [...(i ? [div().h(1).mx(4).my(4).flex_none().bg(t.border)] : []), ...g.map(item)]));
  }

  /** Carries out an agent menu item's plan (agent-menu.js's actionOf), closing the menu first. */
  carryOut(id, target, cx) {
    const plan = actionOf(id, target.agent, target);
    closeOverlay(props().overlay);
    if (!plan) return;
    for (const [command, args] of plan.run ?? []) run(command, args);
    if (plan.view) {
      showWork(run, layout);
      if (find(layout(), "chat-view")) run("layout.select", { stack: "chat-view", child: plan.view });
    }
    if (plan.hc) hc(plan.hc).catch(() => notify({ title: "Couldn't interrupt it", level: "error" }));
    if (plan.pin !== undefined) {
      const pins = JSON.parse(localStorage.getItem("pins") ?? "[]").filter(p => p !== target.agent.address);
      localStorage.setItem("pins", JSON.stringify(plan.pin ? [...pins, target.agent.address] : pins));
    }
    if (plan.copy) cx.write_to_clipboard(plan.copy);
    if (plan.start) showHome(run, layout, setShared, plan.start);
    if (plan.confirm) openOverlay({ mod: "confirm", kind: "dialog", width: 380, height: 170, props: plan.confirm });
    if (plan.form === "message")
      openOverlay({ mod: "machine-sidebar", kind: "popup", at: "pointer", width: 340, height: 120, props: { agentMessage: target.agent.address } });
  }

  /** The message box's input (props `{ agentMessage }`), focused, sending on Enter. */
  initMessage(cx) {
    this.message = TextareaState.new({ placeholder: "Message it without leaving here", rows: 1 });
    this.message.set_auto_grow(1, 3);
    this.message.set_soft_wrap(true);
    this.message.on("change", (_e, cx) => cx.notify());
    this.message.on("submit", () => this.sendMessage());
    this.message.focus();
  }

  /** Sends the box's text to the agent, as if typed in its terminal and Enter pressed, and closes the box. */
  sendMessage() {
    const text = (this.message?.value() ?? "").trim();
    if (!text) return;
    const address = props().agentMessage;
    closeOverlay(props().overlay);
    hc(["send", address, text]).catch(() => notify({ title: "Couldn't send the message", level: "error" }));
  }

  /** The message box: who it goes to, the input and a send button. Esc closes it, as any popup. */
  agentMessage(t, address) {
    const name = this.menuTarget(address)?.agent.name ?? address;
    const ready = Boolean((this.message?.value() ?? "").trim());
    return v_flex().size_full().p(10).gap(8).bg(t.popover ?? t.surface).text_color(t.foreground)
      .child(div().text_size(11.5).text_color(t.muted).truncate().child(`Message ${name}`))
      .child(h_flex().px(10).py(6).gap(8).items_center().rounded(8).bg(t.background).border_1().border_color(t.accent)
        .child(div().flex_1().min_w(0).text_size(12.5).child(Textarea.new(this.message).w_full().text_size(12.5)))
        .child(div().id("send-message").size(22).flex_none().rounded_full().bg(ready ? t.foreground : t.border).cursor_pointer()
          .flex().items_center().justify_center().on_click(() => this.sendMessage())
          .child(svg("mods/machine-sidebar/icons/arrow-up.svg").size(12).text_color(t.background))))
      .child(div().text_size(11).text_color(t.dim).child("Enter sends · Esc cancels"));
  }

  /**
   * Remembers, in shared state, the folders open on each machine (its terminals' and spaces'), so Home still offers
   * them once everything there is closed. Shared state is written only when a machine has a folder not yet remembered.
   */
  rememberFolders() {
    const all = spaces(), open = panes();
    let kept = shared(KEPT_FOLDERS) ?? {}, changed = false;
    for (const machine of new Set(all.map(s => s.machine ?? null))) {
      const next = remember(kept, machine, openFolders(machine, all, open));
      if (next) { kept = next; changed = true; }
    }
    if (changed) setShared(KEPT_FOLDERS, kept);
  }

  render(cx) {
    const t = theme();
    if (props()?.loginBar) return this.loginBar(t);
    if (props()?.agentMenu) return this.agentMenu(t, props().agentMenu, Boolean(props().sub));
    if (props()?.machineMenu) return this.machineMenu(t, props().machineMenu === "@local" ? null : props().machineMenu);
    if (props()?.agentMessage) return this.agentMessage(t, props().agentMessage);
    this.pins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    if (this.menu) return v_flex().size_full().bg(theme().background).px(24).pt(20).pb(16).child(this.menu.render());
    this.rememberFolders();
    this.orbs.begin();
    const home = atHome(layout);
    if (!spaces().length && !home) showHome(run, layout, setShared);
    const collapsed = narrow();
    this.hopping = false;
    this.hopSeen = new Set();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    const shown = home ? null : focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    const at = new Map(this.order.map((x, i) => [x, i]));
    list = [...list].sort((x, y) => (at.get(x.address) ?? -1) - (at.get(y.address) ?? -1));
    this.prunePins(all);
    const pinned = this.pins.map((p) => list.find((a) => a.address === p)).filter(Boolean);
    const rest = list.filter((a) => !this.pins.includes(a.address));
    list = [...pinned, ...rest];
    this.noticeMoves(list, cx);

    const withKids = (a, i) => {
      const subs = this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, collapsed))];
    };

    /** The fold chevron; folded, the count too, colored by the most urgent one. */
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/machine-sidebar/icons/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    const tabs = spaces().flatMap(s => s.tabs);
    const label = (a) => {
      const tab = tabs.find(tab => tab.id === a.tab);
      const pane = tab ? lead(tab) : null;
      const source = pane ?? { title: a.title, program: a.program, app: a.app };
      return sessionTitle(source) || source.program?.name || folderName(pane?.cwd) || tab?.name || "";
    };

    /**
     * With the Health bar context bars (Tree) the logo carries the status (agentPic): it hops in amber while working;
     * a green check (finished, not yet looked at) or a red question mark (it needs you) sits above it. So the
     * spinner, check and "Needs you" badge go, and on the rail its second line is always the health bar.
     */
    const row = (a, i, subs = []) => {
      const on = a.focused && !home;
      const logoStatus = !classic() && healthBars() && Boolean(a.program?.icon) && !orbsOn(t);
      const hops = logoStatus && a.status === "working", finished = logoStatus && a.status === "done", asks = logoStatus && a.status === "blocked";
      const ring = this.hovered === a.address ? t.hover : on ? t.selected : t.surface;
      const iconColor = logoStatus ? (on ? t.foreground : t.muted) : on ? t.accent : t.muted;
      if (hops) this.hopping = true;
      const orb = classic() ? null : this.orbFor(t, a.address, a.status);
      const pic = classic() ? icon(a.program, 16, on ? t.accent : t.muted)
        : agentPic(t, orb && !collapsed ? null : a.program, 16, iconColor, ring, false, hops ? this.hopFor(a.address) : null, asks ? t.working : null, asks ? "ask" : finished ? "done" : null, orb);
      const idle = logoStatus ? !on : a.status === "idle" && !on;
      const isPinned = this.pins.includes(a.address);
      const full = isPinned;
      const name = label(a) || a.space_name || "";
      const tab = tabs.find(x => x.id === a.tab);
      const folder = folderName(agentFolder(a, tab ? lead(tab) : null));
      const branch = paneBranch(a);
      const where = [[folder !== name ? folder : "", "folder"], [branch, "branch"], [full && a.space_name !== name ? a.space_name : "", "layers"]].filter(([text]) => text);
      const context = (shared("agents.context") ?? {})[a.address];
      const used = Number.isFinite(context?.percent) ? Math.max(0, Math.min(100, context.percent)) : null;
      const barWidth = pic ? 14 : 36;
      const bar = used == null ? null : contextBar(t, used, barWidth).tooltip(`Context: ${contextText(used)}`);
      const machineOf = x => x.includes("/") ? x.split("/")[0] : "";
      const draggable = !isPinned;
      const dragging = this.drag?.moved && this.drag.address === a.address;
      const dropHere = this.drag?.moved && this.drop?.target === a.address;
      const slide = this.slides?.[a.address];
      const card = v_flex()
        .id(`ag-${a.address}-${this.moveGen?.[a.address] ?? 0}`)
        .relative()
        .top(slide ?? 0)
        .transition("top", { duration: 280, easing: "ease-out" })
        .py(6)
        .gap(2)
        .flex_none()
        .rounded(6)
        .border_l(2).border_color(on ? t.accent : t.surface)
        .when(on, (el) => el.bg(t.selected))
        .when(dragging, (el) => el.opacity(0.45))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) { this.hovered = a.address; this.detailsEnter(a.address, cx); }
          else { if (this.hovered === a.address) this.hovered = null; if (this.muted === a.address) this.muted = null; this.detailsLeave(a.address, cx); }
          cx.notify();
        })
        .child(this.hang(a.address, this.agentDetails(t, a, all, name)))
        .when(draggable, el => el
          .on_mouse_down("left", (e) => { this.drag = { address: a.address, machine: machineOf(a.address), y: e.position.y, moved: false }; this.drop = null; })
          .on_mouse_move((e, cx) => {
            const d = this.drag;
            if (!d) return;
            if (!d.moved && Math.abs(e.position.y - d.y) > 4) d.moved = true;
            if (!d.moved) return;
            const drop = d.address !== a.address && machineOf(a.address) === d.machine ? { target: a.address, after: e.local_position.y > 22 } : null;
            if (drop?.target !== this.drop?.target || drop?.after !== this.drop?.after) { this.drop = drop; cx.notify(); }
          })
          .on_mouse_up("left", (_e, cx) => {
            const d = this.drag;
            if (d?.moved) {
              if (this.drop) this.moveTo(d.address, this.drop.target, this.drop.after);
              this.dragged = true;
            }
            this.drag = null; this.drop = null;
            cx.notify();
          }))
        .on_click(() => {
          if (this.dragged) { this.dragged = false; return; }
          run("pane.focus", { pane: a.pane });
          showWork(run, layout);
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.openAgentMenu(a.address, false, cx); })
        .when(dropHere, el => el.child(div().absolute().left(6).right(6).h(2).rounded_full().bg(t.accent).when(this.drop.after, d => d.bottom(-1)).when(!this.drop.after, d => d.top(-1))));
      if (collapsed) {
        return card.pr(2)
          .child(h_flex().items_center().justify_center()
            .child(h_flex().w(16).flex_none().justify_center().when(Boolean(pic), el => el.child(pic)))
            .child(div().w(0).overflow_hidden().child(" "))
            .when(subs.length > 0 || (a.status === "blocked" && !asks), el => el.child(div().w(0).h(18).flex_none())))
          .child(div().relative().w_full().text_size(11.5).child(div().w(0).overflow_hidden().child(" "))
            .child(h_flex().absolute().top(0).bottom(0).left(0).right(0).items_center().justify_center()
              .child(this.status(t, logoStatus ? { ...a, status: "idle" } : { ...a, orbed: Boolean(orb) }, true))));
      }
      return card.px(8)
        .child(h_flex().w_full().gap(8).items_center()
          .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`).ml(-2).mr(2)
            .when(subs.length > 0, el => el.on_click((_e, cx) => {
              cx.stop_propagation();
              this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
              cx.notify();
            })).child(pic)))
          .child(div().flex_1().min_w(0).truncate().text_color(a.status === "working" && monochrome(t) ? WHITE : idle ? t.muted : t.foreground).child(name))
          .when(subs.length > 0, el => el.child(fold(a, subs)))
          .when(!(hops || finished || asks || a.status === "idle" || (orb && a.status === "working")),
            el => el.child(this.status(t, { ...a, orbed: Boolean(orb) }))))
        .child(h_flex().w_full().gap(8).items_center().text_size(11.5).text_color(t.dim)
          .when(Boolean(pic), el => el.child(h_flex().w(16).flex_none().ml(-2).mr(2).justify_center().when(Boolean(bar), c => c.child(bar))))
          .child(h_flex().flex_1().min_w(0).gap(10).items_center().overflow_hidden()
            .when(Boolean(orb) && Boolean(a.program?.icon), el => el.child(div().flex_none().tooltip(a.program?.name ?? "").child(icon(a.program, 11, t.dim))))
            .children(where.map(([text, glyph]) => h_flex().gap(4).items_center()
              .when(glyph === "folder", el => el.flex_none()).when(glyph !== "folder", el => el.min_w(0))
              .child(svg(`mods/machine-sidebar/icons/${glyph}.svg`).size(11).flex_none().text_color(t.dim))
              .child(div().min_w(0).truncate().child(text)))))
          .when(!pic && Boolean(bar), el => el.child(bar)));
    };

    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const machine of this.sortMachines(machines())) {
      const machineKey = machine.name ?? "";
      groups.push({
        id: `machine-${machineKey || "local"}`,
        label: machine.name || localMachineLabel(),
        status: null,
        members: rest.filter(a => (a.address.includes("/") ? a.address.split("/")[0] : "") === machineKey),
        machine,
      });
    }
    setAgentOrder(groups.flatMap(g => g.members).map(a => a.address));
    this.machineTops = groups.filter(g => g.machine && g.members.length).map(g => ({ machine: g.machine.name ?? "", top: g.members[0].address }));

    /**
     * A machine without agents: what it is, or on the rail, in the same 26 px, a mark for it with the words in its
     * tooltip: a dash for no agents, a spinner while connecting, a cross when offline or waiting for a login.
     */
    const empty = (g) => {
      const ready = g.machine?.layout === "ready", loading = !ready && g.machine?.layout === "loading";
      const text = ready ? "No agents" : this.hosts[g.machine?.name]?.state === "needs_login" ? "Needs login" : loading ? "Connecting…" : "Offline";
      const mark = ready ? svg("mods/machine-sidebar/icons/minus.svg").size(12) : loading ? svg("mods/machine-sidebar/icons/spinner.svg").size(13).spin(900) : svg("mods/machine-sidebar/icons/x.svg").size(11);
      return div().id(`empty-${g.id}`).h(26).flex_none().flex().items_center().text_size(11).text_color(t.dim)
        .when(collapsed, el => el.justify_center().tooltip(text).child(mark.flex_none().text_color(t.dim)))
        .when(!collapsed, el => el.pl(29).child(text));
    };
    /** A group's header: a machine's (inside its band, which folds it) or Pinned's (which folds itself). */
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const isMachine = Boolean(g.machine);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      const machineMark = () => div().relative().size(16).flex_none().flex().items_center().justify_center()
        .when(!classic(), d => d.child(div().absolute().left(-3).top(-3).size(22).rounded_full().bg(t.hover)))
        .child(svg(this.headerIcon(g.machine)).size(14).flex_none().text_color(t.muted));
      if (collapsed) {
        return h_flex().id(g.id).h(30).pt(isMachine ? 6 : 8).flex_none().items_center().justify_center().cursor_pointer()
          .tooltip(g.label)
          .when(!isMachine, el => el.on_click((_e, cx) => { open ? this.folded.add(g.id) : this.folded.delete(g.id); cx.notify(); }))
          .child(isMachine ? machineMark() : svg("mods/machine-sidebar/icons/pin.svg").size(12).flex_none().text_color(t.dim));
      }
      return h_flex()
        .id(g.id)
        .px(8)
        .pt(8)
        .h(30)
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .when(!isMachine, el => el.on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        }))
        .when(isMachine, el => el.gap(8).text_size(13).font_semibold().pt(6).pl(10).child(machineMark()))
        .child(div().truncate().text_color(isMachine ? t.muted : t[g.status] ?? t.dim).child(g.label))
        .when(isMachine && classic(), (el) => {
          const n = this.plainTerminals(g.machine).length, count = (id, glyph, value, tip) => h_flex().id(id).gap(3).items_center()
            .font_medium().text_size(11).text_color(t.dim).tooltip(tip)
            .child(svg(`mods/machine-sidebar/icons/${glyph}.svg`).size(12).flex_none()).child(String(value));
          return el.child(h_flex().gap(8).items_center()
            .child(count(`agents-${g.id}`, "bot", g.members.length, `${g.members.length} agent${g.members.length === 1 ? "" : "s"}`))
            .when(n > 0, (row) => row.child(count(`terms-${g.id}`, "terminal", n, `${n} terminal${n === 1 ? "" : "s"} besides the agents`))));
        })
        .when(!isMachine && !open, (el) => el.child(div().font_medium().text_size(11).text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(Boolean(top) && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .when(!isMachine, el => el.child(svg("mods/machine-sidebar/icons/chevron-right.svg").size(11).flex_none().text_color(t.dim))))
        .when(isMachine, el => el.child(div().size(14).flex_none().flex().items_center().justify_center()
          .tooltip(open ? "Fold this machine's agents" : "Show this machine's agents")
          .child(svg(`mods/machine-sidebar/icons/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim))))
        .when(isMachine && Boolean(g.machine?.name) && g.machine?.layout !== "ready", el => {
          const name = g.machine.name;
          const busy = Boolean(this.retrying[name]?.busy);
          const state = (this.hosts[name]?.state ?? g.machine.layout).replace(/_/g, " ");
          return el.child(div()
            .id(`retry-${g.id}`)
            .size(14)
            .flex_none()
            .rounded(5)
            .flex()
            .items_center()
            .justify_center()
            .text_color(busy ? t.working ?? t.dim : t.dim)
            .hover(s => s.bg(t.hover).text_color(t.foreground))
            .tooltip(busy ? `Reconnecting to ${name}…` : `${name}: ${state}. Click to reconnect.`)
            .on_click((_e, cx) => {
              cx.stop_propagation();
              this.retry(name, cx);
            })
            .child(svg(`mods/machine-sidebar/icons/${busy ? "spinner" : "rotate-cw"}.svg`).size(busy ? 15 : 12)));
        });
    };
    const rows = groups.flatMap((g, index) => this.boxed(t, g, index, [
        ...(index > 0 && !(classic() && g.machine) ? [div().h(20).flex_none()] : []),
        ...(g.machine ? [this.machineCard(t, g.machine, v_flex().id(`band-${g.id}`).w_full().pb(3).rounded(8).border_1()
          .when(classic(), el => el.rounded(0).bg(t.raised).border_color(t.raised).hover(s => s.bg(t.hover)))
          .when(!classic(), el => el.border_color("#00000000").hover(s => s.bg(t.hover)))
          .relative().cursor_pointer()
          .on_mouse_down("left", (e) => { this.mdrag = { key: g.machine.name ?? "", y: e.position.y, moved: false }; this.mdrop = null; })
          .on_mouse_move((e, cx) => {
            const d = this.mdrag;
            if (!d) return;
            if (!d.moved && Math.abs(e.position.y - d.y) > 4) d.moved = true;
            if (!d.moved) return;
            const key = g.machine.name ?? "";
            const drop = d.key !== key ? { target: key, after: e.local_position.y > 17 } : null;
            if (drop?.target !== this.mdrop?.target || drop?.after !== this.mdrop?.after) { this.mdrop = drop; cx.notify(); }
          })
          .on_mouse_up("left", (_e, cx) => {
            const d = this.mdrag;
            if (d?.moved) {
              if (this.mdrop) this.moveMachine(d.key, this.mdrop.target, this.mdrop.after);
              this.mdragged = true;
            }
            this.mdrag = null; this.mdrop = null;
            cx.notify();
          })
          .on_click((_e, cx) => {
            if (this.mdragged) { this.mdragged = false; return; }
            this.folded.has(g.id) ? this.folded.delete(g.id) : this.folded.add(g.id);
            cx.notify();
          })
          .when(Boolean(this.mdrag?.moved) && this.mdrop?.target === (g.machine.name ?? ""), el => el.child(div().absolute().left(6).right(6).h(2).rounded_full().bg(t.accent)
            .when(this.mdrop.after, d => d.bottom(-1)).when(!this.mdrop.after, d => d.top(-1))))
          .child(header(g)).when(classic(), el => el.child(collapsed ? this.railCpu(t, g.machine.name ?? null) : statsFor(g.machine.name ?? null, t))))]
          .map(card => classic() ? card : this.treeTop(t, g, collapsed, card)) : [header(g)]),
        ...(this.folded.has(g.id) ? [] : !g.machine ? g.members.flatMap(withKids) : classic() ? [
          ...(g.members.length ? g.members.flatMap(withKids) : [empty(g)]),
          ...this.terminalRows(t, g.machine, collapsed),
        ] : [
          ...(g.members.length ? [] : [empty(g)]),
          ...((terms) => [...g.members.map((a, i) => [withKids(a, i), 17]), ...terms.map(r => [[r], 14])]
            .flatMap(([rows, at], n, all) => collapsed ? rows : underMachine(t, rows, n === all.length - 1, at)))(this.terminalRows(t, g.machine, collapsed)),
        ]),
      ]));
    if (!collapsed) rows.push(...this.pastRows(t));

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.surface)
      .text_size(13)
      .child(div().h(10).flex_none())
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.")),
      )
      .child(this.scrollArea(t, collapsed, rows))
      .when(collapsed || usagePlace(shared("harness.usage")) === "strip", el => el.child(this.usageRow(t, collapsed)));
  }

  /**
   * Past sessions, below the machines: one row, closed by default, that opens to every machine's sessions not open as
   * agents now, the last written first, under the day it was, each tagged with its machine and folder. It shows the
   * lists kept from the last read at once; opening it reads them again, and so does every 30 s and each agent closing
   * while it's open, each machine reading only the logs written since (readPast). A closed agent's session already kept
   * shows the moment it's gone from agents(). A machine that can't be reached keeps its last list, dimmed.
   * A click reopens the session on its machine, in its folder. Sub-agents' sessions fold under the session that started
   * them (pastGroup). Nothing on the rail.
   */
  pastRows(t) {
    const now = Date.now(), open = this.past.open;
    const online = new Set([pastKey(null), ...machines().filter(m => m.name && m.layout === "ready").map(m => m.name)]);
    const all = pastSessions(this.pastKept, online, this.openLogs());
    const found = open ? pastRows(this.pastKept, online, this.openLogs(), this.pastLinks, terminals(), this.pastQuery.value()) : [];
    const busy = this.past.busy.size > 0;
    const head = h_flex().id("past-head").h(30).pl(10).pr(8).gap(8).flex_none().items_center().rounded(6).cursor_pointer()
      .text_size(12.5).font_medium().hover(s => s.bg(t.hover))
      .on_click((_e, cx) => {
        this.past.open = !open;
        this.past.shown = PAST_SHOWN;
        if (this.past.open) this.readPast(cx);
        cx.notify();
      })
      .child(svg("mods/machine-sidebar/icons/clock.svg").size(14).flex_none().text_color(t.muted))
      .child(div().flex_1().text_color(t.muted).child("Past sessions"))
      .when(open && busy, el => el.child(svg("mods/machine-sidebar/icons/spinner.svg").size(12).flex_none().text_color(t.dim).spin(900)))
      .when(!open && all.length > 0, el => el.child(div().text_size(11).text_color(t.dim).child(String(all.length))))
      .child(svg(`mods/machine-sidebar/icons/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim));
    const rows = [div().h(1).mx(10).mt(14).mb(6).flex_none().bg(t.border), head];
    if (!open) return rows;
    rows.push(h_flex().mx(6).mt(2).mb(4).h(26).px(8).gap(6).flex_none().items_center().rounded(6).border_1().border_color(t.border)
      .text_size(11.5)
      .child(svg("mods/machine-sidebar/icons/search.svg").size(12).flex_none().text_color(t.dim))
      .child(div().flex_1().min_w(0).child(Textarea.new(this.pastQuery).w_full().text_size(11.5))));
    const note = text => div().h(26).pl(10).flex_none().flex().items_center().text_size(11.5).text_color(t.dim).child(text);
    if (!found.length) return [...rows, note(busy ? "Reading sessions…" : all.length ? "No session matches" : "No past sessions")];
    const shown = found.slice(0, this.past.shown);
    for (const g of dayGroups(shown, now)) {
      rows.push(div().h(22).pl(10).pt(5).flex_none().text_size(11).text_color(t.dim).child(g.label));
      for (const r of g.items) rows.push(...(r.kind === "group" ? this.pastGroup(t, r, now) : [this.pastRow(t, r.s, now)]));
    }
    if (found.length > shown.length) {
      rows.push(note(`Show ${Math.min(PAST_SHOWN, found.length - shown.length)} more`).id("past-more").cursor_pointer()
        .hover(s => s.text_color(t.foreground))
        .on_click((_e, cx) => { this.past.shown += PAST_SHOWN; cx.notify(); }));
    }
    return rows;
  }

  /** A harness's logo for Past sessions, at `size`, or a bot when this computer doesn't know the harness. */
  pastMark(t, a, size) {
    return icon(this.pastPrograms?.[a], size, t.muted) ?? svg("mods/machine-sidebar/icons/bot.svg").size(size).flex_none().text_color(t.muted);
  }

  /** The chip naming a past session's machine, saying when it's offline. */
  pastChip(t, machine, offline) {
    const where = machine ?? localMachineLabel();
    return h_flex().flex_none().h(16).px(5).gap(3).items_center().rounded(4).bg(t.hover).text_size(10.5).text_color(t.dim)
      .child(svg(this.headerIcon({ name: machine })).size(10).flex_none().text_color(t.dim))
      .child(offline ? `${where} · offline` : where);
  }

  /**
   * A group of sub-agents' sessions (pastRows' group): the session that started them, or while it runs its terminal,
   * tagged running, with how many sub-agents; a chevron unfolds them, each reopenable on its own. Clicking the group
   * reopens that session, or shows it while it runs. Folded unless unfolded by hand or opened by a search.
   */
  pastGroup(t, g, now) {
    const h = g.head ?? { a: g.live.a, title: g.live.title, machine: g.live.machine, cwd: g.live.cwd };
    const unfolded = g.opened || this.past.unfolded.has(g.key);
    const n = g.kids.length, plural = k => (k === 1 ? "" : "s");
    const tag = (text, color) => div().flex_none().h(16).px(5).rounded(4).bg(t.hover).text_size(10.5).text_color(color ?? t.dim)
      .flex().items_center().child(text);
    const tags = g.live
      ? [tag("running", t.working ?? t.foreground), tag(`${n} closed sub-agent${plural(n)}`)]
      : [this.pastChip(t, h.machine, h.offline), tag(`${n} sub-agent${plural(n)}${g.running ? `, ${g.running} running` : ""}`)];
    const show = () => {
      const pane = agents().find(a => a.address === g.live.address)?.pane;
      run("pane.focus", pane ? { pane } : { terminal: g.live.address });
      showWork(run, layout);
    };
    const head = v_flex().id(`past-group-${g.key}`).px(10).py(5).gap(3).flex_none().rounded(6).cursor_pointer()
      .hover(el => el.bg(t.hover)).when(unfolded, el => el.bg(t.hover))
      .when(Boolean(h.offline), el => el.opacity(0.55))
      .tooltip(g.live ? "Show it: it's still running" : h.offline ? `${h.machine} is offline` : `Reopen in ${h.cwd}`)
      .on_click(() => (g.live ? show() : this.reopen(h)))
      .child(h_flex().gap(8).items_center()
        .child(h_flex().size(14).flex_none().items_center().justify_center()
          .child(g.live ? svg("mods/machine-sidebar/icons/spinner.svg").size(13).flex_none().text_color(t.working ?? t.foreground).spin(900) : this.pastMark(t, h.a, 14)))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(h.title))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - g.at)))
        .child(div().id(`past-fold-${g.key}`).size(16).flex_none().rounded(4).flex().items_center().justify_center()
          .hover(el => el.bg(t.selected ?? t.raised)).tooltip(unfolded ? "Fold its sub-agents" : "Show its sub-agents")
          .on_click((_e, cx) => {
            cx.stop_propagation();
            this.past.unfolded.has(g.key) ? this.past.unfolded.delete(g.key) : this.past.unfolded.add(g.key);
            cx.notify();
          })
          .child(svg(`mods/machine-sidebar/icons/chevron-${unfolded ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim))))
      .child(h_flex().pl(22).gap(6).items_center().min_w(0).children(tags));
    if (!unfolded) return [head];
    return [head, ...g.kids.map((s, i) => h_flex().id(`past-kid-${pastKey(s.machine)}-${s.id}`).h(26).pl(20).pr(10).gap(8).flex_none()
      .items_center().rounded(6).cursor_pointer().hover(el => el.bg(t.hover)).when(s.offline, el => el.opacity(0.55))
      .tooltip(s.offline ? `${s.machine} is offline` : `Reopen in ${s.cwd}`)
      .on_click(() => this.reopen(s))
      .child(div().w(12).h(26).flex_none().relative()
        .child(div().absolute().left(0).top(0).w(1).h(i === g.kids.length - 1 ? 13 : 26).bg(t.border))
        .child(div().absolute().left(0).top(13).w(10).h(1).bg(t.border)))
      .child(this.pastMark(t, s.a, 12))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(s.title))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - s.at))))];
  }

  /**
   * Writes down which live terminal started which (noteLinks) and finds each one's session log (matchLinks), kept in
   * localStorage LINKS_STORE, so Past sessions can group sub-agents under the session that started them.
   */
  notePastLinks() {
    const noted = noteLinks(this.pastLinks, terminals(), Date.now());
    if (noted) this.pastLinks = noted;
    const matched = matchLinks(this.pastLinks, this.pastKept, shared("herdr-chat.paths"));
    if (matched) this.pastLinks = matched;
    if (noted || matched) try { localStorage.setItem(LINKS_STORE, JSON.stringify(this.pastLinks)); } catch {}
  }

  /** One past session: its harness, title and when, then its machine and folder; dimmed while its machine is offline. */
  pastRow(t, s, now) {
    const where = s.machine ?? localMachineLabel();
    const mark = this.pastMark(t, s.a, 14);
    const chip = this.pastChip(t, s.machine, s.offline);
    return v_flex().id(`past-${pastKey(s.machine)}-${s.a}-${s.id}`).px(10).py(5).gap(3).flex_none().rounded(6).cursor_pointer()
      .hover(el => el.bg(t.hover))
      .when(s.offline, el => el.opacity(0.55))
      .tooltip(s.offline ? `${where} is offline: listed as of ${duration(now - s.seen)} ago` : `Reopen in ${s.cwd}`)
      .on_click(() => this.reopen(s))
      .child(h_flex().gap(8).items_center()
        .child(h_flex().size(14).flex_none().items_center().justify_center().child(mark))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(s.title))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - s.at))))
      .child(h_flex().pl(22).gap(6).items_center().min_w(0)
        .child(chip)
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(folderName(s.cwd) || s.cwd || "")));
  }

  /** The logs of the sessions open as agents now, as past-sessions.js's openKey, so Past sessions leaves them out. */
  openLogs() {
    const all = terminals();
    return new Set(agents().map(a => {
      const log = sessionOf(a.address, all)?.path;
      return log ? openKey(a.address.includes("/") ? a.address.split("/")[0] : null, log) : null;
    }).filter(Boolean));
  }

  /**
   * Lists the sessions on this computer and on every machine that can be reached, each with past_sessions.py run there
   * from where its kept list ends (sinceFor), into the kept lists (localStorage PAST_STORE) as each answers. The first
   * time, it also learns the harnesses' icons from this computer's knownAgents().
   */
  readPast(cx) {
    this.past.read = Date.now();
    const names = [null, ...machines().filter(m => m.name && m.layout === "ready").map(m => m.name)];
    cx.spawn(async cx => {
      if (!this.pastPrograms) {
        const known = await knownAgents().catch(() => []);
        this.pastPrograms = Object.fromEntries(known.filter(k => PAST_HARNESSES[k.key]).map(k => [k.key, k]));
      }
      if (!this.pastSource) this.pastSource = base64Utf8(await readFile(`${appHome()}/mods/machine-sidebar/past_sessions.py`, "utf8"));
      await Promise.all(names.map(async name => {
        if (this.past.busy.has(pastKey(name))) return;
        this.past.busy.add(pastKey(name));
        cx.notify();
        const opts = name ? { on: name, timeout: 20000 } : { timeout: 20000 };
        const since = String(sinceFor(this.pastKept, name));
        const r = await python(["-c", listProgram(this.pastSource), String(PAST_PER_MACHINE), since], opts).catch(() => null);
        this.past.busy.delete(pastKey(name));
        const items = r?.code === 0 ? parseListing(r.stdout) : null;
        if (items) {
          this.pastKept = keepListing(this.pastKept, name, items, Date.now());
          try { localStorage.setItem(PAST_STORE, JSON.stringify(this.pastKept)); } catch {}
        }
        cx.notify();
      }));
    });
  }

  /**
   * Reopens past session `s` on its machine, in its folder, with its harness's resume command (as that machine's
   * knownAgents() starts the harness), in a tab of a space already there or a new one, as Home starts an agent.
   */
  reopen(s) {
    if (s.offline) {
      notify({ title: `${s.machine} is offline`, body: "Its sessions reopen once it's back.", level: "warning", timeout: 4000 });
      return;
    }
    (async () => {
      const known = await knownAgents(s.machine ? { on: s.machine } : undefined).catch(() => []);
      const [command, args] = startCommand({ machine: s.machine, folder: s.cwd, agent: { run: resumeArgv(s, known) } }, spaces(), panes());
      run(command, args);
      showWork(run, layout);
    })();
  }

  /**
   * The list scrolls without a bar, and fades at the top (under the logo) and the bottom (over settings)
   * wherever more is out of sight that way.
   */
  scrollArea(t, collapsed, rows) {
    const max = Math.max(0, this.rowsH - this.viewH);
    if (this.scrollY > max) this.scrollY = max;
    const above = this.scrollY > 1, below = this.scrollY < max - 1;
    const STEPS = 12;
    const fade = top => v_flex().absolute().left(0).right(0).h(32).when(top, el => el.top(0)).when(!top, el => el.bottom(0))
      .children(Array.from({ length: STEPS }, (_, i) => div().w_full().flex_1().bg(t.surface).opacity(top ? (STEPS - i) / STEPS : (i + 1) / STEPS)));
    const edges = () => [above, below];
    return v_flex().flex_1().min_h(0).relative()
      .child(v_flex().id("ag-list").size_full().px(8).overflow_y_scroll().track_scroll(this.scrollHandle)
        .on_size_change((size, cx) => { const was = edges(); this.viewH = size.height; this.refade(was, cx); })
        .on_scroll_wheel((e, cx) => {
          const was = edges(), room = Math.max(0, this.rowsH - this.viewH);
          this.scrollY = Math.min(room, Math.max(0, this.scrollY - (e.delta?.y ?? 0)));
          this.refade(was, cx);
        })
        .on_hover((on, cx) => { if (!on && (this.drag || this.mdrag)) { this.drag = null; this.drop = null; this.mdrag = null; this.mdrop = null; cx.notify(); } })
        .on_mouse_up("left", (_e, cx) => { if (this.drag || this.mdrag) { this.drag = null; this.drop = null; this.mdrag = null; this.mdrop = null; cx.notify(); } })
        .child(div().w_full().h(0).flex_none())
        .child(v_flex().w_full().flex_none()
          .on_size_change((size, cx) => { const was = edges(); this.rowsH = size.height; this.refade(was, cx); })
          .children(rows)))
      .when(above, el => el.child(fade(true)))
      .when(below, el => el.child(fade(false)));
  }

  /** Redraws only when a fade comes or goes. */
  refade(was, cx) {
    const max = Math.max(0, this.rowsH - this.viewH);
    const now = [this.scrollY > 1, this.scrollY < max - 1];
    if (now[0] !== was[0] || now[1] !== was[1]) cx.notify();
  }
}
