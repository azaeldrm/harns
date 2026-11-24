import json, os, sqlite3, subprocess, sys, tempfile, time

LISTER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "layouts", "harns", "mods", "machine-sidebar", "past_sessions.py")
failed = 0


def check(name, got, want):
    global failed
    ok = got == want
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else ": got %r, want %r" % (got, want)))
    if not ok: failed += 1


def log(path, lines, age):
    """A session log of `lines` (objects), last written `age` seconds ago."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(json.dumps(l) for l in lines) + "\n")
    at = time.time() - age
    os.utime(path, (at, at))


def listing(home, limit=60, since=0, raw=False):
    """What past_sessions.py prints with `home` as the home folder, sessions as (harness, id, title, cwd)."""
    env = {k: v for k, v in os.environ.items() if k not in ("CLAUDE_CONFIG_DIR", "CODEX_HOME")}
    env.update({"HOME": home, "USERPROFILE": home, "XDG_DATA_HOME": os.path.join(home, "data")})
    out = subprocess.run([sys.executable, "-I", LISTER, str(limit), str(since)], capture_output=True, text=True, env=env).stdout
    return json.loads(out) if raw else [(s["a"], s["id"], s["title"], s["cwd"]) for s in json.loads(out)]


with tempfile.TemporaryDirectory() as home:
    projects = os.path.join(home, ".claude", "projects", "-srv-trailhead")
    log(os.path.join(projects, "c1.jsonl"), [
        {"type": "user", "cwd": "/srv/trailhead", "isMeta": True, "message": {"content": "<command-name>/clear</command-name>"}},
        {"type": "user", "cwd": "/srv/trailhead", "timestamp": "2026-11-23T10:00:00.250Z", "message": {"content": [{"type": "text", "text": "Fix the  tile\ncache"}]}},
        {"type": "ai-title", "aiTitle": "Tile cache fix"},
    ], 60)
    log(os.path.join(projects, "c2.jsonl"), [
        {"type": "user", "cwd": "/srv/trailhead", "message": {"content": "Plan the release"}},
        {"type": "ai-title", "aiTitle": "Release plan"}, {"type": "custom-title", "customTitle": "2.0 release"},
    ], 120)
    log(os.path.join(projects, "empty.jsonl"), [{"type": "mode", "mode": "normal"}], 30)
    log(os.path.join(projects, "c2", "subagents", "agent-1.jsonl"), [
        {"type": "user", "cwd": "/srv/trailhead", "message": {"content": "A sub-agent's task"}}], 10)
    codex = os.path.join(home, ".codex")
    log(os.path.join(codex, "sessions", "2026", "11", "23", "rollout-2026-11-23T10-00-00-x1.jsonl"), [
        {"type": "session_meta", "payload": {"id": "x1", "cwd": "/srv/trailhead", "thread_source": "user", "timestamp": "2026-11-23T10:00:00.8115446Z"}},
        {"type": "response_item", "payload": {"role": "user", "content": [{"type": "input_text", "text": "<environment_context>"}]}},
        {"type": "event_msg", "payload": {"type": "user_message", "message": "Add an elevation profile"}},
    ], 180)
    log(os.path.join(codex, "sessions", "2026", "11", "23", "rollout-2026-11-23T11-00-00-x2.jsonl"), [
        {"type": "session_meta", "payload": {"id": "x2", "cwd": "/srv/trailhead", "thread_source": "subagent"}},
        {"type": "event_msg", "payload": {"type": "user_message", "message": "A sub-agent's task"}},
    ], 20)
    log(os.path.join(codex, "session_index.jsonl"), [{"id": "x1", "thread_name": "Elevation profile"}], 0)
    log(os.path.join(home, ".pi", "agent", "sessions", "--srv-trailhead--", "t_p1.jsonl"), [
        {"type": "session", "id": "p1", "cwd": "/srv/trailhead", "timestamp": "2026-11-23T12:00:00+02:00"},
        {"type": "message", "message": {"role": "user", "content": [{"type": "text", "text": "Write the GPX importer's tests"}]}},
    ], 240)
    os.makedirs(os.path.join(home, "data", "opencode"))
    con = sqlite3.connect(os.path.join(home, "data", "opencode", "opencode.db"))
    con.execute("create table session_v2 (id text, directory text, parent_id text, time_created integer, time_updated integer)")
    con.execute("create table session_message (id text, session_id text, type text, seq integer, data text)")
    old = int((time.time() - 300) * 1000)
    con.execute("insert into session_v2 values ('o1', '/srv/trailhead', null, ?, ?)", (old, old))
    con.execute("insert into session_v2 values ('o2', '/srv/trailhead', 'o1', ?, ?)", (old, old + 1000))
    con.execute("insert into session_message values ('m1', 'o1', 'user', 0, ?)", (json.dumps({"text": "Refactor the sync queue"}),))
    con.commit(); con.close()

    got = listing(home)
    check("every harness's sessions, the last written first", [(a, i) for a, i, _, _ in got],
          [("claude", "c1"), ("claude", "c2"), ("codex", "x1"), ("pi", "p1"), ("opencode", "o1")])
    check("titles: set by hand, else the harness's own, else the first typed message, on one line", [t for _, _, t, _ in got],
          ["Tile cache fix", "2.0 release", "Elevation profile", "Write the GPX importer's tests", "Refactor the sync queue"])
    check("each in its folder", {c for _, _, _, c in got}, {"/srv/trailhead"})
    whole = listing(home, raw=True)
    base = 1795428000000
    check("each says when it started, in ms", [s.get("start") for s in whole], [base + 250, None, base + 811, base, old])
    since = whole[2]["at"]
    again = listing(home, since=since, raw=True)
    check("since a time, logs written before it come as their path and time alone, to be filled in from the kept list",
          [(s.get("a"), sorted(s)) for s in again if s["at"] < since and "#" not in s["path"]],
          [(None, ["at", "path"])])
    check("and those written since are read whole", [s["id"] for s in again if s["at"] >= since], ["c1", "c2", "x1"])
    check("at most as many as asked", [(a, i) for a, i, _, _ in listing(home, 2)], [("claude", "c1"), ("claude", "c2")])

with tempfile.TemporaryDirectory() as home:
    check("a machine without any harness lists nothing", listing(home), [])

if failed:
    print("%d failed" % failed)
    sys.exit(1)
