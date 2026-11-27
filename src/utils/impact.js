'use strict';

const { PM25_PER_CIGARETTE } = require('./aqi');

/**
 * Deterministic impact model.
 *
 * The numbers shown to users ("how much does my choice matter?") are computed here,
 * not by the language model, so they are reproducible and cannot be hallucinated.
 * The GenAI layer is only asked to explain them.
 *
 * All factors are rounded, literature-informed approximations meant for awareness,
 * not for medical or regulatory use. They are listed in `ASSUMPTIONS`.
 */

/** gPerKm: grams CO2 per passenger-km. exposure: share of ambient PM2.5 inhaled while commuting. */
const MODES = Object.freeze({
  car: { gPerKm: 170, exposure: 0.6, kmh: 22 },
  motorcycle: { gPerKm: 70, exposure: 1.0, kmh: 25 },
  auto: { gPerKm: 90, exposure: 1.0, kmh: 18 },
  bus: { gPerKm: 40, exposure: 0.9, kmh: 18 },
  metro: { gPerKm: 25, exposure: 0.4, kmh: 32 },
  bicycle: { gPerKm: 0, exposure: 1.2, kmh: 14 },
  walk: { gPerKm: 0, exposure: 1.1, kmh: 5 },
  wfh: { gPerKm: 0, exposure: 0, kmh: 1 },
});

/** Upper bound of the illustrative haze reduction. Mirrors MAX_REDUCTION in public/js/skyline.js and world3d.js. */
const MAX_HAZE_REDUCTION = 0.75;

const OPEN_AIR_MODES = new Set(['motorcycle', 'auto', 'bus', 'bicycle', 'walk']);

/** Extra indoor PM2.5 (µg/m³) while cooking, by fuel. */
const COOKING_PM = Object.freeze({ lpg: 10, induction: 0, biomass: 60 });

const FACTORS = Object.freeze({
  commuteDaysPerYear: 250,
  maxCommuteHours: 8,
  otherOutdoorHours: 1,
  cookingHours: 1.5,
  indoorInfiltration: 0.7,
  indoorInfiltrationWithPurifier: 0.3,
  purifierCookingFactor: 0.5,
  maskFactor: 0.25,
  avoidPeakFactor: 0.85,
  kgCo2PerTreePerYear: 21,
});

const ASSUMPTIONS = Object.freeze([
  'CO2 uses average grams per passenger-km for each travel mode.',
  'Commute length is counted twice per day (to and fro) on 250 days a year.',
  'Indoor air carries about 70% of outdoor PM2.5, or 30% with a purifier running.',
  'A well-fitted N95 mask cuts inhaled PM2.5 by about 75% in open-air travel.',
  '22 µg/m³ of PM2.5 over a day is treated as roughly one cigarette.',
  'The skyline haze change is an illustration of many households acting together.',
]);

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Daily CO2 (kg) for a commute.
 * @param {string} mode
 * @param {number} oneWayKm
 * @returns {number}
 */
function dailyCo2Kg(mode, oneWayKm) {
  const dailyKm = mode === 'wfh' ? 0 : oneWayKm * 2;
  return (MODES[mode].gPerKm * dailyKm) / 1000;
}

/**
 * Average PM2.5 (µg/m³) a person breathes over 24h for one lifestyle setup.
 * @param {object} input
 * @returns {number}
 */
function averagePm25Exposure({ pm25, mode, oneWayKm, cooking, purifier, mask, avoidPeak }) {
  const modeInfo = MODES[mode];
  const dailyKm = mode === 'wfh' ? 0 : oneWayKm * 2;
  const commuteHours = Math.min(FACTORS.maxCommuteHours, dailyKm / modeInfo.kmh);
  const indoorHours = 24 - commuteHours - FACTORS.otherOutdoorHours;
  const infiltration = purifier
    ? FACTORS.indoorInfiltrationWithPurifier
    : FACTORS.indoorInfiltration;

  let commuteFactor = modeInfo.exposure;
  if (mask && OPEN_AIR_MODES.has(mode)) commuteFactor *= FACTORS.maskFactor;
  if (avoidPeak) commuteFactor *= FACTORS.avoidPeakFactor;

  const cookingExtra = COOKING_PM[cooking] * (purifier ? FACTORS.purifierCookingFactor : 1);
  const nonCookingIndoorHours = indoorHours - FACTORS.cookingHours;

  const totalDose =
    commuteHours * pm25 * commuteFactor +
    FACTORS.otherOutdoorHours * pm25 +
    nonCookingIndoorHours * pm25 * infiltration +
    FACTORS.cookingHours * (pm25 * infiltration + cookingExtra);

  return totalDose / 24;
}

/**
 * Compare the user's current routine with the "what if" choices.
 * @param {{profile: object, choices: object, pm25: number}} params
 * @returns {object} Impact summary with baseline, scenario, savings and community effect.
 */
function computeImpact({ profile, choices, pm25 }) {
  const safePm25 = Number.isFinite(pm25) && pm25 > 0 ? pm25 : 0;
  const scenarioMode = choices.switchCommute || profile.commuteMode;

  const baselinePm = averagePm25Exposure({
    pm25: safePm25,
    mode: profile.commuteMode,
    oneWayKm: profile.commuteKm,
    cooking: profile.cooking,
    purifier: profile.hasPurifier,
    mask: false,
    avoidPeak: false,
  });
  const scenarioPm = averagePm25Exposure({
    pm25: safePm25,
    mode: scenarioMode,
    oneWayKm: profile.commuteKm,
    cooking: choices.cleanCooking ? 'induction' : profile.cooking,
    purifier: profile.hasPurifier || choices.usePurifier,
    mask: choices.wearMask,
    avoidPeak: choices.avoidPeakHours,
  });

  const baselineCo2 = dailyCo2Kg(profile.commuteMode, profile.commuteKm);
  const scenarioCo2 = dailyCo2Kg(scenarioMode, profile.commuteKm);
  const co2SavedPerDay = baselineCo2 - scenarioCo2;
  const co2SavedPerYear = co2SavedPerDay * FACTORS.commuteDaysPerYear;

  const exposureCutPct = baselinePm > 0 ? ((baselinePm - scenarioPm) / baselinePm) * 100 : 0;
  const cigarettesAvoided = (baselinePm - scenarioPm) / PM25_PER_CIGARETTE;

  const emissionCut = baselineCo2 > 0 ? clamp(co2SavedPerDay / baselineCo2, 0, 1) : 0;
  const exposureCut = clamp(exposureCutPct / 100, 0, 1);
  const communityReach = Math.min(1, Math.log10(1 + choices.households) / 4);
  const visualHazeReduction = clamp(
    communityReach * (0.5 * emissionCut + 0.5 * exposureCut) * MAX_HAZE_REDUCTION,
    0,
    MAX_HAZE_REDUCTION,
  );

  const exposureFor = (patch) =>
    averagePm25Exposure({
      pm25: safePm25,
      mode: profile.commuteMode,
      oneWayKm: profile.commuteKm,
      cooking: profile.cooking,
      purifier: profile.hasPurifier,
      mask: false,
      avoidPeak: false,
      ...patch,
    });
  const cutOf = (pm) => (baselinePm > 0 ? ((baselinePm - pm) / baselinePm) * 100 : 0);

  // What each choice is worth on its own, whether or not it is switched on.
  const alone = [];
  if (choices.switchCommute && choices.switchCommute !== profile.commuteMode) {
    alone.push({
      key: 'switchCommute',
      active: true,
      co2: baselineCo2 - dailyCo2Kg(choices.switchCommute, profile.commuteKm),
      pm: exposureFor({ mode: choices.switchCommute }),
    });
  }
  if (!profile.hasPurifier) {
    alone.push({
      key: 'usePurifier',
      active: choices.usePurifier,
      co2: 0,
      pm: exposureFor({ purifier: true }),
    });
  }
  alone.push({
    key: 'wearMask',
    active: choices.wearMask,
    co2: 0,
    pm: exposureFor({ mask: true }),
  });
  if (profile.cooking !== 'induction') {
    alone.push({
      key: 'cleanCooking',
      active: choices.cleanCooking,
      co2: 0,
      pm: exposureFor({ cooking: 'induction' }),
    });
  }
  alone.push({
    key: 'avoidPeakHours',
    active: choices.avoidPeakHours,
    co2: 0,
    pm: exposureFor({ avoidPeak: true }),
  });
  const breakdown = alone.map((item) => ({
    key: item.key,
    active: Boolean(item.active),
    co2KgPerDay: round(item.co2, 2),
    exposureCutPct: round(cutOf(item.pm), 1),
    cigarettesPerDay: round((baselinePm - item.pm) / PM25_PER_CIGARETTE, 2),
  }));

  // Every way of getting around, at this person's distance and today's air.
  const modes = Object.keys(MODES).map((mode) => {
    const dailyKm = mode === 'wfh' ? 0 : profile.commuteKm * 2;
    const co2 = dailyCo2Kg(mode, profile.commuteKm);
    return {
      mode,
      current: mode === profile.commuteMode,
      co2KgPerYear: round(co2 * FACTORS.commuteDaysPerYear, 0),
      avgPm25: round(exposureFor({ mode }), 1),
      minutesPerDay: Math.round((dailyKm / MODES[mode].kmh) * 60),
    };
  });

  return {
    breakdown,
    modes,
    inputs: { pm25: round(safePm25), scenarioMode },
    baseline: {
      avgPm25: round(baselinePm),
      cigarettesPerDay: round(baselinePm / PM25_PER_CIGARETTE, 2),
      co2KgPerDay: round(baselineCo2, 2),
    },
    scenario: {
      avgPm25: round(scenarioPm),
      cigarettesPerDay: round(scenarioPm / PM25_PER_CIGARETTE, 2),
      co2KgPerDay: round(scenarioCo2, 2),
    },
    savings: {
      co2KgPerDay: round(co2SavedPerDay, 2),
      co2KgPerYear: round(co2SavedPerYear, 0),
      treesEquivalent: round(co2SavedPerYear / FACTORS.kgCo2PerTreePerYear, 1),
      exposureCutPct: round(exposureCutPct, 0),
      cigarettesAvoidedPerDay: round(cigarettesAvoided, 2),
    },
    community: {
      households: choices.households,
      co2TonnesPerYear: round((co2SavedPerYear * choices.households) / 1000, 1),
      visualHazeReduction: round(visualHazeReduction, 3),
    },
    assumptions: ASSUMPTIONS,
  };
}

module.exports = {
  MODES,
  COOKING_PM,
  FACTORS,
  ASSUMPTIONS,
  dailyCo2Kg,
  averagePm25Exposure,
  computeImpact,
};
