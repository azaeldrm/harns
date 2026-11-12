import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, Popup } from "gpui-base";
import { machines, agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, layout, hc, notify, home, watchFolder } from "herdr";

import { machineMetrics } from "./machine-metrics.js";
import { refreshContext } from "./context.js";
import { machineDetails } from "./details.js";
import { look, changedHosts, machinesChanged } from "./turns.js";

const localMachineLabel = () => shared("machine.local-label") ?? "This computer";
const statsFor = (machine, t) => machineMetrics(machine, false, t);

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function lead(tab, all = panes()) {
  const mine = all.filter(p => p.tab === tab.id && p.terminal);
  return mine.find(p => p.program?.agent) ?? mine.find(p => p.focused) ?? mine[0];
}

function harnessSessionTitle(l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const prefixes = [prog, l?.program?.key, l?.app === "pi" ? "\u03c0" : null].filter(Boolean);
  let session = live;
  for (const prefix of prefixes) {
    const start = session.toLowerCase();
    const name = prefix.toLowerCase();
    const separator = [" - ", " \u2014 ", " \u2013 ", " | ", ": "].find(s => start.startsWith(`${name}${s}`));
    if (separator) { session = session.slice(prefix.length + separator.length).trim(); break; }
  }
  const telling = session && session !== prog && !/^[~/]|^[A-Za-z]:\\/.test(session) && !session.includes("@") && session.toLowerCase() !== l?.program?.key;
  return telling ? session : "";
}
const folderName = path => String(path ?? "").replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) ?? "";
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const kidStatus = (k, listed) => {
  // A sub-agent without a pane isn't in agents(): its raw word, error counting as blocked.
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

function icon(p, size, color) {
  // The agent's icon from the app's program table: a one-color glyph or a picture.
  if (!p?.icon) return null;
  return p.icon.endsWith('.svg') ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

const READ_AFTER = [1000, 4000];

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.loginBar) return;
    this.folded = new Set();
    this.hosts = {};
    this.retrying = {};
    this.refreshHosts(cx);
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    this.pins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    // The order of agents within each machine: dragged by hand, and an agent that finishes or needs you moves to the top.
    this.order = JSON.parse(localStorage.getItem("order") ?? "[]");
    this.drag = null; this.drop = null;
    cx.timer.every(1000, (cx) => {
      this.noticeTurns(cx);
      if (this.detailsWanted && Date.now() < this.detailsWanted.until) this.readDetails(this.detailsWanted.name, cx);
      cx.notify();
    });
    this.noticeTurns(cx);
    this.watchLocalContext(cx);
  }

  noticeTurns(cx) {
    // Once a second: reads the context of machines where a turn ended, an agent came or went, or that came online.
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

  watchLocalContext(cx) {
    // Reads this computer's context each time its relays write a snapshot.
    const sep = home().includes("\\") ? "\\" : "/";
    const dir = [home(), ".config", "harness", "context"].join(sep);
    cx.spawn(async cx => {
      for (;;) {
        try { await watchFolder(dir); } catch { return; }
        refreshContext(this, cx, null, { footers: false });
      }
    });
  }

  track(list, now) {
    // Stamps agents whose state changed; one that finished or started needing you, or is new, goes to the top of the order.
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

  wantDetails(name, cx) {
    // Reads a hovered machine's details now (if over 3 s old) and keeps them fresh for a while.
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

  // Details cards (a machine's, an agent's), as herdr-t3's: hung from a 1 px point at the row's top-right corner, so
  // nothing covers the other rows; the first waits OPEN_AFTER, and while one is up (or was, under LIVE ago) the next opens at once.
  detailsEnter(key, cx) {
    const OPEN_AFTER = 450, LIVE = 400;
    this.hot = key;
    if (this.muted === key) return;
    this.detailsTimer?.cancel();
    if (this.detailsKey || Date.now() - (this.detailsClosed ?? 0) < LIVE) { this.detailsKey = key; cx.notify(); return; }
    this.detailsTimer = cx.timer.after(OPEN_AFTER, cx => { if (this.hot === key && !this.drag?.moved) { this.detailsKey = key; cx.notify(); } });
  }

  detailsLeave(key, cx) {
    // Closes a little after the pointer has left both the row and its card.
    if (this.hot === key) this.hot = null;
    cx.timer.after(150, cx => {
      if (this.detailsKey !== key || this.hot === key || this.overCard === key) return;
      this.detailsKey = null; this.detailsClosed = Date.now(); cx.notify();
    });
  }

  hang(key, card, edge = 8) {
    // The card, hung from the row's top-right corner (the row must be relative), while it's the one up: `edge` px further,
    // the row's distance from the sidebar's edge, so the card sits right against the sidebar.
    return Popup.new(`details-${key}`, div()).absolute().top(-1).right(-1).size(1)
      .when(this.detailsKey === key && !this.drag?.moved, pop => pop.content(div().id(`details-hover-${key}`).pl(edge)
        .on_hover((on, cx) => { if (on) this.overCard = key; else { if (this.overCard === key) this.overCard = null; this.detailsLeave(key, cx); } })
        .child(card)));
  }

  machineCard(t, machine, trigger, edge = 8) {
    // A machine's band (header and rings); resting on it shows its details beside the sidebar, level with it.
    const key = `m:${machine.name ?? "@local"}`;
    return div().id(`mtrig-${key}`).relative().w_full()
      .on_hover((on, cx) => {
        if (on) { this.wantDetails(machine.name, cx); this.detailsEnter(key, cx); }
        else { if (this.muted === key) this.muted = null; this.detailsLeave(key, cx); }
      })
      .child(trigger)
      .child(this.hang(key, this.detailsCard(t, machine), edge));
  }

  detailsCard(t, machine) {
    // A grid: each section a title (icon, name), then rows of label | bar | value in fixed columns, so every bar and value lines up.
    const key = machine.name ?? "@local";
    const d = this.details?.[key];
    const s = (shared("machine.stats") ?? {})[key];
    const fresh = s && !s.error && Date.now() - s.at <= 15000;
    const GB = 1024 ** 3;
    const gb = b => b == null ? "?" : (b / GB >= 100 ? Math.round(b / GB) : (b / GB).toFixed(1));
    const ok = v => Number.isFinite(v);
    const WARN = "#e8823a", CRIT = "#d88179";
    const level = (v, warn, crit) => v >= crit ? CRIT : v >= warn ? WARN : t.accent;
    const BAR = 148, LABEL = 44, VALUE = 90; // with the 18 px indent and two 8 px gaps: the card's 316 px inside
    const row = (label, fill, color, value) => h_flex().w_full().pl(18).gap(8).items_center().h(18)
      .child(div().w(LABEL).flex_none().text_size(11).text_color(t.dim).child(label))
      .child(div().w(BAR).h(4).flex_none().rounded_full().bg(t.border)
        .child(div().h_full().rounded_full().w(ok(fill) ? Math.max(2, Math.round(BAR * Math.max(0, Math.min(100, fill)) / 100)) : 0).bg(color)))
      .child(h_flex().w(VALUE).flex_none().justify_end().text_size(11).text_color(color === t.accent ? t.muted : color).child(value));
    const pct = v => ok(v) ? `${Math.round(v)}%` : "\u2013";
    // A size says it in GB and the bar shows the share; otherwise the share in numbers.
    const usage = (label, v, size) => row(label, v, ok(v) ? level(v, 80, 95) : t.dim, size ?? pct(v));
    const temp = c => ok(c) ? row("Temp", c, level(c, 70, 85), `${Math.round(c)}\u00b0C`) : null;
    const section = (icon, title, ...rows) => v_flex().w_full().gap(3)
      .child(h_flex().w_full().gap(6).items_center()
        .child(svg(`mods/machine-stats/${icon}.svg`).size(12).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(title)))
      .children(rows.filter(Boolean));
    const note = text => div().pl(18).text_size(11).text_color(t.dim).truncate().child(text);
    const up = sec => { if (!ok(sec)) return ""; const m = Math.floor(sec / 60), h = Math.floor(m / 60), dd = Math.floor(h / 24); return dd ? `up ${dd}d ${h % 24}h` : h ? `up ${h}h ${m % 60}m` : `up ${m}m`; };
    const card = v_flex().w(340).p(12).gap(10).rounded(10).border_1().border_color(t.border).bg(t.popover ?? t.raised).text_size(12).shadow_md()
      .child(v_flex().gap(1)
        .child(div().text_size(13.5).font_semibold().text_color(t.foreground).child(machine.name || localMachineLabel()))
        .when(Boolean(d && !d.error), el => el.child(div().text_size(11).text_color(t.dim).truncate().child([d.os, up(d.uptime)].filter(Boolean).join(" \u00b7 ")))));
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
      // Only GPUs with something live to show (an integrated GPU nvidia-smi doesn't read is left out).
      .children(d.gpus.filter(g => g.load != null || g.temp != null || g.memTotal).map(g => section("gpu", g.name,
        ok(g.load) ? usage("Load", g.load) : null,
        g.memTotal ? usage("VRAM", 100 * g.memUsed / g.memTotal, `${gb(g.memUsed)} / ${gb(g.memTotal)} GB`) : null,
        temp(g.temp),
        ok(g.power) ? row("Power", g.powerLimit ? 100 * g.power / g.powerLimit : null, g.powerLimit ? level(100 * g.power / g.powerLimit, 85, 98) : t.dim,
          g.powerLimit ? `${Math.round(g.power)} / ${Math.round(g.powerLimit)} W` : `${Math.round(g.power)} W`) : null)))
      .children(d.disks.map(k => section("usage", `Disk ${k.mount}`, usage("Used", 100 * (k.total - k.free) / k.total, `${gb(k.total - k.free)} / ${gb(k.total)} GB`))))
      // The board's name wraps rather than cut off: makers' names run long.
      .when(Boolean(d.board), el => el.child(div().w_full().text_size(11).text_color(t.dim).whitespace_normal().child(`Board \u00b7 ${d.board}`)));
  }

  agentDetails(t, a, all, name) {
    // Status and for how long, its turn, where it runs (machine, space and tab, folder, branch), context used, and its sub-agents.
    const now = Date.now();
    const term = all.find(x => x.address === a.address);
    const since = term?.status_ms ?? this.since(a);
    const word = { working: "Working", blocked: "Needs you", done: "Finished \u00b7 not yet seen", idle: "Idle" };
    const color = { working: t.working, blocked: t.blocked, done: t.ansi2 ?? t.done }[a.status] ?? t.muted;
    const machine = a.address.includes("/") ? a.address.split("/")[0] : localMachineLabel();
    const tab = spaces().flatMap(s => s.tabs).find(x => x.id === a.tab);
    const folder = (tab ? lead(tab) : null)?.cwd;
    const branch = spaces().find(s => s.id === a.space)?.branch;
    const context = (shared("agents.context") ?? {})[a.address];
    const used = Number.isFinite(context?.percent) ? Math.max(0, Math.min(100, context.percent)) : null;
    const LABEL = 64;
    const row = (label, value) => h_flex().w_full().gap(8).items_start()
      .child(div().w(LABEL).flex_none().text_size(11).text_color(t.dim).child(label))
      .child(div().flex_1().min_w(0).whitespace_normal().text_color(t.muted).child(value));
    const kids = this.tree(all, a.address);
    return v_flex().w(340).p(12).gap(8).rounded(10).border_1().border_color(t.border).bg(t.popover ?? t.raised).text_size(12).shadow_md()
      .child(h_flex().w_full().gap(8).items_center()
        .when(Boolean(icon(a.program, 16, t.muted)), el => el.child(icon(a.program, 16, t.muted)))
        .child(v_flex().flex_1().min_w(0)
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
        .child(div().w(148).h(4).flex_none().rounded_full().bg(t.border)
          .child(div().h_full().rounded_full().w(Math.max(2, Math.round(148 * used / 100))).bg(used >= 90 ? "#d88179" : used >= 75 ? "#e8823a" : t.accent)))
        .child(div().text_size(11).child(`${Math.round(used)}% used`))))
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

  noticeMoves(list, cx) {
    // Cards whose place within their machine changed since the last draw: each starts offset by the places it moved
    // (CARD px apiece), with a fresh id so its transition starts there, and slides to 0 a frame later.
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

  railCpu(t, machine) {
    // The rail band's CPU reading: its ring alone, centred under the machine's icon, in the open rings row's 22 px.
    const sample = (shared("machine.stats") ?? {})[machine ?? "@local"];
    const value = sample && !sample.error && Date.now() - sample.at <= 15000 && Number.isFinite(sample.cpu) ? sample.cpu : null;
    const name = machine ?? localMachineLabel();
    return h_flex().h(22).flex_none().items_center().justify_center()
      .child(div().id(`rail-cpu-${machine ?? "local"}`).tooltip(`${name} · CPU: ${value == null ? "unavailable" : `${Math.round(value)}%`}`)
        .child(svg(`mods/machine-stats/rings/ring-${value == null ? 0 : Math.max(0, Math.min(100, Math.round(value)))}.svg`).size(12).flex_none()
          .text_color(value == null ? t.dim : t.accent)));
  }

  toTop(address) {
    this.order = [address, ...this.order.filter(x => x !== address)];
    localStorage.setItem("order", JSON.stringify(this.order));
  }

  moveTo(address, target, after) {
    // A dragged agent, put before (or after) another.
    if (address === target) return;
    const rest = this.order.filter(x => x !== address);
    const at = rest.indexOf(target);
    if (at < 0) return;
    rest.splice(after ? at + 1 : at, 0, address);
    this.order = rest;
    localStorage.setItem("order", JSON.stringify(this.order));
  }

  setPins(pins) {
    this.pins = pins;
    localStorage.setItem("pins", JSON.stringify(pins));
  }

  prunePins(all) {
    // Drops pins of agents that ended.
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

  retry(name, cx) {
    // Retry a machine that isn't connected.
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
          { type: "block", size: { px: 34 }, content: { mod: "machine-agents", props: { loginBar: name, terminal: address } } },
          { type: "block", content: { terminal: address } },
        ],
      },
    });
  }

  loginBar(t) {
    // The login dialog's title bar.
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
      .child(svg("mods/harness-chrome/hard-drive.svg").size(13).flex_none().text_color(t.dim))
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
        .child(svg("mods/harness-chrome/x.svg").size(12)));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  tree(all, addr, lead = []) {
    // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
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
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.peek(k.address))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(this.status(t, { status: st }, compact));
  }

  terminalRows(t, machine) {
    // A machine's panes that aren't agents (a shell, a dev server, lazygit), under its agents: one "Terminals" row with their
    // count, folded at first, and when open a row each (program icon, the program running now, its folder). A click
    // focuses the pane and shows the Terminal view, as a shell has no chat. Nothing when the machine has none.
    const key = machine.name ?? "";
    const agentPanes = new Set(agents().map((a) => a.pane).filter(Boolean));
    const own = panes().filter((p) => p.terminal && !agentPanes.has(p.pane)
      && (p.terminal.includes("/") ? p.terminal.split("/")[0] : "") === key);
    if (!own.length) return [];
    this.terminalsOpen ??= new Set();
    const open = this.terminalsOpen.has(key), shown = focused()?.pane;
    // Led by a terminal icon in the agent cards' icon column (their 2 px stripe and 8 px padding), the word and the count after.
    const head = h_flex().id(`terms-${key || "local"}`).pl(10).pr(8).h(28).flex_none().gap(10).items_center().rounded(6)
      .text_size(12.5).text_color(open ? t.foreground : t.muted).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(open ? "Hide this machine's terminals" : "Show this machine's terminals")
      .on_click((_e, cx) => { open ? this.terminalsOpen.delete(key) : this.terminalsOpen.add(key); cx.notify(); })
      .child(h_flex().size(16).flex_none().items_center().justify_center()
        .child(svg("mods/harness-chrome/terminal.svg").size(15).flex_none().text_color(open ? t.foreground : t.muted)))
      .child(div().child("Terminals"))
      .child(div().text_size(11).font_medium().text_color(t.dim).child(String(own.length)));
    if (!open) return [head];
    return [head, ...own.map((p) => {
      const on = p.pane === shown, name = p.program?.name || p.title || "shell", where = folderName(p.cwd);
      const pic = icon(p.program, 14, on ? t.accent : t.muted);
      return h_flex().id(`term-${p.pane}`).pl(36).pr(8).h(26).flex_none().gap(8).items_center().rounded(8).text_size(12.5)
        .when(on, (el) => el.bg(t.raised)).hover((s) => s.bg(t.hover)).cursor_pointer()
        .tooltip([name, p.title && p.title !== name ? p.title : "", p.cwd].filter(Boolean).join(" · "))
        .on_click(() => {
          run("pane.focus", { pane: p.pane });
          run("layout.select", { stack: "chat-view", child: "terminal-panel" });
        })
        .when(Boolean(pic), (el) => el.child(pic))
        .child(div().flex_none().text_color(on ? t.foreground : t.muted).child(name))
        .when(Boolean(where), (el) => el.child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(where)));
    })];
  }

  status(t, a, compact = false) {
    // An agent's status mark (compact: a ! for blocked, under a "Needs you" header); hovering any of them gives the context window used.
    const context = a.address ? (shared('agents.context') ?? {})[a.address] : null;
    const known = Number.isFinite(context?.percent);
    const percent = known ? Math.max(0, Math.min(100, context.percent)) : 0;
    const state = { working: "Working", done: "Finished · not yet viewed", blocked: "Needs you" }[a.status];
    const tip = a.address ? `Context: ${known ? `${Math.round(percent)}% used` : "unavailable"}${state ? ` · ${state}` : ""}` : state;
    const mark = el => div().size(14).flex_none().flex().items_center().justify_center().when(Boolean(tip), d => d.tooltip(tip)).child(el);
    // The spinner's picture has a clear margin (build-mods.py), so it draws at 15 px to show the same 12 px ring.
    if (a.status === "working") return mark(svg("mods/machine-agents/context-rings/spinner.svg").size(15).flex_none().text_color(t.working).spin(900));
    if (a.status === "done") return mark(svg("mods/machine-agents/circle-check.svg").size(13).flex_none().text_color(t.ansi2 ?? t.done));
    if (a.status === "blocked" && compact) return mark(div().size(14).rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!"));
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center()
      .when(Boolean(tip), d => d.tooltip(tip)).child("Needs you");
    // Idle: on the rail (compact) a 14 px context bar, the open card's in small (gray, amber past 75%, red past 90%);
    // open, no mark (the card's bar shows the context).
    if (compact) return div().w(14).h(3).flex_none().rounded_full().bg(t.border).when(Boolean(tip), d => d.tooltip(tip))
      .when(known, el => el.child(div().h_full().rounded_full().w(Math.max(2, Math.round(14 * percent / 100))).bg(percent > 90 ? "#d88179" : percent > 75 ? t.working : t.muted)));
    return div().size(14).flex_none();
  }

  render(cx) {
    const t = theme();
    if (props()?.loginBar) return this.loginBar(t);
    const collapsed = narrow();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    const shown = focused()?.agent;
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
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, false))];
    };

    const fold = (a, subs) => {
      // The fold chevron; folded, the count too, colored by the most urgent one.
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
        .child(svg(`mods/harness-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    const tabs = spaces().flatMap(s => s.tabs);
    const label = (a) => {
      const tab = tabs.find(tab => tab.id === a.tab);
      const pane = tab ? lead(tab) : null;
      const source = pane ?? { title: a.title, program: a.program, app: a.app };
      return harnessSessionTitle(source) || folderName(pane?.cwd) || tab?.name || "";
    };

    const row = (a, i, subs = []) => {
      const pic = icon(a.program, 16, a.focused ? t.accent : t.muted);
      if (collapsed) {
        // The open card's box (border, padding, two lines of the same text sizes, kept by invisible text), so rows keep their
        // height as the sidebar folds; on the rail everything is centred: the icon, and its status under it.
        return v_flex()
          .id(`ag-${a.address}`)
          .relative()
          .py(6)
          .gap(2)
          .flex_none()
          .rounded(6)
          // 8 px in from each edge, as the open cards (so the selected one's shade matches), and the focus stripe's 2 px
          // matched on the right, so the centre stays the rail's (the open icon axis).
          .mx(8).border_l(2).pr(2).border_color(a.focused ? t.accent : t.surface)
          .when(a.focused, (el) => el.bg(t.selected))
          .cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          // Resting on it shows the agent's details card beside the rail, as open.
          .on_hover((on, cx) => { if (on) this.detailsEnter(a.address, cx); else this.detailsLeave(a.address, cx); })
          .child(this.hang(a.address, this.agentDetails(t, a, all, label(a) || a.space_name || "")))
          .child(h_flex().items_center().justify_center()
            .child(h_flex().w(16).flex_none().justify_center().when(Boolean(pic), el => el.child(pic)))
            .child(div().w(0).overflow_hidden().child(" ")))
          // The second line (its height from invisible text) holds the status mark, under the icon.
          .child(div().relative().w_full().text_size(11.5).child(div().w(0).overflow_hidden().child(" "))
            .child(h_flex().absolute().top(0).bottom(0).left(0).right(0).items_center().justify_center().child(this.status(t, a, true))));
      }
      const idle = a.status === "idle" && !a.focused;
      const isPinned = this.pins.includes(a.address);
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.setPins(isPinned ? this.pins.filter((p) => p !== a.address) : [...this.pins, a.address]);
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/harness-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      const full = isPinned;
      const name = label(a) || a.space_name || "";
      // Line 2: where it works (folder · branch, and its space where the list doesn't group by it); context used as a small bar.
      const tab = tabs.find(x => x.id === a.tab);
      const folder = folderName((tab ? lead(tab) : null)?.cwd);
      const branch = spaces().find(s => s.id === a.space)?.branch;
      // Line 2's pieces, each with its icon: the folder, the branch, and the space where the list doesn't group by it.
      const where = [[folder !== name ? folder : "", "folder"], [branch, "branch"], [full && a.space_name !== name ? a.space_name : "", "layers"]].filter(([text]) => text);
      const context = (shared("agents.context") ?? {})[a.address];
      const used = Number.isFinite(context?.percent) ? Math.max(0, Math.min(100, context.percent)) : null;
      const bar = used == null ? null : div().w(36).h(3).flex_none().rounded_full().bg(t.border).tooltip(`Context: ${Math.round(used)}% used`)
        .child(div().h_full().rounded_full().w(Math.max(2, Math.round(36 * used / 100))).bg(used > 90 ? "#d88179" : used > 75 ? t.working : t.muted));
      // Dragging (by machine, not pinned): press, move over another agent of the same machine, release.
      const machineOf = x => x.includes("/") ? x.split("/")[0] : "";
      const draggable = !isPinned;
      const dragging = this.drag?.moved && this.drag.address === a.address;
      const dropHere = this.drag?.moved && this.drop?.target === a.address;
      // A card that moved gets a new id and starts where it was, then slides to its place (noticeMoves).
      const slide = this.slides?.[a.address];
      return (v_flex()
        .id(`ag-${a.address}-${this.moveGen?.[a.address] ?? 0}`)
        .relative()
        .top(slide ?? 0)
        .transition("top", { duration: 280, easing: "ease-out" })
        .px(8)
        .py(6)
        .gap(2)
        .flex_none()
        .rounded(6)
        .border_l(2).border_color(a.focused ? t.accent : t.surface)
        .when(a.focused, (el) => el.bg(t.selected))
        .when(dragging, (el) => el.opacity(0.45))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) { this.hovered = a.address; this.detailsEnter(a.address, cx); }
          else { if (this.hovered === a.address) this.hovered = null; this.detailsLeave(a.address, cx); }
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
        })
        .when(dropHere, el => el.child(div().absolute().left(6).right(6).h(2).rounded_full().bg(t.accent).when(this.drop.after, d => d.bottom(-1)).when(!this.drop.after, d => d.top(-1))))
        .child(h_flex().w_full().gap(8).items_center()
          .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
            .when(subs.length > 0, el => el.on_click((_e, cx) => {
              cx.stop_propagation();
              this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
              cx.notify();
            })).child(pic)))
          .child(div().flex_1().min_w(0).truncate().text_color(idle ? t.muted : t.foreground).child(name))
          .when(subs.length > 0, el => el.child(fold(a, subs)))
          .when(this.hovered === a.address, el => el.child(pin))
          .child(this.status(t, a)))
        // Always two lines (the rail's rows match their height).
        .child(h_flex().w_full().pl(pic ? 24 : 0).gap(8).items_center().text_size(11.5).text_color(t.dim)
          .child(h_flex().flex_1().min_w(0).gap(10).items_center().overflow_hidden()
            .children(where.map(([text, glyph]) => h_flex().min_w(0).gap(4).items_center()
              .child(svg(`mods/harness-chrome/${glyph}.svg`).size(11).flex_none().text_color(t.dim))
              .child(div().min_w(0).truncate().child(text)))))
          .when(Boolean(bar), el => el.child(bar))));
    };

    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const machine of machines()) {
      const machineKey = machine.name ?? "";
      groups.push({
        id: `machine-${machineKey || "local"}`,
        label: machine.name || localMachineLabel(),
        status: null,
        members: rest.filter(a => (a.address.includes("/") ? a.address.split("/")[0] : "") === machineKey),
        machine,
      });
    }
    // agent.next / agent.prev (Alt+Down / Alt+Up) walk the agents as the list shows them: Pinned, then each machine top to bottom.
    setAgentOrder(groups.flatMap(g => g.members).map(a => a.address));

    const header = (g) => {
      // A group's header: a machine's (inside its band, which folds it) or Pinned's (which folds itself).
      const open = !this.folded.has(g.id);
      const isMachine = Boolean(g.machine);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
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
        // A machine's whole band folds it (below); other groups fold from their header.
        .when(!isMachine, el => el.on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        }))
        // A machine's icon on the sidebar's icon axis (26 px in, as the agents' and the footer's): list 8 + band border 1 + 10 + half of 14.
        .when(isMachine, el => el.text_size(12.5).font_semibold().pt(6).pl(10)
          .child(svg(`mods/harness-chrome/${g.machine?.name ? "hard-drive" : "monitor"}.svg`).size(14).flex_none().text_color(t.muted)))
        .child(div().truncate().text_color(isMachine ? t.foreground : t[g.status] ?? t.dim).child(g.label))
        .when(isMachine || !open, (el) => el.child(div().font_medium().text_size(11).text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(Boolean(top) && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .when(!isMachine, el => el.child(svg("mods/harness-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim))))
        // A machine always shows its fold arrow, left of the +: down while its agents show, right when folded.
        .when(isMachine, el => el.child(div().size(14).flex_none().flex().items_center().justify_center()
          .tooltip(open ? "Fold this machine's agents" : "Show this machine's agents")
          .child(svg(`mods/harness-chrome/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim))))
        .when(isMachine && g.machine?.layout === "ready", el => el.child(div()
          .id(`add-${g.id}`)
          .size(14)
          .flex_none()
          .rounded(5)
          .flex()
          .items_center()
          .justify_center()
          .text_color(t.dim)
          .hover(s => s.bg(t.hover).text_color(t.foreground))
          .tooltip(`Add an agent on ${g.label}`)
          .on_click((_e, cx) => {
            cx.stop_propagation();
            // The menu opens where the machine's card hangs: close the card, and keep it closed until the pointer leaves the box.
            this.muted = `m:${g.machine.name ?? "@local"}`;
            this.detailsTimer?.cancel();
            if (this.detailsKey === this.muted) { this.detailsKey = null; this.detailsClosed = 0; }
            cx.notify();
            openOverlay({ mod: "machine-new-menu", kind: "popup", width: 280, height: 500, props: { machine: g.machine.name } });
          })
          .child(svg("mods/harness-chrome/plus.svg").size(12))))
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
            .child(svg(`mods/harness-chrome/${busy ? "spinner" : "rotate-cw"}.svg`).size(busy ? 15 : 12)));
        });
    };
    const rows = collapsed
      ? machines().filter(machine => !machine.temporary).flatMap((machine, index) => [
          // As open: the first machine right at the top, then 20 px between machines.
          ...(index > 0 ? [div().h(20).flex_none()] : []),
          // The open band's box, row for row: its header (30 px) and its rings row (22 px, the CPU alone), 8 px in from each edge
          // and 8 px above the agents, so rows keep their height as the sidebar folds; the icon and the ring are centred.
          // Resting on it shows the machine's details card, as open.
          this.machineCard(t, machine, v_flex().mx(8).mb(8).pb(3).flex_none().rounded(8).bg(t.raised).border_1().border_color(t.border).overflow_hidden()
            .child(h_flex().h(30).pt(6).flex_none().items_center().justify_center()
              .child(svg(`mods/harness-chrome/${machine.name ? "hard-drive" : "monitor"}.svg`).size(14).flex_none().text_color(t.muted)))
            .child(this.railCpu(t, machine.name ?? null)), 0),
          ...list.filter(a => (a.address.includes('/') ? a.address.split('/')[0] : null) === machine.name)
            .flatMap(a => withKids(a, list.indexOf(a))),
        ])
      : groups.flatMap((g, index) => [
        ...(index > 0 ? [div().h(20).flex_none()] : []),
        // A machine's header and rings as one raised band, so each machine's agents read as a group.
        ...(g.machine ? [this.machineCard(t, g.machine, v_flex().id(`band-${g.id}`).w_full().mb(8).pb(3).rounded(8).bg(t.raised).border_1().border_color(t.border)
          // The whole band, name and rings alike, folds or unfolds the machine's agents.
          .cursor_pointer().hover(s => s.border_color(t.dim))
          .on_click((_e, cx) => { this.folded.has(g.id) ? this.folded.delete(g.id) : this.folded.add(g.id); cx.notify(); })
          .child(header(g)).child(statsFor(g.machine.name ?? null, t)))] : [header(g)]),
        ...(this.folded.has(g.id) ? [] : g.members.length ? g.members.flatMap(withKids)   : g.machine ? [div().id(`empty-${g.id}`).pl(29).h(26).flex_none().flex().items_center().text_size(11).text_color(t.dim).child(g.machine?.layout === "ready" ? "No agents" : this.hosts[g.machine?.name]?.state === "needs_login" ? "Needs login" : g.machine?.layout === "loading" ? "Connecting…" : "Offline")] : []),
        ...(this.folded.has(g.id) || !g.machine ? [] : this.terminalRows(t, g.machine)),
      ]);

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.surface)
      .text_size(13)
      // No heading: the machines' bands start the list.
      .child(div().h(10).flex_none())
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.")),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always")
        // A drag ends where the pointer leaves the list, or lets go outside an agent.
        .on_hover((on, cx) => { if (!on && this.drag) { this.drag = null; this.drop = null; cx.notify(); } })
        .on_mouse_up("left", (_e, cx) => { if (this.drag) { this.drag = null; this.drop = null; cx.notify(); } })
        .children(rows));
  }
}
