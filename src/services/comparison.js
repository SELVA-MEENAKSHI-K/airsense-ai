'use strict';

/**
 * "Your plan" versus the "AirSense plan".
 * Your plan is what the person told us they do today. The AirSense plan changes only what the
 * live air makes worthwhile, using fixed rules. Both sides are priced with the same impact model,
 * so every number in the comparison comes from one calculation.
 */

const { computeImpact, FACTORS } = require('../utils/impact');

const MOTORISED = ['car', 'motorcycle', 'auto'];

const COPY = {
  en: {
    already: 'Already a good fit for today’s air.',
    why: {
      commute: 'Metro or a bus cuts both your emissions and the smog you breathe on the road.',
      commuteHigh:
        'At this AQI, time spent walking or cycling on busy roads adds to what you breathe. A metro ride is enclosed and cooler.',
      cooking: 'Induction gives off no indoor smoke, unlike firewood or coal.',
      cookingHigh:
        'Induction adds no indoor smoke, which matters more when the outdoor air is already poor.',
      purifier:
        'A HEPA purifier in the room where you spend the most time lowers indoor fine dust.',
      mask: 'A well-fitted N95 filters most fine particles during the time you are outside.',
      peak: 'Moving trips out of the morning and evening smog peaks lowers what you breathe.',
    },
  },
  ta: {
    already: 'இன்றைய காற்றுக்கு ஏற்கெனவே பொருத்தமாக உள்ளது.',
    why: {
      commute: 'மெட்ரோ அல்லது பேருந்து உங்கள் உமிழ்வையும் சாலையில் சுவாசிக்கும் புகைமூட்டத்தையும் குறைக்கும்.',
      commuteHigh:
        'இந்த AQI-ல் நெரிசலான சாலையில் நடப்பது, சைக்கிள் ஓட்டுவது அதிகம் சுவாசிக்கச் செய்யும். மெட்ரோ மூடிய, குளிர்ந்த பயணம்.',
      cooking: 'விறகு, நிலக்கரி போலல்லாமல் இண்டக்ஷன் வீட்டுக்குள் புகை தராது.',
      cookingHigh: 'இண்டக்ஷன் வீட்டுக்குள் புகை சேர்க்காது; வெளிக்காற்று மோசமாக இருக்கும்போது இது முக்கியம்.',
      purifier: 'நீங்கள் அதிக நேரம் இருக்கும் அறையில் HEPA சுத்திகரிப்பான் நுண்தூசியைக் குறைக்கும்.',
      mask: 'சரியாகப் பொருந்தும் N95 முகக்கவசம் வெளியில் இருக்கும்போது நுண்துகள்களில் பெரும்பாலானவற்றை வடிகட்டும்.',
      peak: 'காலை, மாலை புகைமூட்ட உச்சங்களிலிருந்து பயணங்களை மாற்றினால் சுவாசிக்கும் அளவு குறையும்.',
    },
  },
};

/** The fixed rules that turn today's AQI and a profile into recommended habits. */
function recommend(aqi, profile) {
  const high = aqi >= 150;
  const poor = aqi >= 100;
  let commuteMode = profile.commuteMode;
  let commuteWhy = null;
  if (MOTORISED.includes(commuteMode) && profile.commuteKm >= 3) {
    commuteMode = 'metro';
    commuteWhy = 'commute';
  } else if (high && ['bicycle', 'walk'].includes(commuteMode) && profile.commuteKm >= 3) {
    commuteMode = 'metro';
    commuteWhy = 'commuteHigh';
  }

  let cooking = profile.cooking;
  let cookingWhy = null;
  if (cooking === 'biomass') {
    cooking = 'induction';
    cookingWhy = 'cooking';
  } else if (cooking === 'lpg' && poor) {
    cooking = 'induction';
    cookingWhy = 'cookingHigh';
  }

  const outside = commuteMode !== 'wfh';
  return {
    commuteMode,
    cooking,
    hasPurifier: profile.hasPurifier || poor,
    mask: poor && outside,
    avoidPeak: poor && outside,
    why: {
      commute: commuteWhy,
      cooking: cookingWhy,
      purifier: !profile.hasPurifier && poor ? 'purifier' : null,
      mask: poor && outside ? 'mask' : null,
      peak: poor && outside ? 'peak' : null,
    },
  };
}

/**
 * @param {{air: object}} environment
 * @param {{profile: object, lang: 'en'|'ta'}} options
 */
function buildComparison(environment, { profile, lang }) {
  const copy = COPY[lang] || COPY.en;
  const { aqi, pm25 } = environment.air.current;
  const rec = recommend(aqi, profile);

  const choices = {
    switchCommute: rec.commuteMode !== profile.commuteMode ? rec.commuteMode : null,
    usePurifier: rec.hasPurifier && !profile.hasPurifier,
    wearMask: rec.mask,
    cleanCooking: rec.cooking === 'induction' && profile.cooking !== 'induction',
    avoidPeakHours: rec.avoidPeak,
    households: 1,
  };
  const impact = computeImpact({ profile, choices, pm25 });

  const row = (key, yours, airsense, whyKey) => ({
    key,
    yours,
    airsense,
    changed: yours !== airsense,
    why: yours !== airsense && whyKey ? copy.why[whyKey] : copy.already,
  });

  const rows = [
    row('commute', profile.commuteMode, rec.commuteMode, rec.why.commute),
    row('cooking', profile.cooking, rec.cooking, rec.why.cooking),
    row('purifier', profile.hasPurifier, rec.hasPurifier, rec.why.purifier),
    row('mask', false, rec.mask, rec.why.mask),
    row('peak', false, rec.avoidPeak, rec.why.peak),
  ];

  const co2Year = (kg) => Math.round(kg * FACTORS.commuteDaysPerYear);
  return {
    aqi,
    pm25: Math.round(pm25 || 0),
    rows,
    changes: rows.filter((r) => r.changed).length,
    results: {
      pm25Exposure: { yours: impact.baseline.avgPm25, airsense: impact.scenario.avgPm25 },
      cigarettesPerDay: {
        yours: impact.baseline.cigarettesPerDay,
        airsense: impact.scenario.cigarettesPerDay,
      },
      co2KgPerDay: { yours: impact.baseline.co2KgPerDay, airsense: impact.scenario.co2KgPerDay },
      co2KgPerYear: {
        yours: co2Year(impact.baseline.co2KgPerDay),
        airsense: co2Year(impact.scenario.co2KgPerDay),
      },
      exposureCutPct: impact.savings.exposureCutPct,
    },
  };
}

module.exports = { buildComparison, recommend };
