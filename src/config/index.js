'use strict';

require('dotenv').config();

/**
 * Parse an integer environment value with a fallback.
 * @param {string|undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const MINUTE = 60 * 1000;

/**
 * Central, immutable application configuration.
 * Secrets are only ever read from the environment, never hard-coded.
 */
const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 3000),
  trustProxy: toInt(process.env.TRUST_PROXY, 0),
  corsOrigin: process.env.CORS_ORIGIN || '',
  ai: Object.freeze({
    provider: (process.env.AI_PROVIDER || 'gemini').toLowerCase(),
    geminiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    anthropicKey: process.env.ANTHROPIC_API_KEY || '',
    anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    timeoutMs: toInt(process.env.AI_TIMEOUT_MS, 20000),
  }),
  cache: Object.freeze({
    environmentTtlMs: 5 * MINUTE,
    geocodeTtlMs: 24 * 60 * MINUTE,
    adviceTtlMs: 10 * MINUTE,
  }),
  rateLimit: Object.freeze({
    windowMs: MINUTE,
    max: 90,
    adviceMax: 8,
  }),
  upstreamTimeoutMs: 8000,
});

module.exports = config;
