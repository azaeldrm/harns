import { family } from "./tones.js";

/** The states a working agent can wear: the light ones (9 to 54 dots at 20 px), so many can run at once. */
export const WORK_STATES = ["working", "searching", "solving", "connecting", "weaving"];

/** Whether theme `t` draws orbs where it would otherwise draw logos and spinners: Monochrome only. */
export const orbsOn = t => family(t) === "mono";

/**
 * The state an agent's orb wears while it works, from its address: random across agents, the same for one agent each
 * time, so its orb in the sidebar and in its chat match.
 */
export function workState(address) {
  let h = 2166136261;
  for (const ch of String(address ?? "")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return WORK_STATES[(h >>> 0) % WORK_STATES.length];
}
