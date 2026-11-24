import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex, Textarea, TextareaState, Popover } from "gpui-base";
import { theme, spaces, machines, panes, knownAgents, pickFolder, run, openOverlay, shared, setShared } from "herdr";
import { KEPT_FOLDERS, folderChoices, openFolders, remember, startCommand } from "./home-plan.js";
import { folderName } from "./paths.js";

const TERMINAL = "Terminal";

/**
 * Starting work: a box for the first message, then where and with what it starts. Sending runs one herdr `tab.new` or
 * `space.new` with the agent as `argv` and the message as `task`, so herdr hands the agent its first message and the
 * agent names its own tab. `form` is "full" (Home's screen: machine, folder and agent to choose), "space" (the tab
 * bar's +: the active space's machine and folder, only the agent to choose). `icons` is the folder of the host mod's
 * icons; `onStart` runs after sending, for the host to close or leave.
 */
export class Home {
  init(cx, { form, icons, onStart }) {
    this.form = form;
    this.icons = icons;
    this.onStart = onStart;
    this.picked = [];
    this.agents = [];
    this.input = TextareaState.new({ placeholder: "Describe a task or ask a question", rows: 2 });
    this.input.set_auto_grow(2, 6);
    this.input.set_soft_wrap(true);
    this.input.on("change", (_e, cx) => cx.notify());
    this.input.on("submit", (_e, cx) => this.start(cx));
    this.reset(cx, spaces().find(s => s.active)?.machine ?? null);
  }

  /**
   * Starts over on `machine` (null for this computer): `folder` chosen when given (else none), its agents read again,
   * the box focused.
   */
  reset(cx, machine, folder = null) {
    this.machine = machine;
    this.folder = folder;
    if (folder) this.picked = [folder, ...this.picked.filter(f => f !== folder)];
    this.input.focus();
    this.load(cx);
  }

  /** Reads which agents the chosen machine has installed; the first, herdr's most picked, is chosen. */
  load(cx) {
    const on = this.machine;
    this.loading = true;
    this.failed = false;
    cx.spawn(async cx => {
      let list = [];
      try { list = await knownAgents({ on }); } catch { this.failed = true; }
      if (on !== this.machine) return;
      this.agents = list.filter(a => a.installed);
      if (this.agent !== TERMINAL && !this.agents.some(a => a.name === this.agent)) this.agent = this.agents[0]?.name ?? TERMINAL;
      this.loading = false;
      cx.notify();
    });
  }

  /**
   * The folders offered on the chosen machine: ones picked here, then where its terminals and spaces are, then the
   * ones remembered there. In the "space" form, only where the active space's focused terminal is.
   */
  folders() {
    if (this.form === "space") return openFolders(this.machine, spaces(), panes()).slice(0, 1);
    const picked = this.machine === null ? this.picked : [];
    return [...picked, ...folderChoices(this.machine, spaces(), panes(), shared(KEPT_FOLDERS)).filter(f => !picked.includes(f))];
  }

  /** Starts the chosen agent with the box's text where it was chosen, and remembers the folder. */
  start(cx) {
    const machine = machines().find(m => m.name === this.machine);
    if (machine?.layout === "unavailable" || this.loading) return;
    const agent = this.agents.find(a => a.name === this.agent) ?? null;
    const folder = this.folder ?? this.folders()[0] ?? null;
    const task = (this.input.value() ?? "").trim();
    const [command, args] = startCommand({ machine: this.machine, folder, agent, task }, spaces(), panes());
    this.onStart?.();
    run(command, args);
    const kept = folder && remember(shared(KEPT_FOLDERS), this.machine, [folder], true);
    if (kept) setShared(KEPT_FOLDERS, kept);
    this.input.set_value("");
    this.folder = null;
    if (cx) cx.notify();
  }

  /** The name a machine goes by here: its own, or this computer's label. */
  machineName(name) {
    return name ?? shared("machine.local-label") ?? "This computer";
  }

  /**
   * A pill that opens a menu below it: `face` is what it shows (an icon and a label), `items` the menu's rows, each
   * { id, glyph, label, on, enabled, tip, action }. Only one of Home's menus is open at a time, `this.open` naming it.
   */
  pill(t, id, face, items, { bordered = false, tip = null, enabled = true, square = false } = {}) {
    const open = this.open === id;
    const trigger = h_flex().id(`home-${id}`).h(bordered ? 26 : 28).px(bordered ? 9 : 8).gap(7).flex_none().items_center().rounded(7)
      .when(square, el => el.w(28).px(0).justify_center().border_1().border_color(t.border))
      .text_size(bordered ? 11 : 12).text_color(open ? t.foreground : enabled ? t.muted : t.dim)
      .when(bordered, el => el.border_1().border_color(t.border).bg(`${t.surface.slice(0, 7)}e6`))
      .when(open, el => el.bg(t.hover))
      .when(enabled, el => el.cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground)))
      .when(Boolean(tip), el => el.tooltip(tip))
      .children(face)
      .when(enabled && !square, el => el.child(svg(`${this.icons}/chevron-down.svg`).size(11).flex_none().text_color(t.dim)));
    if (!enabled) return trigger;
    const row = item => h_flex().id(`home-${id}-${item.id}`).h(30).px(8).gap(9).items_center().rounded(6)
      .text_size(12.5).text_color(item.enabled === false ? t.dim : t.foreground)
      .when(item.enabled !== false, el => el.cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((e, cx) => { this.open = null; item.action(e, cx); cx.notify(); }))
      .when(Boolean(item.tip), el => el.tooltip(item.tip))
      .child(item.glyph ?? div().w(13).flex_none())
      .child(div().flex_1().min_w(0).truncate().child(item.label))
      .when(Boolean(item.on), el => el.child(svg(`${this.icons}/check.svg`).size(12).flex_none().text_color(t.accent)));
    return Popover.new(`home-${id}-menu`).open(open)
      .on_open_change((now, cx) => { this.open = now ? id : this.open === id ? null : this.open; cx.notify(); })
      .trigger(trigger)
      .content(v_flex().w(240).mt(4).p(5).gap(1).rounded(9).border_1().border_color(t.border).bg(t.popover ?? t.raised).shadow_md()
        .children(items.map(item => item.divider ? div().h(1).my(4).mx(4).bg(t.border) : row(item))));
  }

  /** The card and the chips under it, without a background: the host lays them out. */
  render() {
    const t = theme();
    const full = this.form === "full";
    const icon = (name, color = t.dim) => svg(`${this.icons}/${name}.svg`).size(13).flex_none().text_color(color);
    const agentIcon = a => a?.icon
      ? image(a.icon).size(13).flex_none()
      : svg("icons/shell.svg").size(13).flex_none().text_color(t.dim);
    const folders = this.folders();
    const folder = this.folder ?? folders[0] ?? null;
    const target = machines().find(m => m.name === this.machine);
    const reachable = target?.layout !== "unavailable";
    const ready = reachable && !this.loading;
    const local = this.machine === null;
    const agent = this.agents.find(a => a.name === this.agent) ?? null;

    const agentItems = [
      ...this.agents.map(a => ({ id: a.key ?? a.name, glyph: agentIcon(a), label: a.name, on: a.name === this.agent,
        action: () => { if (this.agent === TERMINAL) this.input.focus(); this.agent = a.name; } })),
      { id: "terminal", glyph: svg("icons/shell.svg").size(13).flex_none().text_color(t.dim), label: TERMINAL, on: this.agent === TERMINAL,
        tip: "A plain terminal: no agent, and the text isn't sent", action: () => { this.agent = TERMINAL; } },
    ];
    const agentPill = this.pill(t, "agent",
      [agentIcon(agent), div().child(this.loading ? "Checking…" : this.agent ?? TERMINAL)], agentItems,
      { tip: this.failed ? "Could not check installed agents" : "The agent the session starts with" });

    const machineItems = machines().filter(m => !m.temporary).map(m => {
      const up = m.layout !== "unavailable";
      return { id: m.name ?? "local", glyph: icon(m.name ? "server" : "laptop"), label: this.machineName(m.name),
        on: this.machine === (m.name ?? null), enabled: up, tip: up ? null : "Not connected",
        action: (_e, cx) => this.reset(cx, m.name ?? null) };
    });
    const machinePill = this.pill(t, "machine",
      [icon(local ? "laptop" : "server"), div().child(this.machineName(this.machine))], machineItems,
      { bordered: true, enabled: full, tip: full ? "Where the session starts" : null });

    const folderItems = [
      ...folders.slice(0, 8).map((f, i) => ({ id: `f${i}`, glyph: icon("folder"), label: folderName(f) || "~", on: f === folder, tip: f,
        action: () => { this.folder = f; } })),
      ...(folders.length ? [{ divider: true }] : []),
      { id: "pick", glyph: icon("plus"), label: "Choose…", enabled: local,
        tip: local ? "Pick a folder on this computer" : "The folder picker sees only this computer",
        action: (_e, cx) => pickFolder({ prompt: "Where should the agent start?" }).then(f => {
          if (!f) return;
          this.picked = [f, ...this.picked.filter(g => g !== f)];
          this.folder = f;
          cx.notify();
        }).catch(() => {}) },
    ];
    const folderPill = this.pill(t, "folder",
      [icon("folder"), div().max_w(220).truncate().child(folder ? folderName(folder) || "~" : "home folder")], folderItems,
      { bordered: true, enabled: this.form !== "space", tip: folder ?? "The machine's home folder" });

    const active = spaces().find(s => s.active);
    const worktrees = Boolean(active) && (active.machine ?? null) === this.machine;
    const worktree = action => openOverlay({ mod: "worktree", kind: "dialog", width: action === "new" ? 460 : 560, height: action === "new" ? 280 : 480,
      props: { space: active?.id, folder: panes().find(p => p.focused)?.cwd, action } });
    const plus = this.pill(t, "more", [icon("plus", t.muted)], [
      { id: "new-worktree", glyph: icon("branch"), label: "New worktree…", enabled: worktrees, action: () => worktree("new"),
        tip: worktrees ? null : "Worktrees are made from the active space" },
      { id: "open-worktree", glyph: icon("branch"), label: "Open worktree…", enabled: worktrees, action: () => worktree("open"),
        tip: worktrees ? null : "Worktrees are made from the active space" },
    ], { tip: "More ways to start", square: true });

    const heading = full ? "What should we work on?" : `New session on ${this.machineName(this.machine)}`;
    const send = div().id("home-send").size(30).flex_none().flex().items_center().justify_center().rounded_full()
      .bg(ready ? t.accent : t.raised)
      .when(ready, el => el.cursor_pointer().hover(s => s.opacity(0.88)).on_click((_e, cx) => this.start(cx)))
      .tooltip(!reachable ? "This machine isn't connected" : this.agent === TERMINAL ? "Open a terminal (Enter)" : "Start the session (Enter)")
      .child(svg(`${this.icons}/arrow-up.svg`).size(15).text_color(ready ? t.accent_foreground : t.dim));

    return v_flex().w_full().items_center()
      .child(div().w_full().text_center().text_size(full ? 34 : 17).text_color(t.foreground)
        .when(full, el => el.font_normal()).when(!full, el => el.font_semibold()).child(heading))
      .child(v_flex().id("home-card").w_full().max_w(680).mt(full ? 30 : 16).rounded(10).border_1().border_color(t.border)
        .bg(`${t.surface.slice(0, 7)}f2`).shadow_lg()
        .child(this.agent === TERMINAL
          ? div().w_full().h(74).px(16).pt(15).text_size(13).text_color(t.dim)
            .child("A plain terminal opens: there's no agent to send a message to")
          : Textarea.new(this.input).w_full().h(74).px(16).pt(15).text_size(13).text_color(t.foreground))
        .child(h_flex().w_full().px(12).pt(4).pb(12).gap(8).items_center()
          .child(plus)
          .child(agentPill)
          .child(div().flex_1())
          .child(send)))
      .child(h_flex().mt(14).gap(8).items_center().justify_center()
        .child(machinePill)
        .child(folderPill));
  }
}
