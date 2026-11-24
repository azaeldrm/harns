import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, agents } from "herdr";
import { alertColors } from "./tones.js";
import { toastTone } from "./tone.js";

/** The dot's colour by a notification's level, for those that aren't an agent's alert. */
const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

/**
 * How harns shows notifications (the layout's `toast`), as herdr's own toast does, with its dot in the alert's colour:
 * green when an agent finished, red when one needs you (tone.js), the theme's colours for the rest. A click runs its
 * action (going to the agent) and dismisses it; a machine needing a login offers its command to copy.
 */
export default class Toast extends View {
  render() {
    const t = theme();
    const p = props() ?? {};
    const tone = toastTone(p, agents());
    const dot = tone === "done" ? alertColors(t).done : tone === "blocked" ? t.blocked : t[DOT[p.level] ?? "accent"];
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    return h_flex()
      .id("toast")
      .size_full()
      .px(18)
      .gap(12)
      .items_center()
      .bg(t.popover)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .child(p.icon ? image(p.icon).w(18).h(18).flex_none() : div().size(8).rounded(4).flex_none().bg(dot))
      .child(
        v_flex()
          .flex_1()
          .overflow_hidden()
          .child(div().truncate().font_semibold().text_size(13).text_color(t.foreground).child(login ? `${login[1]} needs a login: run` : p.title ?? ""))
          .when(!login && Boolean(p.body), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(p.body ?? "")))
          .when(Boolean(login), (el) => el.child(h_flex().gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().tooltip(command).text_size(12).text_color(t.muted).child(command))
            .child(div().id("toast-login-copy").flex_none().px(6).py(3).rounded(4).bg(t.raised)
              .text_size(12).text_color(t.foreground).cursor_pointer().hover(s => s.bg(t.hover))
              .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
              .child(this.copied ? "Copied" : "Copy")))),
      );
  }
}
