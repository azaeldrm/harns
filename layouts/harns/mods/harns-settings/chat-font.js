/** The shared state key holding the chat's own font: a font's name, or nothing for herdr's. */
export const CHAT_FONT_KEY = "herdr-chat.font";

/** The fonts herdr ships, offered everywhere. */
const SHIPPED = ["Geist", "Geist Mono", "JetBrains Mono"];

/** Readable fonts each system has installed already, by herdr's `window().platform`. */
const SYSTEM = {
  windows: ["Segoe UI", "Verdana", "Georgia"],
  macos: ["Helvetica Neue", "Avenir Next", "Georgia"],
  linux: ["Noto Sans", "DejaVu Sans", "Noto Serif"],
};

/**
 * The chat font choices for `platform`: herdr's own font first (id "default"), then the shipped fonts, then the
 * system's readable ones, each as { id, name, about } with the font's name as its id.
 */
export function chatFonts(platform) {
  return [
    { id: "default", name: "Default", about: "herdr's font, as set in its Settings, like the rest of the window." },
    ...SHIPPED.map(name => ({ id: name, name, about: `${name}, which ships with herdr.` })),
    ...(SYSTEM[platform] ?? []).map(name => ({ id: name, name, about: `${name}, installed with the system.` })),
  ];
}

/** The chat's font from the shared value `stored`: its name, or null for herdr's own. */
export const chatFont = stored => (typeof stored === "string" && stored.trim() ? stored.trim() : null);
