import { shared, setShared } from "herdr";

const DRAFTS_KEY = "herdr-chat.drafts";
const DRAFTS_KEPT = 50;
const QUEUE_KEY = "herdr-chat.queue";

/** The draft kept in shared state for session `key`, as { text, attachments }, or null. */
export function savedDraft(key) {
  const v = (shared(DRAFTS_KEY) ?? {})[key];
  if (typeof v === "string") return v ? { text: v, attachments: [] } : null;
  return v && (v.text || v.attachments?.length) ? { text: v.text ?? "", attachments: v.attachments ?? [] } : null;
}

/**
 * The one writer of kept drafts: text and images always go together, so neither outlives a reload without the other.
 */
export function storeDraft(key, { text, attachments }) {
  const all = { ...(shared(DRAFTS_KEY) ?? {}) };
  const entry = text || attachments.length ? { text, attachments: attachments.map(keptImage) } : null;
  if (JSON.stringify(all[key] ?? null) === JSON.stringify(entry)) return;
  delete all[key];
  if (entry) all[key] = entry;
  const keys = Object.keys(all);
  for (const old of keys.slice(0, Math.max(0, keys.length - DRAFTS_KEPT))) delete all[old];
  setShared(DRAFTS_KEY, all);
}

/** An image as a draft or a queued message keeps it: what's needed to send it again after a reload. */
export function keptImage({ name, file, rel }) {
  return { name, file, rel };
}

/** Where queued messages (Alt+Enter) are kept, for MessageQueue: shared state, so a reload of the chat keeps them. */
export const queueStore = { load: () => shared(QUEUE_KEY) ?? {}, save: all => setShared(QUEUE_KEY, all) };

/** Files the kept drafts and queued messages still show, which cache pruning must leave alone. */
export function keptImages() {
  const drafts = Object.values(shared(DRAFTS_KEY) ?? {}).filter(v => typeof v === "object" && v);
  const queued = Object.values(shared(QUEUE_KEY) ?? {}).flat();
  return [...drafts, ...queued].flatMap(v => (v.attachments ?? []).map(a => a.file));
}
