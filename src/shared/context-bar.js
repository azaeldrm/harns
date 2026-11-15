import { shared } from "herdr";

/** Whether harns's Settings (Sidebar → Context bar) chose the health bar: the context left, draining, over what's used. */
export const healthBars = () => shared("harness.context-bar") === "health";

/**
 * The health bar for `used` (percent of the window in use), the same in the sidebar and the chat: the share left it
 * fills, green, amber below 45% left, red below 25%. Null while the fill is chosen, which each place colors its own way.
 */
export function healthFill(t, used) {
  if (!healthBars()) return null;
  const left = Math.max(0, 100 - used);
  return { share: left, color: left < 25 ? "#d88179" : left < 45 ? t.working : t.ansi2 ?? t.done };
}

/** The context as words, the same way everywhere: "62% left" with the health bar, "38% used" without. */
export const contextText = used => healthBars() ? `${Math.round(Math.max(0, 100 - used))}% left` : `${Math.round(used)}% used`;
