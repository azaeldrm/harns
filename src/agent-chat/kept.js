import { shared, setShared } from "herdr";

/** Herdr's shared state, where kept things live: it outlasts a reload of the chat and a restart of the app. */
const SHARED = { load: key => shared(key), save: (key, value) => setShared(key, value) };

/** A backing that lasts as long as the store does, for a store nothing needs to outlive (and for tests). */
export function memory() {
  const values = {};
  return { load: key => values[key] ?? null, save: (key, value) => { values[key] = value; } };
}

/**
 * Something the person made or chose, kept per session under `herdr-chat.<name>` so a reload of the chat (a
 * reinstall, a restart) brings it back, where anything held on a view starts over. Entries are { id: value }, newest
 * last; past `limit` the oldest go. `backing` is herdr's shared state unless given.
 */
export class Kept {
  constructor(name, limit, backing = SHARED) {
    this.key = `herdr-chat.${name}`;
    this.limit = limit;
    this.backing = backing;
  }

  /** Every kept entry, oldest first. */
  all() {
    return this.backing.load(this.key) ?? {};
  }

  /** The value kept for `id`, or undefined. */
  get(id) {
    return this.all()[id];
  }

  /** Keeps `value` for `id` as the newest entry, or forgets `id` for null; writes nothing when it's already kept. */
  set(id, value) {
    if (!id) return;
    const all = { ...this.all() };
    if (JSON.stringify(all[id] ?? null) === JSON.stringify(value ?? null)) return;
    delete all[id];
    if (value != null) all[id] = value;
    const ids = Object.keys(all);
    for (const old of ids.slice(0, Math.max(0, ids.length - this.limit))) delete all[old];
    this.backing.save(this.key, all);
  }
}
