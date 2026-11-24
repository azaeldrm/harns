import { appHome, exec } from "herdr";

/** Whether this computer runs Windows, by the shape of the app's home folder. */
export function onWindows() { return appHome().includes("\\"); }

/**
 * Runs Python 3 with `args`: python3 here and on other machines, the py launcher (or python) on Windows; null when
 * there's none.
 */
export async function python(args, opts) {
  if (opts?.on || !onWindows()) return exec("python3", args, opts);
  for (const [cmd, pre] of [["py", ["-3"]], ["python", []]]) {
    const r = await exec(cmd, [...pre, ...args], opts).catch(() => null);
    if (r && !(r.code === 9009 || (r.code !== 0 && /not recognized|not found|was not found/i.test(r.stderr || "")))) return r;
  }
  return null;
}

/** Text as base64 of its UTF-8 bytes (no Buffer or btoa here). */
export function base64Utf8(text) {
  const bytes = [];
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | c >> 6, 0x80 | c & 63);
    else if (c < 0x10000) bytes.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    else bytes.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
  }
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = bytes[i] << 16 | (bytes[i + 1] ?? 0) << 8 | (bytes[i + 2] ?? 0);
    out += abc[n >> 18 & 63] + abc[n >> 12 & 63] + (i + 1 < bytes.length ? abc[n >> 6 & 63] : "=") + (i + 2 < bytes.length ? abc[n & 63] : "=");
  }
  return out;
}
