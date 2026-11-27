'use strict';

/**
 * Small in-memory TTL cache with request de-duplication.
 * Concurrent callers asking for the same key share one upstream request,
 * which keeps third-party API usage (and latency) low.
 */
class TtlCache {
  /**
   * @param {{ttlMs: number, maxEntries?: number}} options
   */
  constructor({ ttlMs, maxEntries = 500 }) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.store = new Map();
    this.inFlight = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * @param {string} key
   * @returns {*} The cached value or undefined when missing/expired.
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /**
   * Return the cached value or run the loader once and cache its result.
   * Failures are never cached.
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} loader
   * @returns {Promise<T>}
   */
  async wrap(key, loader) {
    const hit = this.get(key);
    if (hit !== undefined) {
      this.hits += 1;
      return hit;
    }
    if (this.inFlight.has(key)) {
      this.hits += 1;
      return this.inFlight.get(key);
    }
    this.misses += 1;

    const pending = (async () => {
      try {
        const value = await loader();
        this.set(key, value);
        return value;
      } finally {
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, pending);
    return pending;
  }

  /** @returns {{hits: number, misses: number, size: number, hitRate: number, ttlSec: number}} */
  stats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.store.size,
      hitRate: total ? Math.round((this.hits / total) * 1000) / 10 : 0,
      ttlSec: Math.round(this.ttlMs / 1000),
    };
  }

  clear() {
    this.store.clear();
    this.inFlight.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

module.exports = { TtlCache };
