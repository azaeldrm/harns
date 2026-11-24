import { View, div, image } from "gpui-kit";
import { theme } from "herdr";
import { ORB_CLIPS } from "./orb-clips.js";
import { orbsOn } from "./orb-states.js";
import { zoomFrom } from "./measure.js";

export { orbsOn, workState, WORK_STATES } from "./orb-states.js";

/** Where every orb's time starts, so orbs side by side move together and a redraw never sets one back. */
const CLOCK = Date.now();

/** The frame of a sheet the shared clock is on now. */
const frameAt = clip => Math.floor((Date.now() - CLOCK) * clip.fps / 1000) % clip.frames;

/** How many orb views exist, which gives each one's window an id of its own. */
let made = 0;

/**
 * One orb as its own view, showing one frame of the sheets scripts/render-orbs.py drew of it (`orbs/<state>-<size>/
 * <row>.webp`, one row of frames each, carried in the mod's own folder): the row holding the frame the shared clock is on
 * sits in a window one frame wide, slid sideways to that frame. A row is a sheet of its own because herdr draws a
 * picture slid upwards inside its window a little narrower than its size, so on a sheet of several rows an orb drifted
 * several pixels along every row but the first and jumped back at the next. It redraws alone when the clock has reached
 * a new frame, looking every 8 ms, about twice a frame, so the redraw lands in the screen refresh the frame falls in
 * rather than one late (Windows timers fire only every 15.6 ms, so there it looks about once a frame), while it's drawn.
 * Looking redraws nothing: only a new frame does.
 * Once its redraws stop being drawn (taken off screen, or the window covered or asleep for a moment) it asks only once
 * a second, so it picks up again by itself when shown: a view whose owner seldom redraws (the top bar's logo) would
 * otherwise stay still for good. A redraw chooses a frame and places one picture, nothing more.
 *
 * The window is held to a whole number of screen pixels (its size at the app's zoom, which it reads from its own laid
 * out width, rounded), so each frame's step along the sheet is whole pixels too: at a zoom like 1.3 a 64 px orb is
 * 83.2 pixels, and the sheet, moved by fractions, rounded to a different pixel every frame. A large orb still shook
 * this way, so Home's is drawn live instead (live-orb.js).
 */
class Clip extends View {
  init(p, cx) {
    this.pool = p.pool;
    this.slot = p.slot;
    this.drawn = 0;
    this.frame = -1;
    this.zoom = 1;
    this.id = `orb-${++made}`;
    this.asked = 0;
    const tick = cx => {
      const want = this.pool.wants[this.slot], now = Date.now();
      const live = now - this.drawn < 500;
      if (want && (live ? frameAt(want.clip) !== this.frame : now - this.asked >= 1000)) { this.asked = now; cx.notify(); }
      cx.timer.after(want ? 8 : 250, tick);
    };
    cx.timer.after(16, tick);
  }

  render() {
    const want = this.pool.wants[this.slot];
    if (!want || orbsOn(theme()) === false) return div();
    const { clip, size: wanted, src } = want;
    this.drawn = Date.now();
    const n = this.frame = frameAt(clip);
    const pixels = Math.max(1, Math.round(wanted * this.zoom));
    const size = pixels / this.zoom;
    return div().id(this.id).relative().overflow_hidden().size(size).min_w(size).max_w(size).flex_none()
      .on_size_change((got, cx) => {
        const zoom = zoomFrom(got, size);
        if (Math.abs(Math.round(wanted * zoom) - Math.round(wanted * this.zoom)) >= 1) { this.zoom = zoom; cx.notify(); }
      })
      .child(image(`${src}/${Math.floor(n / clip.cols)}.webp`).absolute().left(-(n % clip.cols) * size).top(0)
        .w(clip.cols * size).h(size));
  }
}

/**
 * A fixed set of orb views a view makes in its `init` (views can't be made while rendering) and hands out as it
 * renders: `begin()` at the top of a render, then `orb(state, size)` for each place that wants an orb, which answers
 * one of the pool's views to mount there, or null once all are handed out (or for a clip there's no sheet of), in a
 * box held to the orb's size, so the sheet sliding behind it never widens what holds it (Home centres its orb). The
 * sheets exist for the states harns shows: each working state, listening and breathing at 20.
 */
export class OrbPool {
  constructor(cx, mod, count) {
    this.mod = mod;
    this.wants = Array(count).fill(null);
    this.used = 0;
    this.views = Array.from({ length: count }, (_, slot) => cx.new(Clip, { pool: this, slot }));
  }

  begin() {
    this.wants.fill(null);
    this.used = 0;
    return this;
  }

  orb(state, size = 20) {
    const clip = ORB_CLIPS[`${state}-${size}`];
    if (!clip || this.used >= this.views.length) return null;
    this.wants[this.used] = { clip, size, src: `mods/${this.mod}/orbs/${state}-${size}` };
    return div().size(size).min_w(size).max_w(size).flex_none().overflow_hidden().child(this.views[this.used++]);
  }
}
