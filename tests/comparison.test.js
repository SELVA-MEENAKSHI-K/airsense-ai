'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const { createApp } = require('../src/app');
const { buildComparison, recommend } = require('../src/services/comparison');
const { normalizeAir } = require('../src/services/environment');
const { airPayload, mockFetch } = require('./fixtures');

const air = normalizeAir(airPayload);
const envWith = (aqi, pm25 = 80) => ({ air: { ...air, current: { ...air.current, aqi, pm25 } } });
const profile = {
  commuteMode: 'motorcycle',
  commuteKm: 12,
  cooking: 'biomass',
  hasPurifier: false,
  homeType: 'apartment',
  vulnerable: [],
};

describe('your plan versus the AirSense plan', () => {
  test('unhealthy air: the AirSense plan changes habits and lowers exposure and CO2', () => {
    const out = buildComparison(envWith(182), { profile, lang: 'en' });
    const byKey = Object.fromEntries(out.rows.map((r) => [r.key, r]));
    expect(byKey.commute).toMatchObject({ yours: 'motorcycle', airsense: 'metro', changed: true });
    expect(byKey.cooking.airsense).toBe('induction');
    expect(byKey.purifier.airsense).toBe(true);
    expect(byKey.mask.airsense).toBe(true);
    expect(out.changes).toBe(5);
    expect(out.results.pm25Exposure.airsense).toBeLessThan(out.results.pm25Exposure.yours);
    expect(out.results.co2KgPerDay.airsense).toBeLessThan(out.results.co2KgPerDay.yours);
  });

  test('clean air: nothing is added that the air does not call for', () => {
    const good = { ...profile, commuteMode: 'metro', cooking: 'induction' };
    const out = buildComparison(envWith(35, 8), { profile: good, lang: 'en' });
    expect(out.changes).toBe(0);
    expect(out.results.pm25Exposure.airsense).toBe(out.results.pm25Exposure.yours);
    expect(out.rows.every((r) => r.why.length > 5)).toBe(true);
  });

  test('working from home needs no mask or peak-hour changes', () => {
    const rec = recommend(180, { ...profile, commuteMode: 'wfh' });
    expect(rec.mask).toBe(false);
    expect(rec.avoidPeak).toBe(false);
  });

  test('walkers and cyclists move indoors only when the air is bad', () => {
    expect(recommend(90, { ...profile, commuteMode: 'walk' }).commuteMode).toBe('walk');
    expect(recommend(180, { ...profile, commuteMode: 'walk' }).commuteMode).toBe('metro');
  });

  test('Tamil text', () => {
    const out = buildComparison(envWith(182), { profile, lang: 'ta' });
    expect(out.rows[0].why).toMatch(/[\u0B80-\u0BFF]/);
  });

  describe('POST /api/compare', () => {
    beforeEach(() => {
      global.fetch = mockFetch();
    });
    test('returns a comparison from live data', async () => {
      const res = await request(createApp())
        .post('/api/compare')
        .send({ lat: 9.92, lon: 78.12, profile });
      expect(res.status).toBe(200);
      expect(res.body.comparison.rows).toHaveLength(5);
    });
    test('rejects extra keys and bad coordinates', async () => {
      const app = createApp();
      expect((await request(app).post('/api/compare').send({ lat: 9, lon: 78, x: 1 })).status).toBe(
        400,
      );
      expect((await request(app).post('/api/compare').send({ lat: 99, lon: 78 })).status).toBe(400);
    });
  });
});
