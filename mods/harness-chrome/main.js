import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, agents } from "herdr";

const logoSrc = () => agents().some(a => a.status === "working")
  ? "mods/harness-chrome/harness-logo-fade.webp"
  : "mods/harness-chrome/harness-logo-bob.webp";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

function toggleSidebar() {
  // To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 56 });
}

export default class WorkspaceChrome extends View {
  button(id, label, action, size = 26, tip = null) {
    const t = theme();
    return div().id(id).size(size).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .when(Boolean(tip), el => el.tooltip(tip))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      const row = (id, icon, label, dim, action) => h_flex().id(id).w_full().h(28).flex_none().px(8).gap(9).items_center().rounded(8)
        .when(collapsed, el => el.px(0).justify_center())
        .text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(action).child(svg(`mods/harness-chrome/${icon}.svg`).size(14))
        .when(!collapsed, el => el.child(label));
      const settings = row("settings", "settings", "Settings", false, () => run("app.settings"))
        .when(Boolean(updates().app.ready), el => el.child(div().size(6).rounded_full().bg(t.accent)));
      return v_flex().size_full().bg(t.surface).justify_end().px(8).pt(4).pb(8).text_size(13)
        .when(collapsed, el => el.px(0))
        .child(settings)
        .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
    }
    return h_flex().size_full().bg(t.surface).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(collapsed, el => el.pl(0).pr(0).child(div().flex_1().flex().items_center().justify_center()
        .child(this.button("sidebar-expand", image(logoSrc()).size(28).rounded(5), toggleSidebar, 34, "Expand sidebar").cursor_pointer())))
      .when(window()?.platform === "macos" && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center()
        .child(this.button("sidebar-collapse-logo", image(logoSrc()).size(28).rounded(5), toggleSidebar, 28, "Collapse sidebar"))
        .child(div().text_size(16).font_semibold().text_color(t.foreground).child("Harness"))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/harness-chrome/search.svg").size(15), () => run("mod.open", { name: "picker" }))))
      .when(!collapsed, el => el.child(this.button("sidebar-toggle", svg("mods/harness-chrome/sidebar.svg").size(15), toggleSidebar)));
  }
}
