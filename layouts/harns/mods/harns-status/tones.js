/** `#rrggbb` as [r, g, b]; black for anything else. */
const rgb = c => {
  const m = /^#?([0-9a-f]{6})/i.exec(String(c ?? ""));
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** A colour `f` (0..1) of the way from `a` to `b`, both `#rrggbb`. */
const mix = (a, b, f) => {
  const [x, y] = [rgb(a), rgb(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * f).toString(16).padStart(2, "0")).join("");
};

/** The accent of harns's logo theme, which marks a theme as the logo's. */
const LOGO_TEAL = "#5ccfcb";

/**
 * What each family of theme colours that a theme file can't hold: `range`, the stops a bar passes through from empty
 * to full (or from calm to urgent), evenly spaced; `calm`, when given, the share up to which the range keeps to its
 * calm stops, its last stop (an alarm) blended in only past it: Monochrome climbs through grays to its whitest white
 * and turns red only in the last stretch. `series`, a chart's colours, or null to keep each series' own; `backdrop`,
 * the chat scenes' highlights (null entries take the theme's accent and done); `brand`, whether program icons show
 * their own colours rather than one tint.
 */
const FAMILIES = {
  harns: {
    range: ["#5ccfcb", "#b2dec8", "#f8c55e", "#ffa422"], series: ["#05b9c5", "#72cabf", "#f8c55e", "#ffa422"],
    backdrop: [null, "#72cabf", "#f8c55e", "#ffa422"], brand: false,
  },
  mono: {
    range: ["#9a9fa2", "#b4b8ba", "#c8cccd", "#dadcdd", "#eceeef", "#d88179"], calm: 0.85, series: ["#eceeef", "#b9bdbf", "#8a9093", "#5f6569"],
    backdrop: [null, "#9a9fa2", "#dededb", "#71777b"], brand: false,
  },
  lively: {
    range: ["#6cc48a", "#e9aa35", "#e8823a", "#d88179"], series: null,
    backdrop: [null, null, "#d88179", "#8eafc2"], brand: true,
  },
};

/** Whether theme `t` is monochrome: its accent is a gray, its channels within a few steps of each other. */
export function monochrome(t) {
  const [r, g, b] = rgb(t?.accent);
  return Boolean(t?.accent) && Math.max(r, g, b) - Math.min(r, g, b) <= 12;
}

/**
 * The family theme `t` belongs to: "harns" (the logo's teal accent), "mono" (a gray accent) or "lively" (any other,
 * herdr's own themes included, so a mod used outside harns keeps its colours).
 */
export function family(t) {
  if (String(t?.accent ?? "").toLowerCase() === LOGO_TEAL) return "harns";
  return monochrome(t) ? "mono" : "lively";
}

/** The colour `f` (0..1) of the way along `stops`, evenly spaced, blended between the two around it. */
const along = (stops, f) => {
  const at = Math.min(stops.length - 1, f * (stops.length - 1));
  const i = Math.min(stops.length - 2, Math.floor(at));
  return mix(stops[i], stops[i + 1], at - i);
};

/**
 * The colour at `share` (0 empty or calm, 1 full or urgent) along theme `t`'s range, blended between its stops; past
 * its family's `calm` share, from its last calm stop towards the alarm.
 */
export function rangeColor(t, share) {
  const { range: stops, calm = 1 } = FAMILIES[family(t)];
  const s = Math.min(1, Math.max(0, Number(share) || 0));
  if (calm >= 1) return along(stops, s);
  return s <= calm ? along(stops.slice(0, -1), s / calm) : mix(stops[stops.length - 2], stops[stops.length - 1], (s - calm) / (1 - calm));
}

/** The share of theme `t`'s range before any alarm shows: 1 when its whole range is one scale (harns, Lively). */
export const rangeCalm = t => FAMILIES[family(t)].calm ?? 1;

/** The theme's brightest mark for `t`: Monochrome's whitest white (its working), else its accent. */
export const brightest = t => family(t) === "mono" ? t?.working ?? t?.accent : t?.accent;

/**
 * The colours of marks past a limit, for theme `t`: `warn` (getting full), `crit` (nearly full, or an agent asking),
 * `healthy` (plenty left) and `done` (an agent finished), all from its range and its own done.
 */
export function alertColors(t) {
  const stops = FAMILIES[family(t)].range;
  return { warn: stops[stops.length - 2], crit: stops[stops.length - 1], healthy: stops[0], done: t?.done ?? stops[0] };
}

/** The colour series `i` of a chart draws in theme `t`: its family's, or the series' own `color` in Lively. */
export function seriesColor(t, color, i) {
  const series = FAMILIES[family(t)].series;
  return series ? series[i % series.length] : color;
}

/** The highlight colours the chat's backdrop scenes draw with, for theme `t`. */
export function backdropAccents(t) {
  const fallback = [t?.accent ?? "#e9aa35", t?.done ?? "#10a7a7"];
  return FAMILIES[family(t)].backdrop.map((c, i) => c ?? fallback[i] ?? fallback[0]);
}

/**
 * Whether program `p` (herdr's program entry) shows its icon in its own colours in theme `t`: only an agent's, and
 * only in Lively. Shells, Python and other programs keep one tint, their icons being shapes drawn to be tinted.
 */
export const brandIcons = (t, p) => FAMILIES[family(t)].brand && Boolean(p?.agent);
