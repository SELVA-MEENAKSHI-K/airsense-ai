'use strict';

const crypto = require('crypto');

const MAX_TRACES = 12;
const MAX_SAMPLES = 400;
const RAW_LIMIT = 3500;
const PROMPT_LIMIT = 6000;

const nowMs = () => Number(process.hrtime.bigint()) / 1e6;
const round = (value) => Math.round(value * 10) / 10;

/** Value at a percentile of an ascending list. */
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

/**
 * In-memory telemetry: request metrics, cache statistics and GenAI pipeline traces.
 *
 * Nothing sensitive is stored. Traces hold the system instruction hash, the prompt that was sent
 * (already sanitised, contains no keys), the model reply and the validation outcome, so the
 * Engineering page can show exactly how a plan was produced.
 */
function createTelemetry() {
  const startedAt = Date.now();
  const routes = new Map();
  const caches = new Map();
  const traces = [];
  let totalRequests = 0;

  return {
    /**
     * @param {{route: string, method: string, status: number, ms: number}} entry
     */
    recordRequest({ route, method, status, ms }) {
      totalRequests += 1;
      const key = `${method} ${route}`;
      let bucket = routes.get(key);
      if (!bucket) {
        bucket = { count: 0, errors: 0, samples: [] };
        routes.set(key, bucket);
      }
      bucket.count += 1;
      if (status >= 500) bucket.errors += 1;
      bucket.samples.push(ms);
      if (bucket.samples.length > MAX_SAMPLES) bucket.samples.shift();
    },

    /**
     * @param {string} name
     * @param {{stats: () => object}} cache
     */
    registerCache(name, cache) {
      caches.set(name, cache);
    },

    /**
     * Begin a GenAI pipeline trace.
     * @param {object} meta Static facts known up front (provider, model, language, ...).
     */
    startTrace(meta) {
      const begun = nowMs();
      const trace = {
        id: crypto.randomBytes(4).toString('hex'),
        startedAt: new Date().toISOString(),
        totalMs: 0,
        source: 'fallback',
        outcome: 'pending',
        fallbackReason: null,
        cacheHit: false,
        steps: [],
        prompt: null,
        rawOutput: null,
        validation: null,
        ...meta,
      };

      return {
        trace,
        /**
         * Time an async or sync stage. A thrown error is recorded and re-thrown.
         * @template T
         * @param {string} key
         * @param {string} label
         * @param {() => T|Promise<T>} work
         * @param {(result: T) => string} [describe]
         */
        async stage(key, label, work, describe) {
          const t0 = nowMs();
          try {
            const result = await work();
            trace.steps.push({
              key,
              label,
              status: 'ok',
              ms: round(nowMs() - t0),
              detail: describe ? describe(result) : '',
            });
            return result;
          } catch (error) {
            trace.steps.push({
              key,
              label,
              status: 'failed',
              ms: round(nowMs() - t0),
              detail: (error && error.code) || (error && error.name) || 'error',
            });
            throw error;
          }
        },
        skip(key, label, detail) {
          trace.steps.push({ key, label, status: 'skipped', ms: 0, detail });
        },
        setPrompt(text) {
          trace.prompt = String(text).slice(0, PROMPT_LIMIT);
        },
        setRaw(value) {
          const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
          trace.rawOutput = String(text).slice(0, RAW_LIMIT);
        },
        finish(patch) {
          Object.assign(trace, patch);
          trace.totalMs = round(nowMs() - begun);
          traces.unshift(trace);
          if (traces.length > MAX_TRACES) traces.pop();
          return trace;
        },
      };
    },

    getTrace(id) {
      return traces.find((trace) => trace.id === id) || null;
    },

    /** @returns {object} Aggregated view for the Engineering page. */
    snapshot() {
      const byRoute = {};
      for (const [key, bucket] of routes) {
        const sorted = [...bucket.samples].sort((a, b) => a - b);
        byRoute[key] = {
          count: bucket.count,
          errors: bucket.errors,
          p50Ms: round(percentile(sorted, 50)),
          p95Ms: round(percentile(sorted, 95)),
        };
      }
      const cacheStats = {};
      for (const [name, cache] of caches) cacheStats[name] = cache.stats();

      return {
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        totalRequests,
        byRoute,
        caches: cacheStats,
        traces: traces.map((trace) => ({ ...trace })),
      };
    },

    reset() {
      routes.clear();
      traces.length = 0;
      totalRequests = 0;
    },
  };
}

const telemetry = createTelemetry();

module.exports = { telemetry, createTelemetry };
