'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const { createApp } = require('../src/app');
const { createTelemetry, telemetry } = require('../src/services/telemetry');
const { computeWindows, summarizeForPrompt, verdictFor } = require('../src/services/windows');
const { getAdvice, clearCache } = require('../src/services/advice');
const { normalizeAir } = require('../src/services/environment');
const { TtlCache } = require('../src/utils/cache');
const { SECURITY_CONTROLS, PIPELINE } = require('../src/services/diagnostics');
const { airPayload, mockFetch, defaultProfile, defaultChoices } = require('./fixtures');

const environment = {
  air: normalizeAir(airPayload),
  weather: null,
};

const input = {
  lat: 9.9,
  lon: 78.1,
  lang: 'en',
  locationName: 'Madurai',
  profile: defaultProfile,
  choices: defaultChoices,
};

describe('clean-air windows', () => {
  const flat = (aqi) =>
    Array.from({ length: 24 }, (_, hour) => ({
      time: `2026-11-18T${String(hour).padStart(2, '0')}:00`,
      aqi: typeof aqi === 'function' ? aqi(hour) : aqi,
    }));

  test('picks the cleanest slot inside each activity opening hours', () => {
    const windows = computeWindows(flat((hour) => (hour === 14 ? 40 : 160)));
    const exercise = windows.activities.find((a) => a.key === 'exercise');
    expect(exercise.window).toMatchObject({
      start: '14:00',
      end: '15:00',
      avgAqi: 40,
      verdict: 'go',
    });
    const laundry = windows.activities.find((a) => a.key === 'laundry');
    expect(laundry.window.span).toBe(3);
    expect(laundry.window.avgAqi).toBeLessThan(160);
  });

  test('never schedules an activity outside its hours and marks the grid closed', () => {
    const windows = computeWindows(flat((hour) => (hour === 3 ? 10 : 200)));
    const children = windows.activities.find((a) => a.key === 'children');
    expect(children.window.start).not.toBe('03:00');
    expect(children.grid[3]).toBe('closed');
    expect(children.window.verdict).toBe('avoid');
  });

  test('children get stricter thresholds than general exercise', () => {
    expect(verdictFor(70, { go: 75, caution: 125 })).toBe('go');
    expect(verdictFor(70, { go: 60, caution: 100 })).toBe('caution');
  });

  test('handles an empty forecast and summarises for the prompt', () => {
    const empty = computeWindows([]);
    expect(empty.activities.every((a) => a.window === null)).toBe(true);
    const summary = summarizeForPrompt(computeWindows(flat(90)));
    expect(summary.exercise).toMatchObject({ verdict: 'caution' });
    expect(summarizeForPrompt(empty).exercise).toBeNull();
  });
});

describe('telemetry', () => {
  test('aggregates request latency per route and keeps a bounded trace list', () => {
    const tel = createTelemetry();
    [10, 20, 30, 40, 100].forEach((ms) =>
      tel.recordRequest({ route: '/api/x', method: 'GET', status: 200, ms }),
    );
    tel.recordRequest({ route: '/api/x', method: 'GET', status: 500, ms: 5 });
    const snap = tel.snapshot();
    expect(snap.totalRequests).toBe(6);
    expect(snap.byRoute['GET /api/x']).toMatchObject({ count: 6, errors: 1 });
    expect(snap.byRoute['GET /api/x'].p95Ms).toBe(100);

    for (let i = 0; i < 20; i += 1) tel.startTrace({}).finish({ outcome: 'ok' });
    expect(tel.snapshot().traces).toHaveLength(12);
  });

  test('stage records timing, failures and skips', async () => {
    const tel = createTelemetry();
    const run = tel.startTrace({ provider: 'test' });
    await run.stage(
      'a',
      'Step A',
      () => 1,
      () => 'fine',
    );
    await expect(
      run.stage('b', 'Step B', () => {
        throw Object.assign(new Error('boom'), { code: 'BOOM' });
      }),
    ).rejects.toThrow('boom');
    run.skip('c', 'Step C', 'not needed');
    const trace = run.finish({ outcome: 'done' });
    expect(trace.steps.map((s) => [s.key, s.status])).toEqual([
      ['a', 'ok'],
      ['b', 'failed'],
      ['c', 'skipped'],
    ]);
    expect(trace.steps[1].detail).toBe('BOOM');
    expect(tel.getTrace(trace.id)).toBe(trace);
  });

  test('cache statistics count hits and misses', async () => {
    const cache = new TtlCache({ ttlMs: 1000 });
    await cache.wrap('k', async () => 1);
    await cache.wrap('k', async () => 1);
    expect(cache.stats()).toMatchObject({ hits: 1, misses: 1, size: 1, hitRate: 50 });
  });
});

describe('GenAI trace through getAdvice', () => {
  beforeEach(() => clearCache());
  const getEnvironment = async () => ({
    ...environment,
    windows: computeWindows(environment.air.forecast),
  });

  test('dry run without a key shows the prompt, skips the model and explains why', async () => {
    const tel = createTelemetry();
    const result = await getAdvice(input, {
      getEnvironment,
      aiClient: { isConfigured: () => false },
      telemetry: tel,
    });
    const trace = tel.getTrace(result.traceId);
    expect(result.source).toBe('fallback');
    expect(trace.fallbackReason).toBe('no-api-key');
    expect(trace.steps.map((s) => s.key)).toEqual([
      'environment',
      'impact',
      'sanitize',
      'prompt',
      'ai',
      'validate',
      'fallback',
    ]);
    expect(trace.steps.find((s) => s.key === 'ai').status).toBe('skipped');
    expect(JSON.parse(trace.prompt).cleanAirWindows.exercise).toBeTruthy();
  });

  test('records raw model output and a failed validation with readable issues', async () => {
    const tel = createTelemetry();
    const result = await getAdvice(input, {
      getEnvironment,
      aiClient: { isConfigured: () => true, generateJson: async () => ({ summary: 'only' }) },
      telemetry: tel,
    });
    const trace = tel.getTrace(result.traceId);
    expect(trace.fallbackReason).toBe('invalid-output');
    expect(trace.validation.ok).toBe(false);
    expect(trace.validation.issues.length).toBeGreaterThan(0);
    expect(trace.rawOutput).toContain('only');
    expect(trace.steps.find((s) => s.key === 'validate').status).toBe('failed');
  });

  test('marks a cache hit and never calls the model twice', async () => {
    const tel = createTelemetry();
    const advice = {
      summary: 's',
      riskLevel: 'high',
      dailyRoutine: [
        { when: 'a', action: 'b', why: 'c' },
        { when: 'd', action: 'e', why: 'f' },
      ],
      indoorTips: [
        { tip: 'a', why: 'b' },
        { tip: 'c', why: 'd' },
      ],
      sustainableAlternatives: [
        { swap: 'a', why: 'b' },
        { swap: 'c', why: 'd' },
      ],
      impactExplanation: 'x',
    };
    const aiClient = { isConfigured: () => true, generateJson: jest.fn(async () => advice) };
    await getAdvice(input, { getEnvironment, aiClient, telemetry: tel });
    const second = await getAdvice(input, { getEnvironment, aiClient, telemetry: tel });
    expect(aiClient.generateJson).toHaveBeenCalledTimes(1);
    const trace = tel.getTrace(second.traceId);
    expect(trace.cacheHit).toBe(true);
    expect(trace.steps.find((s) => s.key === 'ai').detail).toMatch(/cache/);
  });
});

describe('diagnostics API', () => {
  let app;
  beforeAll(() => {
    app = createApp();
  });
  beforeEach(() => {
    global.fetch = mockFetch();
    telemetry.reset();
  });

  test('exposes AI config, pipeline, controls, runtime and never any secret', async () => {
    process.env.GEMINI_API_KEY = 'super-secret-value';
    const res = await request(app).get('/api/diagnostics');
    expect(res.status).toBe(200);
    expect(res.body.ai.systemInstruction.sha).toMatch(/^[0-9a-f]{12}$/);
    expect(res.body.ai.systemInstruction.sections).toContain('GROUNDING RULES');
    expect(res.body.pipeline).toHaveLength(PIPELINE.length);
    expect(res.body.controls).toHaveLength(SECURITY_CONTROLS.length);
    expect(res.body.runtime.limits.adviceMax).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain('super-secret-value');
    delete process.env.GEMINI_API_KEY;
  });

  test('environment response carries clean-air windows', async () => {
    const res = await request(app).get('/api/environment?lat=9.1&lon=78.1');
    expect(res.status).toBe(200);
    expect(res.body.windows.activities.map((a) => a.key)).toEqual([
      'exercise',
      'children',
      'commute',
      'ventilate',
      'laundry',
    ]);
    expect(res.body.windows.hours).toHaveLength(24);
  });

  test('records request metrics and serves a trace by id', async () => {
    await request(app).get('/api/health');
    const advice = await request(app).post('/api/advice').send({ lat: 9.5, lon: 78.5 });
    const diag = await request(app).get('/api/diagnostics');
    expect(diag.body.runtime.byRoute['GET /api/health'].count).toBe(1);
    expect(diag.body.traces[0].id).toBe(advice.body.traceId);
    expect(diag.body.traces[0].prompt).toBeUndefined();

    const detail = await request(app).get(`/api/diagnostics/traces/${advice.body.traceId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.trace.prompt).toContain('liveAirQuality');
    expect((await request(app).get('/api/diagnostics/traces/zzzzzzzz')).status).toBe(404);
  });

  test('every live security probe really behaves as the console expects', async () => {
    for (const control of SECURITY_CONTROLS.filter((c) => c.verify.type === 'probe')) {
      const { method, path, body, expectStatus } = control.verify;
      const call = method === 'GET' ? request(app).get(path) : request(app).post(path).send(body);
      const res = await call;
      expect({ key: control.key, status: res.status }).toEqual({
        key: control.key,
        status: expectStatus,
      });
    }
  });

  test('every header check passes on a real response', async () => {
    const res = await request(app).get('/api/health');
    for (const control of SECURITY_CONTROLS.filter((c) => c.verify.type === 'header')) {
      const { name, contains, equals, absent, present } = control.verify;
      const value = res.headers[name];
      if (contains) expect(value).toContain(contains);
      if (equals) expect(value).toBe(equals);
      if (absent) expect(value).toBeUndefined();
      if (present) expect(value).toBeDefined();
    }
  });

  test('serves the system instruction', async () => {
    const res = await request(app).get('/api/system-instruction');
    expect(res.body.text).toContain('ROLE AND SCOPE');
    expect(res.body.sha).toMatch(/^[0-9a-f]{12}$/);
  });
});
