export const FPS = 30;
export const SLOW_FPS = 8;
export const IDLE_MS = 1000;

/** Cells for JetBrains Mono (a 0.6 em advance) at `font` px: glyphs abut, rows have a little air. */
export function cellSize(font = 13) {
  return { font, cw: font * 0.6, ch: Math.round(font * 1.3) };
}
