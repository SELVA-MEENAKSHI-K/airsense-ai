'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const { createApp } = require('../src/app');
const { buildLocal, levelFor, CUTS } = require('../src/services/local');
const { normalizeAir } = require('../src/services/environment');
const { airPayload, mockFetch } = require('./fixtures');

const air = normalizeAir(airPayload);
const envWith = (aqi) => ({ air: { ...air, current: { ...air.current, aqi } } });

describe('location-based recommendations', () => {
  test('unhealthy air: limit outdoor time and no heavy exercise outside', () => {
    const out = buildLocal(envWith(182), { lang: 'en', place: 'Madurai' });
    expect(out.headline).toMatch(/Madurai: AQI 182/);
    const everyone = out.cards.find((c) => c.key === 'everyone');
    expect(everyone.level).toBe('limit');
    expect(everyone.do.join(' ')).toMatch(/heavy exercise outside/i);
    expect(out.activities.find((a) => a.key === 'jogging').status).toBe('avoid');
    expect(out.activities.find((a) => a.key === 'sports').note).toMatch(/AQI 182/);
  });

  test('children, older adults and sensitive people get stricter levels than everyone', () => {
    const out = buildLocal(envWith(120), { lang: 'en' });
    const level = (key) => out.cards.find((c) => c.key === key).level;
    expect(level('everyone')).toBe('caution');
    for (const key of ['children', 'elderly', 'sensitive']) expect(level(key)).toBe('limit');
  });

  test('selecting a vulnerable group tightens the activity limits', () => {
    const plain = buildLocal(envWith(90), { lang: 'en' });
    const strict = buildLocal(envWith(90), { lang: 'en', groups: ['children'] });
    expect(plain.activities.find((a) => a.key === 'walking').status).toBe('ok');
    expect(strict.activities.find((a) => a.key === 'walking').status).toBe('caution');
    expect(strict.strict).toBe(true);
  });

  test('clean air allows everything and levels are monotonic', () => {
    const out = buildLocal(envWith(30), { lang: 'en' });
    expect(out.activities.every((a) => a.status === 'ok')).toBe(true);
    const order = ['good', 'caution', 'limit', 'avoid'];
    for (const cuts of Object.values(CUTS)) {
      let last = 0;
      for (let aqi = 0; aqi <= 400; aqi += 5) {
        const i = order.indexOf(levelFor(aqi, cuts));
        expect(i).toBeGreaterThanOrEqual(last);
        last = i;
      }
    }
  });

  test('Tamil text is returned and numbers are the live AQI', () => {
    const out = buildLocal(envWith(182), { lang: 'ta', place: 'மதுரை' });
    expect(out.headline).toMatch(/182/);
    expect(out.cards[0].title).toBe('குழந்தைகள்');
  });

  describe('GET /api/local', () => {
    let app;
    beforeAll(() => {
      app = createApp();
    });
    beforeEach(() => {
      global.fetch = mockFetch();
    });

    test('returns live-data recommendations', async () => {
      const res = await request(app).get(
        '/api/local?lat=9.92&lon=78.12&place=Madurai&groups=children,elderly',
      );
      expect(res.status).toBe(200);
      expect(res.body.local.aqi).toBe(182);
      expect(res.body.local.cards).toHaveLength(4);
      expect(res.body.local.cards.filter((c) => c.selected)).toHaveLength(2);
    });

    test('rejects unknown groups, bad coordinates and extra keys', async () => {
      expect((await request(app).get('/api/local?lat=9&lon=78&groups=aliens')).status).toBe(400);
      expect((await request(app).get('/api/local?lat=99&lon=78')).status).toBe(400);
      expect((await request(app).get('/api/local?lat=9&lon=78&x=1')).status).toBe(400);
    });
  });
});
