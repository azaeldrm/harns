import { Kept } from "./kept.js";

const drafts = new Kept("drafts", 50);

/** Where queued messages (Alt+Enter) are kept, for MessageQueue. */
export const queueStore = new Kept("queue", 50);

/** What's typed in a question card's rows, per session, row and question, until it's sent. */
export const answerStore = new Kept("answers", 20);

/** The tool groups opened in each session's conversation, as a list of their row keys. */
export const openedStore = new Kept("opened", 32);

/** The draft kept for session `key`, as { text, attachments }, or null. */
export function savedDraft(key) {
  const v = drafts.get(key);
  if (typeof v === "string") return v ? { text: v, attachments: [] } : null;
  return v && (v.text || v.attachments?.length) ? { text: v.text ?? "", attachments: v.attachments ?? [] } : null;
}

/**
 * The one writer of kept drafts: text and images always go together, so neither outlives a reload without the other.
 */
export function storeDraft(key, { text, attachments }) {
  drafts.set(key, text || attachments.length ? { text, attachments: attachments.map(keptImage) } : null);
}

/** An image as a draft or a queued message keeps it: what's needed to send it again after a reload. */
export function keptImage({ name, file, rel }) {
  return { name, file, rel };
}

/** Files the kept drafts and queued messages still show, which cache pruning must leave alone. */
export function keptImages() {
  const saved = Object.values(drafts.all()).filter(v => typeof v === "object" && v);
  const queued = Object.values(queueStore.all()).flat();
  return [...saved, ...queued].flatMap(v => (v.attachments ?? []).map(a => a.file));
}
