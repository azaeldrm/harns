export const TURN_START = 20000;

/**
 * Messages written with Alt+Enter while an agent works, held per session (the chat's key) until its turn ends, then sent
 * one per turn, oldest first. Each is { text, attachments }.
 */
export class MessageQueue {
  constructor() {
    this.items = new Map();
    this.sentAt = new Map();
  }

  /** Holds a message for the session `owner`. */
  add(owner, message) {
    this.items.set(owner, [...this.list(owner), message]);
  }

  /** The session's queued messages, oldest first. */
  list(owner) {
    return this.items.get(owner) ?? [];
  }

  /** Drops the session's message at `index`. */
  remove(owner, index) {
    const left = this.list(owner).filter((_m, i) => i !== index);
    if (left.length) this.items.set(owner, left); else this.items.delete(owner);
  }

  /** The sessions with messages waiting. */
  owners() {
    return [...this.items.keys()];
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
    if (rest.length) this.items.set(owner, rest); else this.items.delete(owner);
    this.sentAt.set(owner, now);
    return next;
  }
}
