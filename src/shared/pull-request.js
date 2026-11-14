import { exec } from "herdr";

const AGAIN_MS = 3 * 60 * 1000;
const known = new Map();
let asking = false;

/** The open PR ({ number, title, url }) as last read, or null; reads it (again) in the background when due. */
export function pullRequest(machine, folder, branch) {
  if (!folder || !branch) return null;
  const key = JSON.stringify([machine ?? null, folder, branch]);
  const entry = known.get(key);
  if (!asking && (!entry || Date.now() - entry.at > AGAIN_MS)) {
    asking = true;
    exec("gh", ["pr", "view", "--json", "number,title,url,state"], { cwd: folder, on: machine ?? undefined, timeout: 15000 })
      .then(r => {
        const pr = r.code === 0 ? JSON.parse(r.stdout) : null;
        known.set(key, { at: Date.now(), pr: pr?.state === "OPEN" && pr.url ? { number: pr.number, title: pr.title, url: pr.url } : null });
      })
      .catch(() => known.set(key, { at: Date.now(), pr: null }))
      .finally(() => { asking = false; });
  }
  return entry?.pr ?? null;
}
