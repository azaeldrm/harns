"""Lists the agent sessions kept on this machine, newest first, as one JSON array on stdout: Claude Code's, Codex's, Pi's
and OpenCode's, each { a: harness, id, title, cwd, start, at: last written, path }, times in ms. The sidebar's Past
sessions runs it on every machine through `python3 -c`, so it stays one file with the standard library only, and reads only the start and
end of each log: a long session's log runs to tens of megabytes. Its arguments are the most to list and `since`, the
newest time the sidebar already has from this machine: a log last written before then comes as { path, at } alone, for
the sidebar to fill in from what it kept, so a refresh reads only the logs written since."""

import glob, json, os, re, sqlite3, sys
from datetime import datetime

HOME = os.path.expanduser("~")
HEAD_LINES = 400
TAIL_BYTES = 262144


def clean(text):
    """A message as a one-line title: whitespace folded, at most 140 characters."""
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text[:139] + "…" if len(text) > 140 else text


def text_of(content):
    """The text of a message's content, a string or a list of parts."""
    if isinstance(content, str): return content
    if isinstance(content, list):
        return " ".join(str(c.get("text", "")) for c in content if isinstance(c, dict) and c.get("type") in ("text", "input_text"))
    return ""


def iso_ms(text):
    """An ISO 8601 time (`2026-11-23T10:00:00.123Z`) in ms, or None: fractions past microseconds and a Z are allowed."""
    m = re.match(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(\.\d+)?(Z|[+-]\d\d:?\d\d)?$", str(text or ""))
    if not m: return None
    zone = m.group(3) or "+00:00"
    zone = "+00:00" if zone == "Z" else zone[:3] + ":" + zone[-2:]
    try: return int(datetime.strptime(m.group(1) + (m.group(2) or ".0")[:7].ljust(7, "0") + zone.replace(":", ""), "%Y-%m-%dT%H:%M:%S.%f%z").timestamp() * 1000)
    except ValueError: return None


def typed(text):
    """Whether a user message is something the person typed, not a command echo, a reminder or an attached context."""
    t = text.strip()
    return bool(t) and not t.startswith("<") and not t.startswith("Caveat:") and not t.startswith("[Request interrupted")


def head(path):
    """The first lines of a log, parsed, skipping any that aren't JSON."""
    out = []
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if i >= HEAD_LINES: break
                try: out.append(json.loads(line))
                except ValueError: pass
    except OSError: pass
    return out


def tail(path):
    """The last lines of a log, parsed, newest last."""
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - TAIL_BYTES))
            lines = f.read().decode("utf-8", "replace").splitlines()[1 if size > TAIL_BYTES else 0:]
    except OSError: return []
    out = []
    for line in lines:
        try: out.append(json.loads(line))
        except ValueError: pass
    return out


def claude(path):
    """A Claude Code session: its title (the one set by hand, else Claude's own, else the first message), folder and
    start."""
    cwd, first, start = None, None, None
    for o in head(path):
        if not isinstance(o, dict): continue
        cwd = cwd or o.get("cwd")
        start = start or iso_ms(o.get("timestamp"))
        if first is None and o.get("type") == "user" and not o.get("isMeta") and not o.get("isSidechain"):
            text = text_of((o.get("message") or {}).get("content"))
            if typed(text): first = text
        if cwd and first: break
    named = {}
    for o in tail(path):
        if isinstance(o, dict) and o.get("type") in ("custom-title", "ai-title", "summary"):
            named[o["type"]] = o.get("customTitle") or o.get("aiTitle") or o.get("summary")
    title = named.get("custom-title") or named.get("ai-title") or first or named.get("summary")
    if not title or not cwd: return None
    return {"a": "claude", "id": os.path.basename(path)[:-6], "title": clean(title), "cwd": cwd, "start": start}


def codex(path, names):
    """A Codex session started by the person: its name from Codex's index, else its first message, and folder."""
    lines = head(path)
    meta = lines[0].get("payload", {}) if lines and isinstance(lines[0], dict) and lines[0].get("type") == "session_meta" else None
    if not meta or meta.get("thread_source") not in (None, "user"): return None
    first = None
    for o in lines:
        p = o.get("payload") if isinstance(o, dict) else None
        if isinstance(p, dict) and o.get("type") == "event_msg" and p.get("type") == "user_message" and typed(str(p.get("message", ""))):
            first = p["message"]
            break
    sid = meta.get("id") or meta.get("session_id")
    title = names.get(sid) or first
    if not sid or not title: return None
    return {"a": "codex", "id": sid, "title": clean(title), "cwd": meta.get("cwd"), "start": iso_ms(meta.get("timestamp"))}


def pi(path):
    """A Pi session: its name when given one, else its first message, and folder."""
    lines = head(path)
    if not lines or not isinstance(lines[0], dict) or lines[0].get("type") != "session": return None
    first, name = None, None
    for o in lines + tail(path):
        if not isinstance(o, dict): continue
        if o.get("type") == "session_info" and o.get("name"): name = o["name"]
        m = o.get("message") if o.get("type") == "message" else None
        if first is None and isinstance(m, dict) and m.get("role") == "user" and typed(text_of(m.get("content"))):
            first = text_of(m.get("content"))
    title = name or first
    if not title: return None
    return {"a": "pi", "id": lines[0].get("id"), "title": clean(title), "cwd": lines[0].get("cwd"), "start": iso_ms(lines[0].get("timestamp"))}


def opencode(limit):
    """OpenCode's sessions from its database, opened read-only: the top-level ones, newest first."""
    base = os.environ.get("XDG_DATA_HOME") or os.path.join(HOME, ".local", "share")
    db = os.path.join(base, "opencode", "opencode.db")
    if not os.path.exists(db): return []
    try:
        con = sqlite3.connect("file:%s?mode=ro" % db.replace("\\", "/"), uri=True, timeout=2)
        cols = [r[1] for r in con.execute("pragma table_info(session_v2)")]
        rows = con.execute("select id, %s, directory, time_created, time_updated from session_v2 where parent_id is null order by time_updated desc limit ?"
                           % ("title" if "title" in cols else "''"), (limit,)).fetchall()
        out = []
        for sid, title, cwd, start, at in rows:
            if not title:
                r = con.execute("select data from session_message where session_id = ? and type = 'user' order by seq limit 1", (sid,)).fetchone()
                try: title = json.loads(r[0]).get("text") if r else None
                except (ValueError, AttributeError): title = None
            if title: out.append({"a": "opencode", "id": sid, "title": clean(title), "cwd": cwd, "start": int(start), "at": int(at), "path": db + "#" + sid})
        return out
    except sqlite3.Error:
        return []


def codex_names(root):
    """The names Codex gave its sessions, by id, from its index (the last name each got)."""
    names = {}
    try:
        with open(os.path.join(root, "session_index.jsonl"), encoding="utf-8", errors="replace") as f:
            for line in f:
                try: o = json.loads(line)
                except ValueError: continue
                if isinstance(o, dict) and o.get("id") and o.get("thread_name"): names[o["id"]] = o["thread_name"]
    except OSError: pass
    return names


def logs():
    """Every session log on this machine as (harness, path), with how to read each."""
    found = []
    claude_dirs = [d for d in [os.environ.get("CLAUDE_CONFIG_DIR"), os.path.join(HOME, ".claude")] if d]
    for d in dict.fromkeys(os.path.abspath(os.path.expanduser(d)) for d in claude_dirs):
        found += [(p, claude) for p in glob.glob(os.path.join(d, "projects", "*", "*.jsonl"))]
    root = os.path.expanduser(os.environ.get("CODEX_HOME") or os.path.join(HOME, ".codex"))
    names = codex_names(root)
    found += [(p, lambda p: codex(p, names)) for p in glob.glob(os.path.join(root, "sessions", "**", "rollout-*.jsonl"), recursive=True)]
    found += [(p, pi) for p in glob.glob(os.path.join(HOME, ".pi", "agent", "sessions", "*", "*.jsonl"))]
    return found


def main(limit, since):
    """The newest `limit` sessions, read newest first until that many have something to show, those last written before
    `since` given by their log and time alone. Those may turn out empty, so each counts as half a session."""
    dated = []
    for path, read in logs():
        try: dated.append((os.path.getmtime(path), path, read))
        except OSError: pass
    dated.sort(key=lambda x: x[0], reverse=True)
    full = lambda items: sum(1 if "a" in x else 0.5 for x in items) >= limit
    out = []
    for at, path, read in dated:
        if full(out): break
        ms = int(at * 1000)
        if since and ms < since:
            out.append({"path": path, "at": ms})
            continue
        try: item = read(path)
        except Exception: item = None
        if item:
            item.update({"at": ms, "path": path})
            out.append(item)
    shown = []
    for item in sorted(out + opencode(limit), key=lambda x: x["at"], reverse=True):
        if full(shown): break
        shown.append(item)
    sys.stdout.write(json.dumps(shown, ensure_ascii=True))


main(int(sys.argv[1]) if len(sys.argv) > 1 else 100, int(sys.argv[2]) if len(sys.argv) > 2 else 0)
