import { folderName } from "./paths.js";

/**
 * A title without the spinner or status glyphs an agent puts before it: whatever leads it that isn't a letter, digit,
 * opening bracket or quote, so a title that starts "(Skill)" or "[WIP]" keeps it.
 */
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}"'`]+/u, "").trim();

/**
 * The name an agent gives its conversation, read from the terminal title it sets (`Claude Code - fix the login`),
 * without the agent's own name or the folder around it; "" when the title says nothing beyond the agent, a path or a
 * prompt. `pane` is an entry of herdr's panes() or agents().
 */
export function sessionTitle(pane) {
  const prog = pane?.program?.name;
  const live = clean(pane?.title);
  const prefixes = [prog, pane?.program?.key, pane?.app === "pi" ? "\u03c0" : null].filter(Boolean);
  const separators = [" - ", " \u2014 ", " \u2013 ", " | ", ": "];
  let session = live;
  for (const prefix of prefixes) {
    const start = session.toLowerCase();
    const name = prefix.toLowerCase();
    const separator = separators.find(s => start.startsWith(`${name}${s}`));
    if (separator) { session = session.slice(prefix.length + separator.length).trim(); break; }
  }
  const folder = folderName(pane?.cwd);
  const suffix = folder && separators.find(s => session.endsWith(`${s}${folder}`));
  if (suffix) session = session.slice(0, -(suffix.length + folder.length)).trim();
  else if ((pane?.app === "codex" || pane?.program?.key === "codex") && session.includes(" | ")) session = session.slice(0, session.lastIndexOf(" | ")).trim();
  const telling = session && session !== prog && !/^\S*[\\/]\S*$/.test(session) && !session.includes("@") && session.toLowerCase() !== pane?.program?.key && session !== folder;
  return telling ? session : "";
}
