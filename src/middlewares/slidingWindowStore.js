/**
 * In-memory sliding-window-counter store for express-rate-limit.
 *
 * Why not the default fixed window: a fixed window lets a client send `limit`
 * requests just before the boundary and `limit` more just after it, so twice
 * the limit lands in a short span. The sliding counter weighs the previous
 * window by how much of it still overlaps the last `windowMs`, which removes
 * that boundary burst.
 *
 * effective hits = previous * (1 - elapsedFractionOfCurrentWindow) + current
 *
 * - Rejected requests do not consume budget, so a client that backs off for
 *   Retry-After is allowed again instead of being punished for the retries.
 * - resetTime is the earliest time a new request would be allowed when the
 *   client is blocked, so Retry-After is accurate. For allowed requests it is
 *   the end of the current window (used for the RateLimit-Reset header).
 * - Counts live in process memory. Each Vercel instance counts on its own.
 */
export class SlidingWindowStore {
  localKeys = true;

  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.entries = new Map();
    this.windowMs = 60_000;
    this.limit = null;
    this.timer = null;
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.limit = typeof options.limit === 'number' ? options.limit : null;
    if (!this.timer) {
      this.timer = setInterval(() => this.sweep(), this.windowMs);
      this.timer.unref?.();
    }
  }

  roll(entry, idx) {
    if (entry.idx === idx) return;
    entry.previous = entry.idx === idx - 1 ? entry.current : 0;
    entry.current = 0;
    entry.idx = idx;
  }

  weighted(entry, now) {
    const elapsed = (now - entry.idx * this.windowMs) / this.windowMs;
    return entry.previous * (1 - elapsed) + entry.current;
  }

  /** Earliest epoch ms at which one more request would fit under the limit. */
  retryAt(entry, now) {
    const windowMs = this.windowMs;
    const limit = this.limit;
    const start = entry.idx * windowMs;

    if (entry.previous > 0 && entry.current + 1 <= limit) {
      const fraction = 1 - (limit - entry.current - 1) / entry.previous;
      return Math.max(now, start + fraction * windowMs);
    }

    const base = start + windowMs;
    const carried = entry.current;
    if (carried <= 0) return base;
    const fraction = Math.max(0, 1 - (limit - 1) / carried);
    return base + fraction * windowMs;
  }

  async increment(key) {
    const now = this.now();
    const idx = Math.floor(now / this.windowMs);

    let entry = this.entries.get(key);
    if (!entry) {
      entry = { idx, current: 0, previous: 0 };
      this.entries.set(key, entry);
    } else {
      this.roll(entry, idx);
    }

    const wouldBe = Math.ceil(this.weighted(entry, now) + 1 - 1e-9);

    if (this.limit !== null && wouldBe > this.limit) {
      return { totalHits: wouldBe, resetTime: new Date(this.retryAt(entry, now)) };
    }

    entry.current += 1;
    return {
      totalHits: wouldBe,
      resetTime: new Date((idx + 1) * this.windowMs),
    };
  }

  async decrement(key) {
    const entry = this.entries.get(key);
    if (entry && entry.current > 0) entry.current -= 1;
  }

  async resetKey(key) {
    this.entries.delete(key);
  }

  async resetAll() {
    this.entries.clear();
  }

  sweep() {
    const idx = Math.floor(this.now() / this.windowMs);
    for (const [key, entry] of this.entries) {
      if (entry.idx < idx - 1) this.entries.delete(key);
    }
  }
}
