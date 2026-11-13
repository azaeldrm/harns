import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { theme, shared, setShared, window, props, closeOverlay, layout, run } from "herdr";

const SECTIONS = [
  { id: "general", title: "General", icon: "mods/harness-chrome/laptop.svg" },
  { id: "sidebar", title: "Sidebar", icon: "mods/harness-chrome/sidebar.svg" },
  { id: "chat", title: "Chat", icon: "mods/harness-chrome/message.svg" },
  { id: "status", title: "Status bar", icon: "mods/harness-chrome/panel-bottom.svg" },
  { id: "simulator", title: "Simulator", icon: "mods/harness-simulator/smartphone.svg" },
];

const STYLES = [
  { id: "classic", name: "Classic", about: "Each machine boxed with its agents and stats." },
  { id: "tree", name: "Tree", about: "Agents hang from their machine on lines." },
];

function find(node, id) {
  // The layout node with this id, if the layout has one.
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class HarnessSettings extends View {
  init(_props, cx) {
    this.section = SECTIONS.some(s => s.id === props()?.section) ? props().section : "general";
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.name = InputState.new({ placeholder: shared("harness.local-hostname") ?? "This computer" });
    this.name.set_value(String(shared("harness.local-name") ?? ""));
    this.name.on("change", () => {
      const value = this.name.value();
      setShared("harness.local-name", value);
      setShared("machine.local-label", value.trim() || shared("harness.local-hostname") || "This computer");
    });
    this.name.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.name.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
  }

  heading(t, text) {
    // A group's title, as Herdr's settings write them.
    return div().pt(6).pb(8).text_size(12).font_semibold().text_color(t.dim).child(text.toUpperCase());
  }

  row(t, title, about, control) {
    // One setting: what it is on the left, the control on the right.
    return h_flex().w_full().gap(16).py(12).items_center().border_b(1).border_color(t.border)
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(div().text_size(14).text_color(t.foreground).child(title))
        .when(Boolean(about), el => el.child(div().text_size(12.5).line_height("18px").text_color(t.dim).child(about))))
      .child(div().flex_none().child(control));
  }

  toggle(t, id, on, onClick) {
    // An on/off switch, as Herdr's settings draw it.
    return div().id(id).w(36).h(20).rounded(10).p(2).cursor_pointer().bg(on ? t.accent : t.hover).flex()
      .when(on, el => el.justify_end()).on_click(onClick)
      .child(div().w(16).h(16).rounded(8).bg(on ? t.accent_foreground ?? t.background : t.muted));
  }

  flag(t, key, title, about, onChange) {
    // A row switching a shared value that's on unless set to false.
    const on = shared(key) !== false;
    return this.row(t, title, about, this.toggle(t, `flag-${key}`, on, () => { setShared(key, !on); onChange?.(!on); }));
  }

  general(t) {
    // This computer's name in the sidebar and the status bar.
    return v_flex().w_full()
      .child(this.heading(t, "This computer"))
      .child(this.row(t, "Name", "How this computer is called in the sidebar and the status bar. Empty: its hostname.",
        div().id("local-name").w(200).h(30).px(10).flex().items_center().rounded(7).border_1()
          .border_color(this.typing ? t.accent : t.border).bg(t.background).cursor_text()
          .child(Input.new(this.name).h_full().text_size(13).text_color(t.foreground))));
  }

  sidebar(t) {
    // The sidebar's look: one of the styles, its dot filled when in use.
    const style = ["classic", "contained"].includes(shared("harness.sidebar")) ? "classic" : "tree";
    return v_flex().w_full()
      .child(this.heading(t, "Style"))
      .children(STYLES.map(s => this.row(t, s.name, s.about,
        div().id(`style-${s.id}`).size(20).rounded(10).border_1().border_color(s.id === style ? t.accent : t.border).cursor_pointer()
          .flex().items_center().justify_center().on_click(() => setShared("harness.sidebar", s.id))
          .when(s.id === style, el => el.child(div().size(10).rounded(5).bg(t.accent))))));
  }

  chat(t) {
    // herdr-chat's switches: agents as a chat, and the animation behind a new conversation.
    return v_flex().w_full()
      .child(this.heading(t, "Chat"))
      .child(this.flag(t, "herdr-chat.chat", "Open agents as a chat", "Off: agents' tabs show their terminal, without the Chat and Terminal switch.",
        on => { if (!on && find(layout(), "chat-view")) run("layout.select", { stack: "chat-view", child: "terminal-panel" }); }))
      .child(this.flag(t, "herdr-chat.animation", "Welcome animation", "The dimmed scene behind a new conversation: sharks, jellyfish, a night sky or rain."));
  }

  status(t) {
    // The status bar at the bottom, and what it shows.
    return v_flex().w_full()
      .child(this.heading(t, "Status bar"))
      .child(this.flag(t, "harness.status", "Show the status bar", "The bar under the work area.",
        on => run(on ? "layout.show" : "layout.hide", { id: "status" })))
      .child(this.flag(t, "harness.quota.claude", "Claude Code quota", "Its 5-hour window, and 7 days while hovered."))
      .child(this.flag(t, "harness.quota.codex", "Codex quota", "Its 5-hour window, and 7 days while hovered."))
      .child(this.flag(t, "harness.commands-hint", "Commands hint", "The shortcut that opens the command palette, at the right end."));
  }

  simulator(t) {
    // Whether the tab bar offers the Simulator panel.
    const supported = ["windows", "linux"].includes(window()?.platform);
    const on = shared("harness.simulator") !== false;
    return v_flex().w_full()
      .child(this.heading(t, "Simulator"))
      .child(this.row(t, "Show the Simulator", supported ? "A device for each session, in a panel beside the chat." : "Needs Windows or Linux.",
        supported ? this.toggle(t, "simulator-on", on, () => setShared("harness.simulator", !on)) : div()));
  }

  render() {
    const t = theme();
    const nav = v_flex().flex_none().w(190).h_full().p(10).gap(2).border_r(1).border_color(t.border)
      .child(div().px(10).pt(6).pb(12).text_size(16).font_semibold().text_color(t.foreground).child("harns"))
      .children(SECTIONS.map(s => {
        const on = s.id === this.section;
        return h_flex().id(`hs-${s.id}`).gap(10).px(10).py(7).items_center().rounded(7).cursor_pointer()
          .bg(on ? t.raised : "#00000000").hover(st => st.bg(t.raised))
          .on_click((_e, cx) => { this.section = s.id; cx.notify(); })
          .child(svg(s.icon).size(15).text_color(on ? t.accent : t.dim))
          .child(div().flex_1().text_size(13.5).text_color(on ? t.foreground : t.muted).child(s.title));
      }));
    const page = { general: () => this.general(t), sidebar: () => this.sidebar(t), chat: () => this.chat(t), status: () => this.status(t), simulator: () => this.simulator(t) }[this.section];
    return h_flex().id("harness-settings").track_focus(this.handle).w_full().h(480).items_start()
      .on_key_down((e, cx) => { if (e.key === "escape") { cx.stop_propagation(); closeOverlay(props()?.overlay); } })
      .child(nav)
      .child(div().id("hs-body").flex_1().min_w(0).h_full().overflow_y_scroll()
        .child(div().px(28).py(22).child(page())));
  }
}
