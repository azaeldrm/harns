export const TURN_START = 20000;

/**
 * Messages written with Alt+Enter while an agent works, held per session (the chat's key) until its turn ends, then sent
 * one per turn, oldest first. Each is { text, attachments }. `store` (a Kept: `all()` and `set(id, value)`) holds them
 * as { session: [message] }, read afresh each time, so one in shared state keeps them across a reload of the chat.
 */
export class MessageQueue {
  constructor(store) {
    this.store = store;
    this.sentAt = new Map();
  }

  /** Every session's messages, as the store has them. */
  all() {
    return this.store.all();
  }

  /** Keeps `messages` as the session's queue, forgetting the session when it's empty. */
  put(owner, messages) {
    this.store.set(owner, messages.length ? messages : null);
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
