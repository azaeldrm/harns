/**
 * The file a link in a message points at, as an absolute path with forward slashes, or null when it isn't a file (a web
 * address, an anchor). Agents write absolute paths, in angle brackets when they hold a space and often with a line
 * after a colon (`</srv/Knowledge Base/BACKLOG.md:188>`), `file://` URLs, or paths relative to the session's folder
 * `cwd`; a line or `#L12` anchor is dropped, since the file opens at its top.
 */
export function fileLink(url, cwd) {
  let s = String(url ?? "").trim().replace(/^<(.*)>$/, "$1");
  if (!s || s.startsWith("#")) return null;
  if (/^file:/i.test(s)) s = s.replace(/^file:(\/\/[^/]*)?/i, "").replace(/^\/([a-z]:)/i, "$1");
  else if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-z]:[\\/]/i.test(s)) return null;
  s = s.replace(/#.*$/, "").replace(/\?.*$/, "");
  try { s = decodeURIComponent(s); } catch {}
  s = s.replace(/\\/g, "/").replace(/:\d+(?::\d+)?(?:-\d+)?$/, "");
  if (!s || s.endsWith("/")) return null;
  const absolute = s.startsWith("/") || /^[a-z]:\//i.test(s);
  if (!absolute && !cwd) return null;
  const parts = [];
  for (const p of (absolute ? s : `${String(cwd).replace(/\\/g, "/").replace(/\/$/, "")}/${s}`).split("/")) {
    if (p === "." || (p === "" && parts.length)) continue;
    if (p === "..") { if (parts.length > 1) parts.pop(); }
    else parts.push(p);
  }
  return parts.join("/") || null;
}

/**
 * The files a reply links to (`[label](url)`, images and code blocks left out), each once and in the order written, at
 * most `limit` (as many as fit on its copy row): { name, url } with the file's own name, for the file chips there. A
 * link is a file when fileLink reads it as one; a relative one is placed in the session's folder when it is clicked.
 */
export function fileLinks(text, limit = 4) {
  const out = [], seen = new Set();
  const prose = String(text ?? "").replace(/```[\s\S]*?```/g, "");
  for (const [, url] of prose.matchAll(/(?<!!)\[[^\]\n]*\]\((<[^>\n]*>|[^)\s]*)\)/g)) {
    const path = fileLink(url, "/");
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push({ name: path.split("/").pop(), url });
    if (out.length >= limit) break;
  }
  return out;
}
