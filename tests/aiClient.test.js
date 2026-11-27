'use strict';

process.env.NODE_ENV = 'test';

const { fetchJson } = require('../src/utils/http');
const { normalizeAir } = require('../src/services/environment');
const { buildFallbackAdvice } = require('../src/services/fallbackAdvice');
const { computeImpact, MODES } = require('../src/utils/impact');
const { adviceSchema } = require('../src/utils/schemas');
const { airPayload, defaultProfile, defaultChoices } = require('./fixtures');

const ORIGINAL_ENV = { ...process.env };

/** Load a fresh copy of aiClient with the given environment (config is read at import time). */
function loadAiClient(env) {
  let mod;
  jest.isolateModules(() => {
    process.env = { ...ORIGINAL_ENV, ...env };
    mod = require('../src/services/aiClient');
  });
  return mod;
}

const respond = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('aiClient providers', () => {
  const prompt = { system: 'SYSTEM TEXT', user: '{"hello":"world"}' };

  test('is disabled without a key', async () => {
    const client = loadAiClient({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: '' });
    expect(client.isConfigured()).toBe(false);
    await expect(client.generateJson(prompt)).rejects.toMatchObject({ code: 'AI_DISABLED' });
  });

  test('Gemini: system instruction is sent as the system role and the key stays in a header', async () => {
    const client = loadAiClient({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' });
    global.fetch = jest.fn(async () =>
      respond({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }),
    );

    await expect(client.generateJson(prompt)).resolves.toEqual({ ok: true });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain(':generateContent');
    expect(url).not.toContain('test-key');
    expect(options.headers['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(options.body);
    expect(body.systemInstruction.parts[0].text).toBe('SYSTEM TEXT');
    expect(body.contents[0].parts[0].text).toBe(prompt.user);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  test('Anthropic: uses the system field, model and version header', async () => {
    const client = loadAiClient({
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'anthropic-test-key',
      ANTHROPIC_MODEL: 'test-model',
    });
    global.fetch = jest.fn(async () => respond({ content: [{ type: 'text', text: '{"ok":1}' }] }));

    await expect(client.generateJson(prompt)).resolves.toEqual({ ok: 1 });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers['x-api-key']).toBe('anthropic-test-key');
    expect(options.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(options.body);
    expect(body.system).toBe('SYSTEM TEXT');
    expect(body.model).toBe('test-model');
    expect(body.messages).toEqual([{ role: 'user', content: prompt.user }]);
  });

  test('rejects when the provider answers with something that is not JSON', async () => {
    const client = loadAiClient({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' });
    global.fetch = jest.fn(async () =>
      respond({ candidates: [{ content: { parts: [{ text: 'sorry, no' }] } }] }),
    );
    await expect(client.generateJson(prompt)).rejects.toMatchObject({ code: 'AI_BAD_OUTPUT' });
  });
});

describe('fetchJson error handling', () => {
  test('maps HTTP errors, network failures and timeouts to safe errors', async () => {
    global.fetch = jest.fn(async () => respond({ secret: 'upstream body' }, false));
    await expect(fetchJson('https://example.test')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      status: 502,
    });

    global.fetch = jest.fn(async () => {
      throw new TypeError('socket hang up');
    });
    await expect(fetchJson('https://example.test')).rejects.toMatchObject({
      code: 'UPSTREAM_UNREACHABLE',
    });

    global.fetch = jest.fn(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    });
    await expect(fetchJson('https://example.test')).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      status: 504,
    });
  });
});

describe('fallback advice', () => {
  const cleanAir = JSON.parse(JSON.stringify(airPayload));
  cleanAir.current.us_aqi = 32;
  cleanAir.current.pm2_5 = 7;
  const environments = {
    smog: { air: normalizeAir(airPayload), weather: null },
    clean: { air: normalizeAir(cleanAir), weather: null },
  };

  test('always matches the schema the AI output must satisfy', () => {
    const cookings = ['lpg', 'induction', 'biomass'];
    for (const lang of ['en', 'ta']) {
      for (const mode of Object.keys(MODES)) {
        for (const cooking of cookings) {
          for (const [name, environment] of Object.entries(environments)) {
            const profile = {
              ...defaultProfile,
              commuteMode: mode,
              cooking,
              vulnerable: ['elderly'],
            };
            const choices = { ...defaultChoices, wearMask: mode === 'bus', households: 50 };
            const impact = computeImpact({
              profile,
              choices,
              pm25: environment.air.current.pm25,
            });
            const advice = buildFallbackAdvice({ environment, impact, profile, choices, lang });
            const parsed = adviceSchema.safeParse(advice);
            expect({ lang, mode, cooking, name, ok: parsed.success }).toEqual({
              lang,
              mode,
              cooking,
              name,
              ok: true,
            });
          }
        }
      }
    }
  });

  test('clean air gets a calm summary and no health note without vulnerable people', () => {
    const impact = computeImpact({
      profile: defaultProfile,
      choices: defaultChoices,
      pm25: 7,
    });
    const advice = buildFallbackAdvice({
      environment: environments.clean,
      impact,
      profile: defaultProfile,
      choices: defaultChoices,
      lang: 'en',
    });
    expect(advice.riskLevel).toBe('low');
    expect(advice.summary).toContain('AQI 32');
    expect(advice.healthNote).toBe('');
    expect(advice.impactExplanation).toContain('cigarettes');
  });
});
