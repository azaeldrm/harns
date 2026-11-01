import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, panes, focused, theme, run, window, shared } from "herdr";

import MachineData from "./machine-data.js";

export default class WorkspaceStatus extends MachineData {
  render() {
    const t = theme();
    const all = spaces();
    const space = all.find(s => s.active);
    // Agents belong to a space; count only those on the same machine as the shown space.
    const machine = space?.machine ?? null;
    const machineOf = new Map(all.map(s => [s.id, s.machine]));
    const list = agents().filter(a => machineOf.get(a.space) === machine);
    const needs = list.filter(a => a.status === "blocked").length;
    const focus = focused();
    const allPanes = panes();
    const pane = allPanes.find(p => p.pane === focus?.pane) ?? allPanes.find(p => p.focused);
    const cwd = focus?.cwd ?? pane?.cwd ?? space?.folder;
    const folder = String(cwd ?? "").replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) ?? "";
    const usage = (shared('machine.usage') ?? {})[machine ?? '@local'] ?? {};
    const usageGroup = name => {
      const limits = [usage[name], usage[name]?.secondary].filter(Boolean);
      const bar = (label, pattern, opacity) => {
        const limit = limits.find(item => pattern.test(item.window ?? ''));
        const known = Number.isFinite(limit?.used);
        const percent = known ? Math.max(0, Math.min(100, limit.used)) : 0;
        return h_flex().flex_none().gap(4).items_center()
          .tooltip(`${name} ${label}: ${known ? `${Math.round(percent)}% used` : 'unavailable'}${limit?.reset ? ` · resets ${limit.reset}` : ''}`)
          .child(div().w(14).flex_none().text_size(9).text_color(t.dim).child(label))
          .child(div().w(44).h(4).rounded(2).bg(t.border)
            .when(known, el => el.child(div().w(`${percent}%`).h(4).rounded(2).bg(percent > 90 ? '#d88179' : t.accent).opacity(percent > 90 ? 1 : opacity))));
      };
      const weekly = this.usageHover === name;
      return h_flex().id(`bottom-usage-${name.toLowerCase()}`).flex_none().gap(8).items_center()
        .on_hover((on, cx) => {
          if (on) this.usageHover = name;
          else if (this.usageHover === name) this.usageHover = null;
          cx.notify();
        })
        .child(svg(name === 'Claude' ? 'icons/claude.svg' : 'brand-assets/chatgpt-knot.svg').size(14).flex_none().text_color(t.muted))
        .child(weekly ? bar('7d', /^(7d|weekly)$/i, 0.5) : bar('5h', /^(5h|5-hour)$/i, 1));
    };
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/harness-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.surface).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? shared("machine.local-label") ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .when(Boolean(folder), el => el.child(label("folder", folder)))
      .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`${needs} needs you`)))
      .child(div().flex_1())
      .child(h_flex().flex_none().gap(18).items_center().child(usageGroup('Claude')).child(usageGroup('Codex')))
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(`${window()?.platform === "macos" ? "⌘" : "Ctrl"} Shift P  commands`));
  }
}
