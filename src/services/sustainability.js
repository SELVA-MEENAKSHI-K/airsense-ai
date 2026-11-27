'use strict';

const { localized } = require('../utils/text');
const content = require('../data/lifestyleContent');
const { MODES, FACTORS } = require('../utils/impact');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const round = (value) => Math.round(value);

/** Approximate average grid emission factor for India, kg CO₂ per kWh. */
const GRID_KG_PER_KWH = 0.71;
const SHORT_TRIP_KM = 4;
const CARPOOL_SIZE = 3;

const BASIS = {
  en: {
    transit: (d) =>
      `Metro instead of driving alone, ${d} km each way, ${FACTORS.commuteDaysPerYear} days a year`,
    carpool: (d) =>
      `Three people sharing one car, ${d} km each way, ${FACTORS.commuteDaysPerYear} days a year`,
    cycleWalk: () =>
      `A ${SHORT_TRIP_KM} km each-way trip by bicycle instead of a motorcycle, ${FACTORS.commuteDaysPerYear} days a year`,
    wfh: (d) => `One day a week not driving ${d} km each way, 52 weeks`,
    led: () => 'A 9 W LED instead of a 60 W bulb, 5 hours a day, at about 0.7 kg CO₂ per kWh',
    none: 'No reliable general figure, because it depends on your appliance and habits',
  },
  ta: {
    transit: (d) =>
      `தனியாக ஓட்டுவதற்குப் பதிலாக மெட்ரோ, ஒரு வழி ${d} கி.மீ, ஆண்டுக்கு ${FACTORS.commuteDaysPerYear} நாள்`,
    carpool: (d) =>
      `மூவர் ஒரு காரைப் பகிர்தல், ஒரு வழி ${d} கி.மீ, ஆண்டுக்கு ${FACTORS.commuteDaysPerYear} நாள்`,
    cycleWalk: () =>
      `மோட்டார் சைக்கிளுக்குப் பதிலாக சைக்கிளில் ஒரு வழி ${SHORT_TRIP_KM} கி.மீ, ஆண்டுக்கு ${FACTORS.commuteDaysPerYear} நாள்`,
    wfh: (d) => `வாரம் ஒரு நாள் ஒரு வழி ${d} கி.மீ ஓட்டாமல், 52 வாரங்கள்`,
    led: () => '60 W பல்புக்குப் பதிலாக 9 W LED, தினமும் 5 மணி, ஒரு kWh-க்கு சுமார் 0.7 கி.கி CO₂',
    none: 'பொதுவான நம்பகமான எண் இல்லை; இது உங்கள் சாதனம், பழக்கத்தைப் பொறுத்தது',
  },
};

const GATE_TEXT = {
  en: {
    go: (a) => `Good for active travel today (AQI ${a}). Choose quiet lanes.`,
    caution: (a) => `AQI ${a}: possible on quiet lanes, but wear a mask on busy roads.`,
    avoid: (a) => `Not today (AQI ${a}). Use the metro or bus instead.`,
  },
  ta: {
    go: (a) => `இன்று நடை/சைக்கிளுக்கு ஏற்றது (AQI ${a}). அமைதியான தெருக்களைத் தேர்ந்தெடுங்கள்.`,
    caution: (a) => `AQI ${a}: அமைதியான தெருக்களில் சாத்தியம்; நெரிசல் சாலைகளில் முகக்கவசம் அணியுங்கள்.`,
    avoid: (a) => `இன்று வேண்டாம் (AQI ${a}). மெட்ரோ அல்லது பேருந்தைப் பயன்படுத்துங்கள்.`,
  },
};

/** ISO week id such as 2026-W47, computed in UTC. */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / MS_PER_DAY + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** Yearly CO2/PM impact of swapping the commute to one mode, in the requested language.
 * @returns {object} */
function impactFor(key, distance, lang) {
  const basis = BASIS[lang] || BASIS.en;
  const days = FACTORS.commuteDaysPerYear;
  const perKm = (gPerKm) => (gPerKm * 2 * distance) / 1000;
  let kg = null;
  if (key === 'transit') kg = (perKm(MODES.car.gPerKm) - perKm(MODES.metro.gPerKm)) * days;
  if (key === 'carpool') kg = perKm(MODES.car.gPerKm * (1 - 1 / CARPOOL_SIZE)) * days;
  if (key === 'cycleWalk') kg = ((MODES.motorcycle.gPerKm * 2 * SHORT_TRIP_KM) / 1000) * days;
  if (key === 'wfh') kg = perKm(MODES.car.gPerKm) * 52;
  if (key === 'led') kg = (((60 - 9) * 5 * 365) / 1000) * GRID_KG_PER_KWH;
  if (kg === null) return { kgCo2PerYear: null, basis: basis.none, approximate: false };
  const text =
    key === 'transit' || key === 'carpool' || key === 'wfh' ? basis[key](distance) : basis[key]();
  return { kgCo2PerYear: round(kg), basis: text, approximate: true };
}

/** The ISO-week challenge, rotated by lifestyle so it stays stable all week.
 * @returns {object} */
function weeklyChallenge(now, lifestyle, lang) {
  const { year, week } = isoWeek(now);
  const theme = content.CHALLENGE_THEMES[week % content.CHALLENGE_THEMES.length];
  const weekId = `${year}-W${String(week).padStart(2, '0')}`;
  const distance = content.COMMUTE_KM[lifestyle];
  const threeDays = round(((MODES.car.gPerKm - MODES.metro.gPerKm) * 2 * distance * 3) / 1000);
  return {
    weekId,
    theme: theme.key,
    title: localized(theme.title, lang),
    tasks: theme.tasks.map((task, index) => ({
      id: `${weekId}-${index}`,
      text: localized(task, lang),
      impactKgCo2: theme.key === 'move' && index === 0 ? threeDays : null,
    })),
  };
}

/**
 * @param {{air: object, windows?: object}} environment
 * @param {{lifestyle: string, lang: 'en'|'ta', now?: Date}} options
 */
function buildSustainability(environment, { lifestyle, lang, now = new Date() }) {
  const { aqi } = environment.air.current;
  const distance = content.COMMUTE_KM[lifestyle];
  const gate = aqi <= 100 ? 'go' : aqi <= 150 ? 'caution' : 'avoid';
  const gateText = (GATE_TEXT[lang] || GATE_TEXT.en)[gate](aqi);

  const actions = content.LIFESTYLE_ORDER[lifestyle].map((key) => {
    const action = content.SUSTAIN_ACTIONS[key];
    return {
      key,
      title: localized(action.title, lang),
      body: localized(action.body, lang),
      impact: impactFor(key, distance, lang),
      gate: key === 'cycleWalk' ? { status: gate, text: gateText } : null,
    };
  });

  return {
    lifestyle,
    outdoorAqi: aqi,
    assumedCommuteKm: distance,
    gridKgPerKwh: GRID_KG_PER_KWH,
    actions,
    challenge: weeklyChallenge(now, lifestyle, lang),
  };
}

module.exports = { buildSustainability, weeklyChallenge, isoWeek, impactFor };
