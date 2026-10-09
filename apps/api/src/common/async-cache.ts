export interface AsyncCacheOptions {
  /** How long a loaded value is served from memory. */
  ttlMs: number;
  /** Upper bound on stored entries; the oldest is evicted first. */
  maxEntries: number;
  /**
   * If set, a failed load is remembered for this long, and callers get the
   * same error immediately instead of hitting a broken upstream again. If not
   * set, failures aren't cached and the next call tries again.
   */
  failureTtlMs?: number;
}

type Outcome<V> = { ok: true; value: V } | { ok: false; error: unknown };

/**
 * In-memory cache for async loads such as upstream HTTP calls.
 *
 * - `get(key, load)` returns the stored value while it's fresh; otherwise it
 *   calls `load()` and stores the result.
 * - Concurrent calls for the same key share one `load()`, so a slow upstream
 *   gets one request instead of many.
 * - Holds at most `maxEntries` keys; inserting one more evicts the oldest.
 *
 * Values are shared between callers: treat them as read-only.
 */
export class AsyncCache<V> {
  private readonly entries = new Map<string, { outcome: Outcome<V>; expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<V>>();

  constructor(private readonly options: AsyncCacheOptions) {}

  get(key: string, load: () => Promise<V>): Promise<V> {
    const entry = this.entries.get(key);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.outcome.ok
        ? Promise.resolve(entry.outcome.value)
        : Promise.reject(entry.outcome.error);
    }

    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.loadAndStore(key, load).finally(() => {
        this.inFlight.delete(key);
      });
      this.inFlight.set(key, pending);
    }
    return pending;
  }

  /** Number of stored entries, fresh or expired. */
  get size(): number {
    return this.entries.size;
  }

  private async loadAndStore(key: string, load: () => Promise<V>): Promise<V> {
    try {
      const value = await load();
      this.store(key, { ok: true, value }, this.options.ttlMs);
      return value;
    } catch (error) {
      if (this.options.failureTtlMs !== undefined) {
        this.store(key, { ok: false, error }, this.options.failureTtlMs);
      }
      throw error;
    }
  }

  private store(key: string, outcome: Outcome<V>, ttlMs: number): void {
    // Re-inserting moves the key to the end of the Map's insertion order,
    // so the first key is always the oldest one.
    this.entries.delete(key);
    while (this.entries.size >= this.options.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) {
        break;
      }
      this.entries.delete(oldest.value);
    }
    this.entries.set(key, { outcome, expiresAt: Date.now() + ttlMs });
  }
}
