'use strict';

const { AppError } = require('./errors');

/**
 * Fetch JSON with a hard timeout and strict status handling.
 * Upstream error bodies are never forwarded to clients.
 * @param {string} url
 * @param {{timeoutMs?: number, method?: string, headers?: object, body?: string}} [options]
 * @returns {Promise<any>}
 */
async function fetchJson(url, { timeoutMs = 8000, method = 'GET', headers, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await globalThis.fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AppError('Upstream service returned an error', 502, 'UPSTREAM_ERROR');
    }
    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error && error.name === 'AbortError') {
      throw new AppError('Upstream service timed out', 504, 'UPSTREAM_TIMEOUT');
    }
    throw new AppError('Could not reach upstream service', 502, 'UPSTREAM_UNREACHABLE');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchJson };
