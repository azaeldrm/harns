import { resolvePreset, MODE_FRAMES } from "../src/shared/vendor/thinking-orbs/engine.es.js";

/**
 * Draws one orb of the vendored thinking-orbs engine as a seamless loop and writes it to stdout for
 * scripts/render-orbs.py to encode: a JSON header line ({ frames, side, fps, loop }), then each frame's straight RGBA
 * bytes. The loop ends where the orb comes back closest to where it began, and its last second crossfades into its first
 * frame, so a motion that never repeats exactly still loops without a jump. Ink is
 * the engine's paper value mirrored for a dark theme, as its own canvas painter does. Run as
 * `node scripts/orb-frames.mjs <state> <size> <scale> [fps]`.
 */
const [state, sizeArg, scaleArg, fpsArg] = process.argv.slice(2);
const size = Number(sizeArg), scale = Number(scaleArg), fps = Number(fpsArg ?? 60);
const side = Math.round(size * scale);
const { mode, speed, opts } = resolvePreset(state, size);
const frame = seconds => MODE_FRAMES[mode](size, seconds * speed, opts);

/** How far apart two frames' dots lie: the farthest any dot of either is from its nearest match in the other. */
function apart(a, b) {
  const one = (p, q) => {
    let most = 0;
    for (const d of p) {
      let near = Infinity;
      for (const e of q) near = Math.min(near, Math.hypot(d.x - e.x, d.y - e.y) + Math.abs(d.r - e.r) + Math.abs(d.white - e.white));
      most = Math.max(most, near);
    }
    return most;
  };
  return Math.max(one(a, b), one(b, a));
}

/**
 * The loop's length in frames: the soonest, from 2 to 16 seconds on, that the orb comes back as close to its first
 * frame as it ever does in that time (within a twentieth of a pixel), so a motion that truly repeats loops once.
 */
function loopFrames(start) {
  const first = frame(start).dots;
  const gaps = [];
  for (let n = 2 * fps; n <= 16 * fps; n++) gaps.push([n, apart(first, frame(start + n / fps).dots)]);
  const best = Math.min(...gaps.map(([, gap]) => gap));
  return gaps.find(([, gap]) => gap <= best + 0.05)[0];
}

/** Subsample offsets within a pixel, 4 by 4, for antialiased coverage. */
const SUB = Array.from({ length: 16 }, (_, i) => [((i % 4) + 0.5) / 4, (Math.floor(i / 4) + 0.5) / 4]);

/** One frame drawn premultiplied (gray × alpha, alpha) at the output side: the web's lines first, then the dots. */
function raster(f) {
  const ink = new Float32Array(side * side), alpha = new Float32Array(side * side);
  const lay = (x0, y0, x1, y1, inside, gray, a) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(side, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(side, Math.ceil(x1)); x++) {
        let hit = 0;
        for (const [sx, sy] of SUB) if (inside(x + sx, y + sy)) hit++;
        if (!hit) continue;
        const k = a * hit / 16, i = y * side + x;
        ink[i] = gray * k + ink[i] * (1 - k);
        alpha[i] = k + alpha[i] * (1 - k);
      }
    }
  };
  const gray = white => (1 - white) * 252 / 255;
  for (const l of f.lines) {
    const x1 = l.x1 * scale, y1 = l.y1 * scale, x2 = l.x2 * scale, y2 = l.y2 * scale, h = l.w * scale / 2;
    const dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy || 1;
    const inside = (px, py) => {
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
      return Math.hypot(px - x1 - t * dx, py - y1 - t * dy) <= h;
    };
    lay(Math.min(x1, x2) - h, Math.min(y1, y2) - h, Math.max(x1, x2) + h, Math.max(y1, y2) + h, inside, gray(l.white), l.a ?? 1);
  }
  for (const d of f.dots) {
    const cx = d.x * scale, cy = d.y * scale, r = d.r * scale;
    lay(cx - r, cy - r, cx + r, cy + r, (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r, gray(d.white), d.a ?? 1);
  }
  return { ink, alpha };
}

const crossfade = Math.round(fps);
const start = crossfade / fps;
const frames = loopFrames(start);
process.stdout.write(JSON.stringify({ frames, side, fps, loop: frames / fps }) + "\n");
const out = Buffer.alloc(side * side * 4);
for (let n = 0; n < frames; n++) {
  const now = raster(frame(start + n / fps));
  const k = Math.max(0, (n - (frames - crossfade)) / crossfade);
  const back = k > 0 ? raster(frame(start + (n - frames) / fps)) : null;
  for (let i = 0; i < side * side; i++) {
    const a = back ? now.alpha[i] * (1 - k) + back.alpha[i] * k : now.alpha[i];
    const g = back ? now.ink[i] * (1 - k) + back.ink[i] * k : now.ink[i];
    const v = a > 0 ? Math.round(g / a * 255) : 0;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = Math.round(a * 255);
  }
  process.stdout.write(Buffer.from(out));
}
