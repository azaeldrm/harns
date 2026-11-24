import { View, div } from "gpui-kit";
import { resolvePreset, MODE_FRAMES } from "./vendor/thinking-orbs/engine.es.js";

/** Where every live orb's time starts. */
const CLOCK = Date.now();

/** A dot's colour: the engine's paper value mirrored for a dark theme, as its own painter and render-orbs.py draw it. */
const ink = d => {
  const g = Math.round((1 - d.white) * 252).toString(16).padStart(2, "0");
  const a = Math.round(255 * Math.max(0, Math.min(1, d.a ?? 1))).toString(16).padStart(2, "0");
  return `#${g}${g}${g}${a}`;
};

/**
 * A large orb drawn live from the vendored thinking-orbs engine (props `{ state, size }`): each of its dots a round box
 * at the engine's own place for it now, redrawn every 16 ms while it's drawn and asked for once a second while it
 * isn't, so it picks up again when shown. Home's shaping orb is drawn this way, not from a sprite sheet: herdr placed
 * a sheet slid inside its window a pixel or two off from frame to frame, and the orb shook, while round boxes move
 * smoothly by fractions of a pixel. It's 24 dots, no lines.
 */
export class LiveOrb extends View {
  init(p, cx) {
    this.size = p.size;
    const { mode, speed, opts } = resolvePreset(p.state, p.size);
    this.frame = seconds => MODE_FRAMES[mode](p.size, seconds * speed, opts);
    this.drawn = 0;
    this.asked = 0;
    const tick = cx => {
      const now = Date.now();
      if (now - this.drawn < 500 || now - this.asked >= 1000) { this.asked = now; cx.notify(); }
      cx.timer.after(16, tick);
    };
    cx.timer.after(16, tick);
  }

  render() {
    this.drawn = Date.now();
    const { dots } = this.frame((Date.now() - CLOCK) / 1000);
    const s = this.size;
    return div().relative().size(s).min_w(s).max_w(s).flex_none()
      .children(dots.map(d => div().absolute().left(d.x - d.r).top(d.y - d.r).size(2 * d.r).rounded_full().bg(ink(d))));
  }
}
