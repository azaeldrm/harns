import { terminals } from "herdr";

const OPENED_MS = 20000;

const seen = new Map();
let primed = false;

/** Records terminals as they appear (the chat's tick), and forgets the ones gone. */
export function noticeTerminals() {
  const now = Date.now(), live = new Set();
  for (const x of terminals()) {
    live.add(x.address);
    if (!seen.has(x.address)) seen.set(x.address, primed ? now : 0);
  }
  primed = true;
  for (const a of seen.keys()) if (!live.has(a)) seen.delete(a);
}

/** Whether this terminal appeared within OPENED_MS, while the chat was running. */
export function justOpened(address) {
  if (!primed) return false;
  if (!seen.has(address)) seen.set(address, Date.now());
  const at = seen.get(address);
  return at > 0 && Date.now() - at < OPENED_MS;
}
