import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex, Popup, Popover } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, agents, openOverlay } from "herdr";
import { find, narrow } from "./layout.js";
import { showHome } from "./open-home.js";
import { COLORS_KEY, themeToApply } from "./harns-colors.js";
import { OrbPool, orbsOn } from "./orbs.js";
import { usageDays, usagePlace } from "./token-usage.js";
import { usageDetails, usageSpark } from "./usage-card.js";

const logoSrc = () => agents().some(a => a.status === "working")
  ? "mods/harns-chrome/harness-logo-fade.webp"
  : "mods/harns-chrome/harness-logo-bob.webp";

const RAIL = 52;

/** To the rail (on macOS wide enough for the traffic lights), or back to the width it had. */
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : RAIL });
}

export default class WorkspaceChrome extends View {
  /**
   * Puts the chosen colours back on at start: an install writes the layout with the Monochrome theme, so the brand bar
   * switches to the colour theme when that's the choice in harns's settings.
   */
  init(_props, cx) {
    if (props()?.footer) return;
    const name = themeToApply(shared(COLORS_KEY), layout()?.theme);
    if (name) run("app.theme", { name });
    this.orbs = new OrbPool(cx, "harns-chrome", 1);
  }

  /**
   * The harns logo, animated while agents work; in Monochrome an orb instead, a listening wave.
   */
  logo(t) {
    const orb = orbsOn(t) && this.orbs?.begin().orb("listening");
    return orb ? h_flex().size(28).items_center().justify_center().child(orb) : image(logoSrc()).size(28).rounded(5);
  }

  button(id, label, action, size = 26, tip = null) {
    const t = theme();
    return div().id(id).size(size).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .when(Boolean(tip), el => el.tooltip(tip))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
  /**
   * Usage in the footer, at its right end, from the sidebar's shared reading: seven days of columns and today's tokens.
   * Resting on it a moment hangs the two-week card beside the sidebar, `edge` px away (the footer's padding), level
   * with it.
   */
  usage(t, edge) {
    const state = shared("usage.tokens");
    const days = (this.usageMemo = usageDays(state, this.usageMemo)).days;
    return div().id("usage-footer").relative().flex_none()
      .on_hover((on, cx) => {
        this.usageTimer?.cancel();
        if (on) this.usageTimer = cx.timer.after(450, cx => { this.usageOpen = true; cx.notify(); });
        else if (this.usageOpen) { this.usageOpen = false; cx.notify(); }
      })
      .child(usageSpark(t, days, { icon: "mods/harns-chrome/icons/coins.svg" }))
      .child(Popup.new("usage-footer-card", div()).absolute().top(-1).right(-1).size(1)
        .when(Boolean(this.usageOpen), pop => pop.content(div().pl(edge)
          .child(usageDetails(t, days, { icon: "mods/harns-chrome/icons/coins.svg", errors: state?.errors })))));
  }

  /**
   * The folded footer: one gear (with the update dot when an update is ready) that opens a small menu beside the rail
   * with what the open footer shows side by side: Settings, Add machine and harns's Settings. A pick, a press outside
   * or Escape closes it.
   */
  railMenu(t, ready, actions) {
    const item = (id, icon, name, action, extra = null) => h_flex().id(`rail-menu-${id}`).h(30).px(8).gap(10).items_center().rounded(6)
      .cursor_pointer().hover(s => s.bg(t.hover))
      .on_click((e, cx) => { this.menuOpen = false; cx.notify(); action(e, cx); })
      .child(svg(`mods/harns-chrome/icons/${icon}.svg`).size(15).flex_none().text_color(t.muted))
      .child(div().flex_1().text_size(13).text_color(t.foreground).child(name))
      .when(Boolean(extra), el => el.child(extra));
    const gear = div().id("rail-gear").relative().size(28).flex().items_center().justify_center().rounded(7).cursor_pointer()
      .bg(this.menuOpen ? t.hover : "#00000000").text_color(this.menuOpen ? t.foreground : t.muted)
      .hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip(ready ? "Settings · update ready" : "Settings")
      .child(svg("mods/harns-chrome/icons/settings.svg").size(15))
      .when(ready, el => el.child(div().absolute().top(3).right(3).size(6).rounded_full().bg(t.accent)));
    return Popover.new("rail-menu").open(Boolean(this.menuOpen)).anchor("bottom_left")
      .on_open_change((open, cx) => { this.menuOpen = open; cx.notify(); })
      .trigger(gear)
      .content(v_flex().w(210).ml(40).mb(-34).p(5).gap(1).rounded(9).border_1().border_color(t.border).bg(t.popover ?? t.raised).shadow_md()
        .child(item("settings", "settings", "Settings", actions.settings, ready
          ? h_flex().gap(5).items_center().child(div().size(6).rounded_full().bg(t.accent)).child(div().text_size(11).text_color(t.dim).child("update"))
          : null))
        .child(item("machine", "server", "Add machine", actions.machine))
        .child(item("harns", "harness-logo-mono", "harns settings", actions.harns)));
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      const size = collapsed ? 24 : 28;
      const icon = (id, name, tip, action, dot = false) => div().id(id).relative().size(size).flex_none().flex().items_center().justify_center()
        .rounded(7).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer().tooltip(tip)
        .on_click(action).child(svg(`mods/harns-chrome/icons/${name}.svg`).size(15))
        .when(dot, el => el.child(div().absolute().top(3).right(3).size(6).rounded_full().bg(t.accent)));
      const ready = Boolean(updates().app.ready);
      const actions = {
        settings: () => run("app.settings"),
        machine: () => run("mod.open", { name: "machine-add" }),
        harns: () => openOverlay({ mod: "harns-settings", kind: "dialog", width: 760 }),
      };
      if (collapsed) return h_flex().size_full().bg(t.surface).items_center().justify_center().child(this.railMenu(t, ready, actions));
      const gear = icon("settings", "settings", ready ? "Settings · update ready" : "Settings", actions.settings, ready);
      const machine = icon("machine", "server", "Add machine", actions.machine);
      const harns = icon("harns-settings", "harness-logo-mono", "harns settings", actions.harns);
      return h_flex().size_full().bg(t.surface).items_center().gap(2).px(12).child(gear).child(machine).child(harns)
        .when(usagePlace(shared("harness.usage")) === "footer", el => el.child(div().flex_1()).child(this.usage(t, 12)));
    }
    return h_flex().size_full().bg(t.surface).pl(collapsed ? 6 : 12).pr(10).gap(4).items_center().text_size(13.5)
      .when(collapsed, el => el.pl(0).pr(0).justify_center().child(this.button("sidebar-expand", this.logo(t), toggleSidebar, 28, "Expand sidebar").cursor_pointer()))
      .when(window()?.platform === "macos" && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center()
        .child(this.button("sidebar-collapse-logo", this.logo(t), toggleSidebar, 28, "Collapse sidebar"))
        .child(div().text_size(16).font_semibold().text_color(t.foreground).child("harns"))))
      .when(!collapsed, el => el.child(this.button("home", svg("mods/harns-chrome/icons/home.svg").size(15), () => showHome(run, layout, setShared), 26, "Home")));
  }
}
