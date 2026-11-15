import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex, Popup } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, agents, openOverlay } from "herdr";
import { find, narrow } from "./layout.js";
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
      const gear = icon("settings", "settings", ready ? "Settings · update ready" : "Settings", () => run("app.settings"), ready);
      const machine = icon("machine", "server", "Add machine", () => run("mod.open", { name: "machine-add" }));
      const harns = icon("harns-settings", "harness-logo-mono", "harns settings",
        () => openOverlay({ mod: "harns-settings", kind: "dialog", width: 760 }));
      if (collapsed) return h_flex().size_full().bg(t.surface).items_center().justify_center().gap(2)
        .child(gear.w(22)).child(machine.w(22));
      return h_flex().size_full().bg(t.surface).items_center().gap(2).px(12).child(gear).child(machine).child(harns)
        .when(usagePlace(shared("harness.usage")) === "footer", el => el.child(div().flex_1()).child(this.usage(t, 12)));
    }
    return h_flex().size_full().bg(t.surface).pl(collapsed ? 6 : 12).pr(10).gap(4).items_center().text_size(13.5)
      .when(collapsed, el => el.pl(0).pr(0).justify_center().child(this.button("sidebar-expand", image(logoSrc()).size(28).rounded(5), toggleSidebar, 28, "Expand sidebar").cursor_pointer()))
      .when(window()?.platform === "macos" && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center()
        .child(this.button("sidebar-collapse-logo", image(logoSrc()).size(28).rounded(5), toggleSidebar, 28, "Collapse sidebar"))
        .child(div().text_size(16).font_semibold().text_color(t.foreground).child("harns"))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/harns-chrome/icons/search.svg").size(15), () => run("mod.open", { name: "picker" }))))
      .when(!collapsed, el => el.child(this.button("sidebar-toggle", svg("mods/harns-chrome/icons/sidebar.svg").size(15), toggleSidebar)));
  }
}
