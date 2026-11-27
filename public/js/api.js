/** Thin, defensive client for the AirSense API. */

const DEFAULT_TIMEOUT_MS = 12000;

/**
 * @param {string} path
 * @param {{method?: string, body?: object, timeoutMs?: number, signal?: AbortSignal}} [options]
 * @returns {Promise<any>}
 */
async function request(
  path,
  { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {},
) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error((data.error && data.error.message) || 'Request failed');
      error.code = data.error && data.error.code;
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

export const api = {
  environment: (lat, lon, signal) =>
    request(`/api/environment?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, {
      signal,
    }),
  reverse: (lat, lon) => request(`/api/reverse?lat=${lat}&lon=${lon}`),
  geocode: (query, country) =>
    request(`/api/geocode?q=${encodeURIComponent(query)}${country ? `&country=${country}` : ''}`),
  impact: (payload, signal) => request('/api/impact', { method: 'POST', body: payload, signal }),
  advice: (payload) => request('/api/advice', { method: 'POST', body: payload, timeoutMs: 30000 }),
  planner: (payload) => request('/api/planner', { method: 'POST', body: payload }),
  indoor: (lat, lon, lang) =>
    request(
      `/api/indoor?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&lang=${lang}`,
    ),
  sustainability: (lat, lon, lang, lifestyle) =>
    request(
      `/api/sustainability?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&lang=${lang}&lifestyle=${lifestyle}`,
    ),
  local: (lat, lon, lang, place, groups) =>
    request(
      `/api/local?lat=${lat}&lon=${lon}&lang=${lang}&place=${encodeURIComponent(place || '')}&groups=${groups.join(',')}`,
    ),
  compare: (payload) => request('/api/compare', { method: 'POST', body: payload }),
  chat: (payload) => request('/api/chat', { method: 'POST', body: payload, timeoutMs: 30000 }),
  diagnostics: () => request('/api/diagnostics'),
  trace: (id) => request(`/api/diagnostics/traces/${encodeURIComponent(id)}`),
  systemInstruction: () => request('/api/system-instruction'),
};

/**
 * Like request(), but also returns status and headers. Used by the Engineering page to verify
 * the server's real security behaviour from the browser.
 * @param {string} path
 * @param {{method?: string, body?: string, headers?: Record<string,string>}} [options]
 */
export async function probe(path, { method = 'GET', body, headers } = {}) {
  const response = await fetch(path, { method, body, headers });
  await response.text();
  return { status: response.status, headers: response.headers };
}
