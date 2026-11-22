export const TURN_START = 20000;

/** A store that lives as long as the queue does, for a queue nothing needs to outlive. */
function memoryStore() {
  let all = {};
  return { load: () => all, save: next => { all = next; } };
}

/**
 * Messages written with Alt+Enter while an agent works, held per session (the chat's key) until its turn ends, then sent
 * one per turn, oldest first. Each is { text, attachments }. `store` keeps them as { session: [message] } through
 * `load()` and `save(all)`, read afresh each time, so a store in shared state keeps them across a reload of the chat.
 */
export class MessageQueue {
  constructor(store = memoryStore()) {
    this.store = store;
    this.sentAt = new Map();
  }

  /** Every session's messages, as the store has them. */
  all() {
    return this.store.load() ?? {};
  }

  /** Keeps `messages` as the session's queue, forgetting the session when it's empty. */
  put(owner, messages) {
    const all = { ...this.all() };
    delete all[owner];
    if (messages.length) all[owner] = messages;
    this.store.save(all);
  }

  /** Holds a message for the session `owner`. */
  add(owner, message) {
    this.put(owner, [...this.list(owner), message]);
  }

  /** The session's queued messages, oldest first. */
  list(owner) {
    return this.all()[owner] ?? [];
  }

  /** Drops the session's message at `index`. */
  remove(owner, index) {
    this.put(owner, this.list(owner).filter((_m, i) => i !== index));
  }

  /** The sessions with messages waiting. */
  owners() {
    return Object.keys(this.all());
  }

  /**
   * The session's next message once its agent is idle or done (`status`), taken off the queue, else null. After one is
   * sent the next waits until the agent has started working on it (or `TURN_START` ms went by without that), so a turn
   * that hasn't begun yet doesn't read as one that ended.
   */
  take(owner, status, now) {
    const sent = this.sentAt.get(owner);
    if (sent !== undefined) {
      if (status !== "working" && now - sent < TURN_START) return null;
      this.sentAt.delete(owner);
    }
    if (status !== "idle" && status !== "done") return null;
    const [next, ...rest] = this.list(owner);
    if (!next) return null;
    this.put(owner, rest);
    this.sentAt.set(owner, now);
    return next;
  }
}
