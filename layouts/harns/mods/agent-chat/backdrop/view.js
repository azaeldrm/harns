import { View, div } from "gpui-kit";
import { theme, shared, window as appWindow } from "herdr";
import { Palette } from "./palette.js";
import { frameRuns } from "./runs.js";
import { sceneFor } from "./scenes/index.js";
import { FPS, SLOW_FPS, IDLE_MS, cellSize } from "./config.js";
import { designPx, zoomFrom, PROBE_PX } from "../measure.js";

export class BackdropView extends View {
  init(props, cx) {
    this.dim = props?.dim ?? 1;
    this.slow = Boolean(props?.slow);
    this.cell = cellSize();
    this.sceneKey = props?.sceneKey ?? null;
    this.show(this.wanted());
    this.zoom = 1;
    this.px = null;
    this.rows = [];
    this.drawn = true;
    this.mode = null;
    this.speed("fast", cx);
  }

  /** A new dim or pace from the parent. The pace takes effect at the next tick, which has the context to restart the
   *  timer. */
  update(props) {
    this.slow = Boolean(props?.slow);
    const dim = props?.dim ?? 1;
    if (dim !== this.dim) { this.dim = dim; if (this.size) this.scene.setDim(dim); }
  }

  /** The scene shared state asks for. */
  wanted() { return sceneFor(this.sceneKey ? shared(this.sceneKey) : null).id; }

  /** Starts the scene with this id afresh (the first scene for an unknown one), on the size the view has. */
  show(id) {
    const entry = sceneFor(id);
    this.sceneId = entry.id;
    this.scene = entry.make();
    this.rows = [];
    this.size = null;
    this.layout();
  }

  speed(mode, cx) {
    const every = mode === "fast" ? Math.round(1000 / (this.slow ? SLOW_FPS : FPS)) : IDLE_MS;
    if (this.mode === mode && this.every === every) return;
    this.task?.cancel();
    this.mode = mode;
    this.every = every;
    this.task = cx.timer.every(every, cx => this.tick(cx));
  }

  /**
   * One step of the animation: a frame while it's drawn and the window is in front, else a slow look (idle). render()
   * sets `drawn`, so a tick that finds it unset since the last one knows nothing drew the view.
   */
  tick(cx) {
    const drawn = this.drawn;
    this.drawn = false;
    if (this.wanted() !== this.sceneId) { this.show(this.wanted()); this.speed("fast", cx); }
    if (!drawn || !appWindow()?.active || !this.size) { this.speed("idle", cx); cx.notify(); return; }
    this.speed("fast", cx);
    this.scene.frame(1 / FPS, this.palette());
    this.rows = frameRuns(this.scene.grid);
    cx.notify();
  }

  palette() {
    const t = theme();
    const key = `${t.background}|${t.foreground}|${t.accent}|${t.done}`;
    if (key !== this.paletteKey) { this.paletteKey = key; this.pal = new Palette(t); }
    return this.pal;
  }

  /** The scene over the view's size (this.px, as reported: zoomed), in the unzoomed px that .w() and .left() take. */
  layout() {
    if (!this.px || !this.scene) return;
    const width = designPx(this.px.width, this.zoom), height = designPx(this.px.height, this.zoom);
    if (width < 40 || height < 40) { this.size = null; return; }
    if (this.size && Math.abs(this.size.width - width) < 1 && Math.abs(this.size.height - height) < 1) return;
    this.size = { width, height };
    const { cw, ch } = this.cell;
    this.scene.resize(width, height, cw, ch);
    this.scene.setDim(this.dim);
  }

  /**
   * Where the pointer is, for the scene to react to (e.local_position: in the view, zoomed px). Whether it was there.
   */
  pointer(e, active) {
    const at = e.local_position;
    if (!this.size || !at) return false;
    const p = this.scene.pointer;
    p.x = designPx(at.x, this.zoom);
    p.y = designPx(at.y, this.zoom);
    p.active = active;
    return true;
  }

  render(cx) {
    this.drawn = true;
    if (this.mode === "idle" && !this.waking && this.size && appWindow()?.active) {
      this.waking = true;
      cx.timer.after(0, cx => { this.waking = false; this.tick(cx); });
    }
    const { cw, ch, font } = this.cell;
    const rows = this.rows;
    const runs = [];
    for (let r = 0; r < rows.length; r++) {
      for (const u of rows[r]) {
        let el = div().absolute().left(u.col * cw).top(r * ch).w(u.len * cw).h(ch).overflow_hidden().whitespace_nowrap().child(u.text);
        if (u.fg) el = el.text_color(u.fg);
        if (u.bg) el = el.bg(u.bg);
        runs.push(el);
      }
    }
    return div().id("backdrop").absolute().inset_0().overflow_hidden()
      .font_family("JetBrains Mono").text_size(font).line_height(`${ch}px`)
      .on_size_change((size, cx) => { this.px = size; if (designPx(size.width, this.zoom) > 0) this.layout(); cx.notify(); })
      .on_mouse_move(e => this.pointer(e, true))
      .on_hover((hovered, cx) => { if (!hovered) this.scene.pointer.active = false; })
      .on_mouse_down("left", (e, cx) => { if (this.pointer(e, true)) this.scene.splash(this.scene.pointer.x, this.scene.pointer.y); })
      .child(div().id("backdrop-zoom").absolute().top(0).left(-30000).w(PROBE_PX).h(PROBE_PX)
        .on_size_change((size, cx) => { const z = zoomFrom(size); if (Math.abs(z - this.zoom) > 0.001) { this.zoom = z; this.layout(); cx.notify(); } }))
      .children(runs);
  }

  close() { this.task?.cancel(); }
}
