// Agents in grouped or priority views; parents take their most urgent sub-agent's place.
// A viewed done agent stays in Done until left.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { machines, agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, layout } from "herdr";

import { machineMetrics } from "./machine-metrics.js";
import { refreshContext } from "./context.js";

const localMachineLabel = () => shared("machine.local-label") ?? "This computer";
const statsFor = (machine, t, compact = false) => machineMetrics(machine, compact, t);

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
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
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
  { id: "machine", label: "Grouped by machine", icon: "server" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS.find((s) => s.id === "machine");
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.icon.endsWith('.svg') ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu) return;
    this.folded = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    this.pins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    cx.timer.every(1000, (cx) => cx.notify());
    cx.timer.every(2000, cx => refreshContext(this, cx));
    refreshContext(this, cx);
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  setPins(pins) {
    this.pins = pins;
    localStorage.setItem("pins", JSON.stringify(pins));
  }

  // Drops pins of agents that ended. Only for machines the list has heard from:
  // right after a start, or while a machine connects, its agents aren't listed yet.
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

  // Looking at a done agent makes it idle; it stays with Done until you leave
  // it rather than drop away under you. Any other change moves it at once.
  hold(list) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    // Arriving, or any change but done turning idle, sets what it was.
    if (!same || cur.status !== "idle") this.held = cur ? { address: cur.address, rank: RANK[cur.status] ?? 0 } : null;
  }

  rank(a) {
    const sawDone = a.address === this.held?.address && this.held.rank === RANK.done && a.status === "idle";
    return sawDone ? RANK.done : RANK[a.status] ?? 0;
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/harness-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/harness-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
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

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false) {
    const ring = (asset, tint, detail, spinning = false) => div().size(14).flex_none()
      .flex().items_center().justify_center().tooltip(detail)
      .child(svg(`mods/machine-agents/context-rings/${asset}.svg`).size(12).flex_none().text_color(tint)
        .when(spinning, el => el.spin(900)));
    if (a.status === "working") return ring('spinner', t.working, 'Working', true);
    if (a.status === 'done') return div().size(14).flex_none().flex().items_center().justify_center()
      .tooltip('Finished · not yet viewed').child(div().size(7).rounded_full().bg(t.done));
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    const context = (shared('agents.context') ?? {})[a.address];
    if (a.status === 'idle' && Number.isFinite(context?.percent)) {
      const percent = Math.max(0, Math.min(100, context.percent));
      const counts = Number.isFinite(context.tokens) && Number.isFinite(context.contextWindow)
        ? ` · ${Math.round(context.tokens).toLocaleString()} / ${context.contextWindow.toLocaleString()} tokens` : '';
      return ring(`ring-${Math.round(percent)}`, percent > 90 ? '#d88179' : t.muted, `Context: ${percent.toFixed(1)}% used${counts}`);
    }
    if (a.status === "idle") return ring('ring-0', t.idle ?? t.dim, 'Context unavailable');
    return div().size(14).flex_none();
  }

  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    this.hold(list);
    const byPriority = sort.id === "priority";
    const byMachine = sort.id === "machine";
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0))]));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    this.prunePins(all);
    const pinned = this.pins.map((p) => list.find((a) => a.address === p)).filter(Boolean);
    const rest = list.filter((a) => !this.pins.includes(a.address));
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
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
        .child(svg(`mods/harness-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // Prefer the harness's own session title, then its working folder, and use
    // the Herdr tab name only when neither is available.
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
        return h_flex()
          .id(`ag-${a.address}`)
          .w_full()
          .h(26)
          .px(0)
          .flex_none()
          .items_center()
          .justify_center()
          .gap(6)
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .when(Boolean(pic), el => el.child(pic))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, a, true)));
      }
      const when = this.since(a);
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
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/harness-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      // Show the session's tab/title in every sort; priority and pinned rows add the space as context.
      const full = byPriority || isPinned;
      const name = label(a) || a.space_name || "";
      return h_flex()
        .id(`ag-${a.address}`)
        .px(8)
        .h(30)
        .flex_none()
        .rounded(5)
        .items_center()
        .gap(9)
        .border_l(2).border_color(a.focused ? t.accent : t.surface)
        .when(a.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
          .when(subs.length > 0, el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          })).child(pic)))
        .child(h_flex().flex_1().min_w(0).gap(5).items_center()
          .child(div().min_w(0).max_w(full && a.space_name ? 120 : 200).truncate().text_color(idle ? t.muted : t.foreground).child(name))
          .when(full && Boolean(a.space_name) && a.space_name !== name, el => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${a.space_name}`))))
        .when(subs.length > 0, el => el.child(fold(a, subs)))
        .when(this.hovered === a.address, el => el.child(pin))
        .when(this.hovered !== a.address && Boolean(when), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when))))
        .child(this.status(t, a, byPriority && !isPinned));
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    if (byMachine) {
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
    } else for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const machine = a.address.includes("/") ? a.address.split("/")[0] : "";
      const id = byPriority ? `sec-${r}` : byMachine ? `machine-${machine || "local"}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : byMachine ? machine || localMachineLabel() : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }

    // A group's header; it folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
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
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .child(div().truncate().text_color(t[g.status] ?? t.dim).child(g.label))
        .when(byPriority || (!byMachine && !open), (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(!byPriority && top && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .child(svg("mods/harness-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)))
        .when(byMachine && g.machine?.layout === "ready", el => el.child(div()
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
            openOverlay({ mod: "machine-new-menu", kind: "popup", width: 280, height: 500, props: { machine: g.machine.name } });
          })
          .child(svg("mods/harness-chrome/plus.svg").size(12))));
    };
    const rows = collapsed
      ? machines().filter(machine => !machine.temporary).flatMap((machine) => [
          div().h(18).flex_none(),
          statsFor(machine.name ?? null, t, true),
          ...list.filter(a => (a.address.includes('/') ? a.address.split('/')[0] : null) === machine.name)
            .flatMap(a => withKids(a, list.indexOf(a))),
        ])
      : groups.flatMap((g, index) => [
        ...(byMachine && index > 0 ? [div().h(12).flex_none()] : []),
        header(g),
        ...(byMachine ? [statsFor(g.machine?.name ?? null, t)] : []),
        ...(this.folded.has(g.id) ? [] : g.members.length ? g.members.flatMap(withKids) : byMachine ? [div().id(`empty-${g.id}`).pl(29).h(26).flex_none().flex().items_center().text_size(11).text_color(t.dim).child(g.machine?.layout === "ready" ? "No agents" : g.machine?.layout === "loading" ? "Connecting…" : "Offline")] : []),
      ]);

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.surface)
      .text_size(13)
      .when(collapsed, el => el.child(
        h_flex()
          .w_full()
          .h(41)
          .pt(14)
          .pb(5)
          .flex_none()
          .items_center()
          .justify_center()
          .child(svg("mods/harness-chrome/server.svg").size(14).text_color(t.dim).tooltip("Agents")),
      ))
      .when(!collapsed, (el) =>
        el.child(
          h_flex()
            .px(16)
            .h(41)
            .pt(14)
            .pb(5)
            .flex_none()
            .items_center()
            .justify_between()
            .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents"))
            .child(h_flex().gap(10).items_center()
              .child(div()
                .id("ag-sort")
                .text_size(11)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(() => openOverlay({ mod: "machine-agents", kind: "popup", width: 200, height: 140, props: { sortMenu: true } }))
                .tooltip(`Sort agents: ${sort.label}`)
                .child(svg(`mods/harness-chrome/${sort.icon}.svg`).size(14)))),
        ),
      )
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.")),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always").children(rows));
  }
}
