/**
 * Reads, on one machine, the tokens every harness spent over the last days, from the logs they keep: Claude Code's
 * projects (each reply's usage, once per message and request), Codex's sessions (the growth of each log's running
 * total), OpenCode's database and Pi's sessions. Prints `{harness: {slot: [fresh, cached]}}`, slots as epoch seconds
 * at the start of each quarter hour, so the app can split them into days wherever it runs, half-hour time zones too.
 * Fresh is input, output and cache writes; cached is what was read from the cache. A
 * file read once is kept in ~/.cache/harns/token-usage.json with its size and time, so a later run reads only the
 * logs that changed.
 */
export const TOKEN_PROBE = String.raw`
import glob, json, os, sqlite3, sys, time
from datetime import datetime
DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 14
HOME = os.path.expanduser("~")
SINCE = time.time() - (DAYS + 1) * 86400
CACHE = os.path.join(HOME, ".cache", "harns", "token-usage.json")
def hour(ts):
    try:
        s = ts if isinstance(ts, (int, float)) else datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp()
    except ValueError: return None
    if s > 1e11: s /= 1000
    return int(s // 900 * 900)
def num(v):
    try: return int(v or 0)
    except (TypeError, ValueError): return 0
def lines(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f: yield line
def claude(path):
    out = {}
    for line in lines(path):
        if '"usage"' not in line: continue
        try: e = json.loads(line)
        except ValueError: continue
        m = e.get("message") if isinstance(e, dict) else None
        u = m.get("usage") if isinstance(m, dict) else None
        h = hour(e.get("timestamp")) if isinstance(u, dict) else None
        if h is None: continue
        key = "%s|%s" % (m.get("id"), e.get("requestId"))
        out[key] = [h, num(u.get("input_tokens")) + num(u.get("output_tokens")) + num(u.get("cache_creation_input_tokens")), num(u.get("cache_read_input_tokens"))]
    return out
def codex(path):
    out, last = {}, None
    for line in lines(path):
        if '"token_count"' not in line: continue
        try: e = json.loads(line)
        except ValueError: continue
        t = ((e.get("payload") or {}).get("info") or {}).get("total_token_usage")
        h = hour(e.get("timestamp")) if isinstance(t, dict) else None
        if h is None: continue
        now = (num(t.get("input_tokens")) - num(t.get("cached_input_tokens")) + num(t.get("output_tokens")), num(t.get("cached_input_tokens")))
        was = last or (0, 0)
        if now[0] >= was[0] and now[1] >= was[1] and now != was:
            slot = out.setdefault(str(h), [0, 0]); slot[0] += now[0] - was[0]; slot[1] += now[1] - was[1]
        last = now
    return out
def pi(path):
    out = {}
    for line in lines(path):
        if '"usage"' not in line or '"assistant"' not in line: continue
        try: e = json.loads(line)
        except ValueError: continue
        m = e.get("message") if isinstance(e, dict) else None
        u = m.get("usage") if isinstance(m, dict) else None
        h = hour(e.get("timestamp") or m.get("timestamp")) if isinstance(u, dict) else None
        if h is None: continue
        key = str(e.get("id") or m.get("responseId") or h)
        out[key] = [h, num(u.get("input")) + num(u.get("output")) + num(u.get("cacheWrite")), num(u.get("cacheRead"))]
    return out
def opencode():
    base = os.environ.get("XDG_DATA_HOME") or os.path.join(HOME, ".local", "share")
    db = os.path.join(base, "opencode", "opencode.db")
    out = {}
    if not os.path.exists(db): return out
    try:
        con = sqlite3.connect("file:" + db.replace("\\", "/") + "?mode=ro", uri=True, timeout=2)
        rows = con.execute("select time_created, data from message where time_created >= ?", (int(SINCE * 1000),)).fetchall()
    except sqlite3.Error: return out
    for created, data in rows:
        try: d = json.loads(data)
        except (TypeError, ValueError): continue
        if not isinstance(d, dict) or d.get("role") != "assistant": continue
        tok = d.get("tokens") or {}; cache = tok.get("cache") or {}
        h = hour(created)
        if h is None: continue
        slot = out.setdefault(str(h), [0, 0])
        slot[0] += num(tok.get("input")) + num(tok.get("output")) + num(tok.get("reasoning")) + num(cache.get("write"))
        slot[1] += num(cache.get("read"))
    return out
try:
    with open(CACHE, encoding="utf-8") as f: cache = json.load(f)
    if cache.get("v") != 2: raise ValueError
except (OSError, ValueError): cache = {"v": 2, "files": {}}
files, kept = cache["files"], {}
def read(path, parse):
    try: st = os.stat(path)
    except OSError: return None
    if st.st_mtime < SINCE: return None
    seen = files.get(path)
    if not seen or seen["size"] != st.st_size or seen["mtime"] != st.st_mtime:
        try: seen = {"size": st.st_size, "mtime": st.st_mtime, "rows": parse(path)}
        except OSError: return None
    kept[path] = seen
    return seen["rows"]
claude_dir = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(HOME, ".claude")
codex_dir = os.environ.get("CODEX_HOME") or os.path.join(HOME, ".codex")
result = {"claude": {}, "codex": {}, "opencode": opencode(), "pi": {}}
def add(name, h, fresh, cached):
    slot = result[name].setdefault(str(h), [0, 0]); slot[0] += fresh; slot[1] += cached
replies = {}
for path in glob.glob(os.path.join(claude_dir, "projects", "**", "*.jsonl"), recursive=True):
    replies.update(read(path, claude) or {})
for h, fresh, cached in replies.values(): add("claude", h, fresh, cached)
for path in glob.glob(os.path.join(codex_dir, "sessions", "*", "*", "*", "*.jsonl")):
    for h, (fresh, cached) in (read(path, codex) or {}).items(): add("codex", h, fresh, cached)
steps = {}
for path in glob.glob(os.path.join(HOME, ".pi", "agent", "sessions", "*", "*.jsonl")):
    steps.update(read(path, pi) or {})
for h, fresh, cached in steps.values(): add("pi", h, fresh, cached)
low = int(SINCE // 900 * 900)
for name in result: result[name] = {h: v for h, v in result[name].items() if int(h) >= low}
try:
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE + ".tmp", "w", encoding="utf-8") as f: json.dump({"v": 2, "files": kept}, f)
    os.replace(CACHE + ".tmp", CACHE)
except OSError: pass
print(json.dumps(result))
`;

/** The harnesses the card tells apart, in the order it lists them, each with its color. */
export const HARNESSES = [
  { id: 'claude', name: 'Claude Code', color: '#d97757' },
  { id: 'codex', name: 'Codex', color: '#8b9cf7' },
  { id: 'opencode', name: 'OpenCode', color: '#6cc4a1' },
  { id: 'pi', name: 'Pi', color: '#d4b85c' },
];

/**
 * One machine's quarter hours, read by running the probe with `exec` (herdr's, or anything with its shape) there: `host` null
 * is this computer. Tries `python3`, then `python`; rejects when neither answers with the probe's JSON.
 */
export async function readMachineUsage(exec, host, days = 14) {
  const run = program => exec(program, ['-c', TOKEN_PROBE, String(days)], host == null ? { timeout: 120000 } : { on: host, timeout: 120000 }).catch(() => null);
  let r = await run('python3');
  if (!r || r.code !== 0) r = await run('python');
  if (!r || r.code !== 0) throw new Error((r?.stderr || 'No Python answered').trim().split('\n').at(-1));
  return JSON.parse(r.stdout.trim());
}

/** How often the sidebar reads every machine's usage again. */
export const USAGE_EVERY = 5 * 60 * 1000;

/** The key a machine's reading is kept under: its name, or `@local` for this computer. */
export const machineKey = machine => machine?.name ?? '@local';

/**
 * Whether it's time to read again: never read, read more than `USAGE_EVERY` ago, or a connected machine that has
 * neither a reading nor an error yet (it came online since).
 */
export function usageDue(state, list, now = Date.now()) {
  if (!state?.at || now - state.at >= USAGE_EVERY) return true;
  return list.some(m => m.layout === 'ready' && !(machineKey(m) in (state.hours ?? {})) && !(machineKey(m) in (state.errors ?? {})));
}

/**
 * Reads every connected machine of `list` (herdr's `machines()`) with `read(host)`, all at once: `{hours, errors, at}`,
 * each machine's quarter hours under its key. A machine that fails or isn't connected keeps what `previous` had for it, so the card
 * doesn't drop a machine while it's away.
 */
export async function collectUsage(list, read, previous = null, now = Date.now()) {
  const hours = {}, errors = {};
  await Promise.all(list.map(async machine => {
    const key = machineKey(machine);
    if (machine.layout !== 'ready') {
      if (previous?.hours?.[key]) hours[key] = previous.hours[key];
      return;
    }
    try { hours[key] = await read(machine.name ?? null); }
    catch (e) {
      errors[key] = String(e?.message ?? e);
      if (previous?.hours?.[key]) hours[key] = previous.hours[key];
    }
  }));
  return { hours, errors, at: now };
}

/** The local calendar day of `ms` as `YYYY-MM-DD`. */
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The last `count` days up to the one holding `now`, in the time zone the app runs in, oldest first, from every
 * machine's quarter hours added together (`{machine: {harness: {slot: [fresh, cached]}}}`): each day its key, its
 * start, each harness's fresh and cached tokens, and the day's fresh and cached totals.
 */
export function dailyUsage(byMachine, now = Date.now(), count = 14) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    days.push({ key: dayKey(d.getTime()), start: d.getTime(), harnesses: {}, fresh: 0, cached: 0, today: i === 0 });
  }
  const index = new Map(days.map((d, i) => [d.key, i]));
  for (const machine of Object.values(byMachine ?? {})) {
    for (const [harness, hours] of Object.entries(machine ?? {})) {
      for (const [hour, value] of Object.entries(hours ?? {})) {
        const i = index.get(dayKey(Number(hour) * 1000));
        if (i === undefined || !Array.isArray(value)) continue;
        const [fresh = 0, cached = 0] = value.map(Number);
        const day = days[i];
        const slot = day.harnesses[harness] ??= { fresh: 0, cached: 0 };
        slot.fresh += fresh; slot.cached += cached;
        day.fresh += fresh; day.cached += cached;
      }
    }
  }
  return days;
}

/**
 * The days the usage views show for the shared reading `state`, kept in `memo` (what the last call returned) and worked
 * out again only when a new reading lands or the day turns: `{at, today, days}`, days null before the first reading.
 */
export function usageDays(state, memo, now = Date.now()) {
  if (!state?.hours) return { at: null, today: null, days: null };
  const today = dayKey(now);
  return memo?.at === state.at && memo?.today === today ? memo : { at: state.at, today, days: dailyUsage(state.hours, now) };
}

/** A token count as the sidebar can hold it: 950, 46K, 2.8M, 12M, 1.6B. */
export function formatTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return n >= 1e7 ? `${Math.round(n / 1e6)}M` : `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(Math.round(n));
}

/** Where harns's settings put token usage: `strip` (under the agents, the default) or `footer`. */
export function usagePlace(value) {
  return value === 'footer' ? 'footer' : 'strip';
}
