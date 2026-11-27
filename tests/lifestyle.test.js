'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const { createApp } = require('../src/app');
const { buildPlanner, alertLevel } = require('../src/services/planner');
const { buildIndoor } = require('../src/services/indoor');
const { buildSustainability, isoWeek, impactFor } = require('../src/services/sustainability');
const { normalizeAir } = require('../src/services/environment');
const { computeWindows } = require('../src/services/windows');
const { airPayload, mockFetch } = require('./fixtures');

const air = normalizeAir(airPayload);
const withAqi = (aqi, hours) => {
  const forecast = Array.from({ length: 24 }, (_, hour) => ({
    time: `2026-11-18T${String(hour).padStart(2, '0')}:00`,
    aqi: typeof hours === 'function' ? hours(hour) : aqi,
    pm25: 20,
    level: 0,
    color: '#fff',
  }));
  return {
    air: { ...air, current: { ...air.current, aqi }, forecast },
    weather: { temperatureC: 20, humidity: 50, isDay: true, windKmh: 5, windDeg: 0 },
    windows: computeWindows(forecast),
  };
};
const prefs = {
  activities: ['walking', 'jogging'],
  sensitivity: 'normal',
  period: 'morning',
  respiratory: false,
};

describe('daily planner', () => {
  test('clean air: outdoors everywhere, no mask, alert none', () => {
    const plan = buildPlanner(withAqi(40), { lifestyle: 'professional', prefs, lang: 'en' });
    expect(plan.alert.level).toBe('none');
    expect(plan.periods.every((p) => p.mode === 'outdoor')).toBe(true);
    expect(plan.activities.every((a) => a.mode === 'outdoor')).toBe(true);
    expect(plan.checklist.some((c) => c.key === 'mask')).toBe(false);
  });

  test('smoggy air: indoor mode, mask, shut windows, purifier and wash-up on the checklist', () => {
    const plan = buildPlanner(withAqi(220), { lifestyle: 'parent', prefs, lang: 'en' });
    expect(plan.alert.level).toBe('severe');
    expect(plan.outdoorNow).toBe('indoor');
    const keys = plan.checklist.map((c) => c.key);
    expect(keys).toEqual(
      expect.arrayContaining(['mask', 'windows', 'purifier', 'indoorPlay', 'wash']),
    );
  });

  test('finds the clean slot: walking goes outdoors only in the clean hour', () => {
    const plan = buildPlanner(
      withAqi(180, (h) => (h === 15 ? 40 : 180)),
      { lifestyle: 'professional', prefs, lang: 'en' },
    );
    const walking = plan.activities.find((a) => a.key === 'walking');
    expect(walking.slot).toMatchObject({ start: '15:00', verdict: 'go' });
    expect(walking.mode).toBe('outdoor');
    expect(walking.advice).toContain('15:00');
  });

  test('sensitive lifestyles and respiratory conditions use stricter limits and get an earlier alert', () => {
    const env = withAqi(80);
    const adult = buildPlanner(env, {
      lifestyle: 'professional',
      prefs: { ...prefs, activities: ['jogging'] },
      lang: 'en',
    });
    const elder = buildPlanner(env, {
      lifestyle: 'elder',
      prefs: { ...prefs, activities: ['jogging'] },
      lang: 'en',
    });
    expect(adult.activities[0].mode).toBe('limited');
    expect(elder.activities[0].mode).toBe('limited');
    expect(alertLevel(80, true)).toBe('watch');
    expect(alertLevel(80, false)).toBe('none');
    expect(elder.alert.level).toBe('watch');
    const withInhaler = buildPlanner(env, {
      lifestyle: 'elder',
      prefs: { ...prefs, respiratory: true },
      lang: 'en',
    });
    expect(withInhaler.checklist.some((c) => c.key === 'inhaler')).toBe(true);
  });

  test('warns when air is about to turn unhealthy and when it will clear', () => {
    const rising = buildPlanner(
      withAqi(90, (h) => (h >= 18 ? 190 : 90)),
      { lifestyle: 'professional', prefs, lang: 'en' },
    );
    expect(rising.alert.upcoming[0]).toMatchObject({ type: 'worsens', at: '18:00' });
    const clearing = buildPlanner(
      withAqi(180, (h) => (h >= 13 ? 80 : 180)),
      { lifestyle: 'professional', prefs, lang: 'en' },
    );
    expect(clearing.alert.upcoming.some((u) => u.type === 'improves' && u.at === '13:00')).toBe(
      true,
    );
  });

  test('every lifestyle has tips and Tamil output is Tamil', () => {
    for (const lifestyle of ['student', 'professional', 'elder', 'parent']) {
      const plan = buildPlanner(withAqi(120), { lifestyle, prefs, lang: 'ta' });
      expect(plan.tips).toHaveLength(3);
      expect(plan.periods[0].label).toMatch(/[஀-௿]/);
    }
  });
});

describe('indoor air', () => {
  test('ventilation advice follows outdoor AQI', () => {
    expect(buildIndoor(withAqi(60), { lang: 'en' }).ventilation.status).toBe('open');
    expect(buildIndoor(withAqi(130), { lang: 'en' }).ventilation.status).toBe('brief');
    const closed = buildIndoor(withAqi(210), { lang: 'en' });
    expect(closed.ventilation.status).toBe('closed');
    expect(closed.ventilation.text).toContain('210');
    expect(closed.sections[0].key).toBe('budget');
  });

  test('plants are described with honest limits', () => {
    const { plants } = buildIndoor(withAqi(100), { lang: 'en' });
    expect(plants.honest).toMatch(/not an air cleaner/i);
    expect(plants.items.length).toBeGreaterThanOrEqual(3);
    expect(plants.items.every((p) => p.caution)).toBe(true);
  });
});

describe('sustainability', () => {
  test('impact figures come from the shared emission factors, and unreliable ones are left out', () => {
    // car 170 g/km vs metro 25 g/km, 12 km each way, 250 days = 870 kg
    expect(impactFor('transit', 12, 'en').kgCo2PerYear).toBe(870);
    expect(impactFor('carpool', 12, 'en').kgCo2PerYear).toBe(680);
    expect(impactFor('ac', 12, 'en')).toMatchObject({ kgCo2PerYear: null, approximate: false });
  });

  test('cycling is gated by the air', () => {
    const find = (aqi) =>
      buildSustainability(withAqi(aqi), { lifestyle: 'student', lang: 'en' }).actions.find(
        (a) => a.key === 'cycleWalk',
      );
    expect(find(60).gate.status).toBe('go');
    expect(find(130).gate.status).toBe('caution');
    expect(find(190).gate.status).toBe('avoid');
  });

  test('lifestyle changes the order of actions', () => {
    const first = (lifestyle) =>
      buildSustainability(withAqi(100), { lifestyle, lang: 'en' }).actions[0].key;
    expect(first('student')).toBe('cycleWalk');
    expect(first('professional')).toBe('transit');
    expect(first('parent')).toBe('carpool');
  });

  test('weekly challenge is stable within a week and rotates across weeks', () => {
    expect(isoWeek(new Date('2026-11-19T10:00:00Z'))).toEqual({ year: 2026, week: 47 });
    const a = buildSustainability(withAqi(100), {
      lifestyle: 'student',
      lang: 'en',
      now: new Date('2026-11-16T00:00:00Z'),
    });
    const b = buildSustainability(withAqi(100), {
      lifestyle: 'student',
      lang: 'en',
      now: new Date('2026-11-22T23:00:00Z'),
    });
    const next = buildSustainability(withAqi(100), {
      lifestyle: 'student',
      lang: 'en',
      now: new Date('2026-11-23T00:00:00Z'),
    });
    expect(a.challenge.weekId).toBe(b.challenge.weekId);
    expect(next.challenge.weekId).not.toBe(a.challenge.weekId);
    expect(next.challenge.theme).not.toBe(a.challenge.theme);
    expect(a.challenge.tasks).toHaveLength(5);
  });
});

describe('lifestyle API', () => {
  let app;
  beforeAll(() => {
    app = createApp();
  });
  beforeEach(() => {
    global.fetch = mockFetch();
  });

  test('POST /api/planner', async () => {
    const res = await request(app)
      .post('/api/planner')
      .send({ lat: 9.9, lon: 78.1, lifestyle: 'elder' });
    expect(res.status).toBe(200);
    expect(res.body.planner.aqi).toBe(182);
    expect(res.body.planner.periods).toHaveLength(3);
    expect(
      (await request(app).post('/api/planner').send({ lat: 9.9, lon: 78.1, lifestyle: 'alien' }))
        .status,
    ).toBe(400);
    expect(
      (await request(app).post('/api/planner').send({ lat: 9.9, lon: 78.1, extra: 1 })).status,
    ).toBe(400);
  });

  test('GET /api/indoor and /api/sustainability', async () => {
    const indoor = await request(app).get('/api/indoor?lat=9.9&lon=78.1&lang=ta');
    expect(indoor.status).toBe(200);
    expect(indoor.body.indoor.ventilation.label).toMatch(/[஀-௿]/);
    const green = await request(app).get('/api/sustainability?lat=9.9&lon=78.1&lifestyle=parent');
    expect(green.status).toBe(200);
    expect(green.body.sustainability.actions[0].key).toBe('carpool');
    expect(
      (await request(app).get('/api/sustainability?lat=9.9&lon=78.1&lifestyle=x')).status,
    ).toBe(400);
  });
});
