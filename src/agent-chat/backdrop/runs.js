/** Runs of one row: [{col, len, text, fg, bg}], left to right, empty stretches skipped. */
export function rowRuns(glyph, fg, bg, cols, row) {
  const out = [];
  const start = row * cols, end = start + cols;
  let i = start;
  while (i < end) {
    while (i < end && glyph[i] === " " && bg[i] === null) i++;
    if (i >= end) break;
    const from = i, runBg = bg[i];
    let runFg = glyph[i] === " " ? null : fg[i];
    let text = glyph[i++];
    let lastInk = i;
    while (i < end && bg[i] === runBg) {
      const g = glyph[i];
      if (g !== " ") {
        if (runFg === null) runFg = fg[i];
        else if (fg[i] !== runFg) break;
      }
      text += g;
      i++;
      if (g !== " " || runBg !== null) lastInk = i;
    }
    const len = lastInk - from;
    if (len < text.length) { text = text.slice(0, len); i = lastInk; }
    out.push({ col: from - start, len, text, fg: runFg, bg: runBg });
  }
  return out;
}

/** Every row's runs. */
export function frameRuns(cells) {
  const rows = [];
  for (let r = 0; r < cells.rows; r++) rows.push(rowRuns(cells.glyph, cells.fg, cells.bg, cells.cols, r));
  return rows;
}
