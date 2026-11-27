'use strict';

const { computeImpact, dailyCo2Kg, averagePm25Exposure } = require('../src/utils/impact');
const { defaultProfile, defaultChoices } = require('./fixtures');

describe('impact calculator', () => {
  test('computes commute CO2 from mode and distance', () => {
    // 8 km each way, 16 km a day, 70 g/km
    expect(dailyCo2Kg('motorcycle', 8)).toBeCloseTo(1.12, 2);
    expect(dailyCo2Kg('wfh', 50)).toBe(0);
    expect(dailyCo2Kg('walk', 5)).toBe(0);
  });

  test('no changes means no savings', () => {
    const impact = computeImpact({ profile: defaultProfile, choices: defaultChoices, pm25: 90 });
    expect(impact.savings.co2KgPerDay).toBe(0);
    expect(impact.savings.exposureCutPct).toBe(0);
    expect(impact.community.visualHazeReduction).toBe(0);
  });

  test('switching a car commute to metro saves CO2 and exposure', () => {
    const profile = { ...defaultProfile, commuteMode: 'car', commuteKm: 15 };
    const impact = computeImpact({
      profile,
      choices: { ...defaultChoices, switchCommute: 'metro', households: 1000 },
      pm25: 100,
    });
    // (170 - 25) g/km * 30 km = 4.35 kg/day
    expect(impact.savings.co2KgPerDay).toBeCloseTo(4.35, 2);
    expect(impact.savings.co2KgPerYear).toBe(1088);
    expect(impact.savings.treesEquivalent).toBeGreaterThan(40);
    expect(impact.community.co2TonnesPerYear).toBeGreaterThan(1000);
    expect(impact.community.visualHazeReduction).toBeGreaterThan(0);
    expect(impact.community.visualHazeReduction).toBeLessThanOrEqual(0.75);
  });

  test('mask and purifier reduce exposure without changing CO2', () => {
    const impact = computeImpact({
      profile: defaultProfile,
      choices: { ...defaultChoices, wearMask: true, usePurifier: true },
      pm25: 120,
    });
    expect(impact.savings.co2KgPerDay).toBe(0);
    expect(impact.savings.exposureCutPct).toBeGreaterThan(20);
    expect(impact.savings.cigarettesAvoidedPerDay).toBeGreaterThan(0);
  });

  test('clean cooking helps biomass households more than LPG households', () => {
    const choices = { ...defaultChoices, cleanCooking: true };
    const biomass = computeImpact({
      profile: { ...defaultProfile, cooking: 'biomass' },
      choices,
      pm25: 60,
    });
    const lpg = computeImpact({ profile: defaultProfile, choices, pm25: 60 });
    expect(biomass.savings.exposureCutPct).toBeGreaterThan(lpg.savings.exposureCutPct);
    expect(lpg.savings.exposureCutPct).toBeGreaterThan(0);
  });

  test('a worse choice shows negative savings (honest direction)', () => {
    const profile = { ...defaultProfile, commuteMode: 'metro' };
    const impact = computeImpact({
      profile,
      choices: { ...defaultChoices, switchCommute: 'car' },
      pm25: 80,
    });
    expect(impact.savings.co2KgPerDay).toBeLessThan(0);
  });

  test('zero pollution yields zero exposure and handles bad input', () => {
    expect(
      averagePm25Exposure({
        pm25: 0,
        mode: 'car',
        oneWayKm: 10,
        cooking: 'lpg',
        purifier: false,
        mask: false,
        avoidPeak: false,
      }),
    ).toBe((10 * 1.5) / 24);
    const impact = computeImpact({ profile: defaultProfile, choices: defaultChoices, pm25: NaN });
    expect(impact.inputs.pm25).toBe(0);
  });

  test('breakdown values each choice on its own, whether or not it is switched on', () => {
    const impact = computeImpact({ profile: defaultProfile, choices: defaultChoices, pm25: 90 });
    const keys = impact.breakdown.map((b) => b.key);
    expect(keys).toEqual(expect.arrayContaining(['usePurifier', 'wearMask', 'avoidPeakHours']));
    const purifier = impact.breakdown.find((b) => b.key === 'usePurifier');
    expect(purifier.active).toBe(false);
    expect(purifier.exposureCutPct).toBeGreaterThan(0);
    // A purifier you already own is not offered again.
    const owned = computeImpact({
      profile: { ...defaultProfile, hasPurifier: true },
      choices: defaultChoices,
      pm25: 90,
    });
    expect(owned.breakdown.some((b) => b.key === 'usePurifier')).toBe(false);
  });

  test('mode table ranks every way of travelling at this distance and air', () => {
    const profile = { ...defaultProfile, commuteMode: 'car', commuteKm: 10 };
    const { modes } = computeImpact({ profile, choices: defaultChoices, pm25: 120 });
    expect(modes).toHaveLength(8);
    expect(modes.find((m) => m.current).mode).toBe('car');
    expect(modes.find((m) => m.mode === 'wfh')).toMatchObject({
      co2KgPerYear: 0,
      minutesPerDay: 0,
    });
    const car = modes.find((m) => m.mode === 'car');
    const metro = modes.find((m) => m.mode === 'metro');
    expect(metro.co2KgPerYear).toBeLessThan(car.co2KgPerYear);
    expect(metro.avgPm25).toBeLessThan(car.avgPm25);
  });
});
