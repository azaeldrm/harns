/** The shared state key holding which colours harns wears: "harns", "mono" or "lively". */
export const COLORS_KEY = "harness.colors";

/** Each colour choice and the theme file (`themes/<name>.json`) that gives it. */
export const COLOR_THEMES = { harns: "harness-color", mono: "harness", lively: "harness-lively" };

/** The colour choice kept in shared state, `stored`; Monochrome until one is made. */
export const colorChoice = stored => (stored in COLOR_THEMES ? stored : "mono");

/**
 * The theme to switch to so the window wears the chosen colours, or null when nothing needs doing. Only a harns theme
 * is ever swapped for the other, so a theme picked in herdr's own theme menu is left alone. `stored` is the shared
 * choice and `current` the shown layout's root `theme`.
 */
export function themeToApply(stored, current) {
  const wanted = COLOR_THEMES[colorChoice(stored)];
  const ours = Object.values(COLOR_THEMES);
  return typeof current === "string" && ours.includes(current) && current !== wanted ? wanted : null;
}
