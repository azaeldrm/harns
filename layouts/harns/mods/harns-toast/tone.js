/**
 * Which alert a notification is: "blocked" when an agent needs the person, "done" when one finished, null for any other.
 * Read from its title first (herdr's own say "… finished" or "… needs you"), then from the status of the agent its
 * click goes to (`action.args.terminal`, among `agents`), then from its level (error or success).
 */
export function toastTone(p, agents = []) {
  const title = p?.title ?? "";
  if (/needs (you|your input)|is asking|waiting for you/i.test(title)) return "blocked";
  if (/\b(finished|done)\b/i.test(title)) return "done";
  const status = agents.find(a => a.address === p?.action?.args?.terminal)?.status;
  if (status === "blocked" || status === "done") return status;
  return p?.level === "error" ? "blocked" : p?.level === "success" ? "done" : null;
}
