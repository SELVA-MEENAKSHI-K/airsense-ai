'use strict';

const { hourOf, clock } = require('../utils/time');

/**
 * Daily planner: turns the live hourly forecast, the weather and a person's lifestyle into
 * morning / afternoon / evening recommendations, activity windows, a precaution checklist and
 * an alert level. Deterministic, so it works without an AI key and is easy to test.
 */

const endClock = (time) => `${String((hourOf(time) + 1) % 24).padStart(2, '0')}:00`;

const PERIODS = [
  { key: 'morning', from: 6, to: 11 },
  { key: 'afternoon', from: 12, to: 16 },
  { key: 'evening', from: 17, to: 21 },
];

/** AQI limits for "go" and "caution". Stricter for people who are more sensitive. */
function thresholdsFor(activity, { lifestyle, prefs }) {
  const strict =
    lifestyle === 'elder' ||
    lifestyle === 'parent' ||
    prefs.sensitivity === 'high' ||
    prefs.respiratory;
  const base = strict ? { go: 60, caution: 100 } : { go: 75, caution: 125 };
  const bonus = activity === 'walking' ? 25 : 0; // walking is lighter than jogging or a workout
  return { go: base.go + bonus, caution: base.caution + bonus };
}

const verdictOf = (aqi, limits) =>
  aqi <= limits.go ? 'go' : aqi <= limits.caution ? 'caution' : 'avoid';
const modeOf = { go: 'outdoor', caution: 'limited', avoid: 'indoor' };

/** Cleanest hour inside [from, to], or null when no forecast point falls in it.
 * @returns {object|null} */
function bestSlot(points, from, to, limits) {
  const open = points.filter((p) => hourOf(p.time) >= from && hourOf(p.time) <= to);
  if (!open.length) return null;
  const best = open.reduce((low, p) => (p.aqi < low.aqi ? p : low));
  return {
    start: clock(best.time),
    end: endClock(best.time),
    aqi: best.aqi,
    verdict: verdictOf(best.aqi, limits),
  };
}

const COPY = {
  en: {
    activity: { walking: 'Walking', jogging: 'Jogging', exercise: 'Exercise or gym' },
    periods: { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' },
    mode: {
      outdoor: 'Outdoors is fine',
      limited: 'Keep outdoor time short',
      indoor: 'Stay indoors',
    },
    activityAdvice: {
      outdoor: (a) => `Go outside at ${a.start}. Air is at its cleanest then (AQI ${a.aqi}).`,
      limited: (a) =>
        `If you go, ${a.start} is the best hour (AQI ${a.aqi}). Keep it light, stay off busy roads.`,
      indoor: (a) =>
        `Even the best hour (${a.start}, AQI ${a.aqi}) is poor. Do this indoors today.`,
    },
    periodNote: {
      outdoor: (p) => `AQI is mostly ${p.avgAqi} in this period. Best around ${p.bestStart}.`,
      limited: (p) =>
        `AQI averages ${p.avgAqi}. Short outings only, and around ${p.bestStart} if you can.`,
      indoor: (p) =>
        `AQI averages ${p.avgAqi}. Plan indoor activities; ${p.bestStart} is least bad.`,
    },
    lifestyleTips: {
      student: (c) => [
        `School or college run: the cleanest travel slot is ${c.commute || 'not available'}. Wear a mask on a two-wheeler or bicycle if AQI is above 100.`,
        'Study with windows shut at dusk, when smog thickens; air the room in the cleaner afternoon instead.',
        'Sports practice is best in the green slot; on red days switch to indoor drills.',
      ],
      professional: (c) => [
        `Plan the commute around ${c.commute || 'the cleaner hours'} if your hours are flexible. Metro or a shared ride beats a solo drive for both lungs and CO₂.`,
        'Take your lunch walk in the afternoon slot, when the air is usually cleanest.',
        'Keep a spare mask at your desk and a small purifier or closed windows if the office is near traffic.',
      ],
      elder: () => [
        'Avoid early-morning walks in winter smog. Cool air traps pollution near the ground; late morning or afternoon is kinder to the lungs.',
        'Keep regular medicines within reach and do not skip them on smoggy days.',
        'Rest if you feel breathless or dizzy, and call your doctor if it does not settle.',
      ],
      parent: (c) => [
        `Children breathe faster than adults. The best slot for play outdoors is ${c.children || 'not available'}; on red days play indoors.`,
        'On the school run, avoid idling near the gate, and keep windows shut in the car with the AC on recirculate.',
        'After outdoor play, change clothes and wash hands and face to carry less dust inside.',
      ],
    },
    checklist: {
      check: 'Check the live AQI before you step out.',
      mask: (c) => `Carry a well-fitted N95 mask (AQI is ${c.aqi}).`,
      windows: (c) =>
        `Keep windows shut${c.ventilate ? `, airing only around ${c.ventilate}` : ''}.`,
      purifier: 'Run a purifier or keep one room sealed, especially the bedroom at night.',
      roads: 'Avoid busy roads and rush hours when you walk or cycle.',
      water: 'Drink water through the day. It helps the throat cope with dust.',
      inhaler: 'Keep inhaler and medicines within reach.',
      indoorPlay: 'Prefer indoor play for children today.',
      elder: 'Avoid early outings for elders; go out in the cleaner afternoon slot.',
      cold: (c) =>
        `It is ${c.temperatureC} °C. Dress warmly, since cold smog is hard on the chest.`,
      heat: (c) => `It is ${c.temperatureC} °C. Carry water and avoid midday sun as well as smog.`,
      dusk: 'Close windows before dusk, because smog usually thickens in the evening.',
      wash: 'When you come home, wash your face and hands and change clothes.',
    },
    alert: {
      none: 'Air is fine right now.',
      watch: (a) => `Sensitive people: AQI ${a} is moderate to unhealthy for you. Take care.`,
      unhealthy: (a) => `Air is unhealthy (AQI ${a}). Limit time outdoors.`,
      severe: (a) => `Air is very unhealthy (AQI ${a}). Stay indoors where you can.`,
    },
    upcoming: {
      worsens: (t, a) => `AQI is forecast to rise above 150 around ${t} (up to ${a}).`,
      improves: (t) => `Air should improve to AQI 100 or below around ${t}.`,
    },
  },
  ta: {
    activity: { walking: 'நடைப்பயிற்சி', jogging: 'ஓட்டம்', exercise: 'உடற்பயிற்சி அல்லது ஜிம்' },
    periods: { morning: 'காலை', afternoon: 'மதியம்', evening: 'மாலை' },
    mode: {
      outdoor: 'வெளியில் செல்லலாம்',
      limited: 'வெளியில் குறைவாக இருங்கள்',
      indoor: 'வீட்டுக்குள் இருங்கள்',
    },
    activityAdvice: {
      outdoor: (a) =>
        `${a.start} மணிக்கு வெளியே செல்லுங்கள். அப்போது காற்று மிகத் தூய்மையாக இருக்கும் (AQI ${a.aqi}).`,
      limited: (a) =>
        `செல்வதானால் ${a.start} சிறந்த நேரம் (AQI ${a.aqi}). இலகுவாக, நெரிசல் சாலைகளைத் தவிர்த்து.`,
      indoor: (a) => `சிறந்த நேரமே (${a.start}, AQI ${a.aqi}) மோசம். இன்று வீட்டுக்குள் செய்யுங்கள்.`,
    },
    periodNote: {
      outdoor: (p) => `இந்த நேரத்தில் AQI பெரும்பாலும் ${p.avgAqi}. ${p.bestStart} அருகில் சிறந்தது.`,
      limited: (p) => `சராசரி AQI ${p.avgAqi}. குறுகிய நேரம் மட்டும்; முடிந்தால் ${p.bestStart} அருகில்.`,
      indoor: (p) => `சராசரி AQI ${p.avgAqi}. வீட்டுக்குள் திட்டமிடுங்கள்; ${p.bestStart} குறைந்த மோசம்.`,
    },
    lifestyleTips: {
      student: (c) => [
        `பள்ளி/கல்லூரிப் பயணத்துக்கு தூய்மையான நேரம் ${c.commute || 'கிடைக்கவில்லை'}. AQI 100-க்கு மேல் இருசக்கர வாகனம்/சைக்கிளில் முகக்கவசம் அணியுங்கள்.`,
        'மாலையில் புகைமூட்டம் அடர்த்தியாகும்போது ஜன்னல்களை மூடிப் படியுங்கள்; தூய்மையான மதியத்தில் காற்றோட்டம் விடுங்கள்.',
        'விளையாட்டுப் பயிற்சிக்கு பச்சை நேரம் சிறந்தது; மோசமான நாளில் உள்ளரங்குப் பயிற்சி.',
      ],
      professional: (c) => [
        `நேரம் நெகிழ்வாக இருந்தால் ${c.commute || 'தூய்மையான நேரங்களில்'} பயணியுங்கள். மெட்ரோ அல்லது பகிர்ந்த பயணம் நுரையீரலுக்கும் CO₂-க்கும் நல்லது.`,
        'மதிய நடைப்பயிற்சியை மதிய நேரத்தில் வைத்துக்கொள்ளுங்கள்; அப்போது காற்று பொதுவாகத் தூய்மையாக இருக்கும்.',
        'மேஜையில் ஒரு உதிரி முகக்கவசம் வைத்திருங்கள்.',
      ],
      elder: () => [
        'குளிர்கால புகைமூட்டத்தில் அதிகாலை நடையைத் தவிர்க்கவும். குளிர்ந்த காற்று மாசை தரைக்கு அருகில் அடைக்கும்; காலை பிற்பகுதி அல்லது மதியம் சிறந்தது.',
        'வழக்கமான மருந்துகளை அருகில் வைத்திருங்கள்; புகைமூட்டமான நாட்களிலும் தவறவிடாதீர்கள்.',
        'மூச்சுத்திணறல் அல்லது தலைச்சுற்றல் இருந்தால் ஓய்வெடுங்கள்; சரியாகாவிட்டால் மருத்துவரை அழையுங்கள்.',
      ],
      parent: (c) => [
        `குழந்தைகள் பெரியவர்களைவிட வேகமாக சுவாசிக்கிறார்கள். வெளியில் விளையாட சிறந்த நேரம் ${c.children || 'கிடைக்கவில்லை'}; மோசமான நாளில் வீட்டுக்குள்.`,
        'பள்ளி வாசலில் வண்டியை ஓடவிட்டு நிற்காதீர்கள்; காரில் ஜன்னல் மூடி ஏசி மறுசுழற்சியில் வைக்கவும்.',
        'வெளியில் விளையாடியபின் உடை மாற்றி, கை, முகம் கழுவுங்கள்.',
      ],
    },
    checklist: {
      check: 'வெளியே செல்லும் முன் நேரலை AQI பாருங்கள்.',
      mask: (c) => `நன்கு பொருந்தும் N95 முகக்கவசம் எடுத்துச் செல்லுங்கள் (AQI ${c.aqi}).`,
      windows: (c) =>
        `ஜன்னல்களை மூடுங்கள்${c.ventilate ? `; ${c.ventilate} அருகில் மட்டும் காற்றோட்டம்` : ''}.`,
      purifier: 'சுத்திகரிப்பானை இயக்குங்கள் அல்லது ஓர் அறையை மூடி வையுங்கள், குறிப்பாக இரவில் படுக்கையறை.',
      roads: 'நடக்கும்/சைக்கிள் ஓட்டும்போது நெரிசல் சாலைகளையும் நெரிசல் நேரத்தையும் தவிர்க்கவும்.',
      water: 'நாள் முழுவதும் தண்ணீர் குடியுங்கள்.',
      inhaler: 'இன்ஹேலர், மருந்துகளை அருகில் வைத்திருங்கள்.',
      indoorPlay: 'இன்று குழந்தைகளுக்கு வீட்டுக்குள் விளையாட்டு சிறந்தது.',
      elder: 'முதியவர்கள் அதிகாலையில் வெளியே செல்ல வேண்டாம்; தூய்மையான மதிய நேரத்தில் செல்லலாம்.',
      cold: (c) =>
        `வெப்பநிலை ${c.temperatureC} °C. குளிர்ந்த புகைமூட்டம் நெஞ்சுக்குக் கடினம்; சூடாக உடுத்துங்கள்.`,
      heat: (c) => `வெப்பநிலை ${c.temperatureC} °C. தண்ணீர் எடுத்துச் செல்லுங்கள்; நண்பகல் வெயிலைத் தவிர்க்கவும்.`,
      dusk: 'மாலை புகைமூட்டம் அடர்த்தியாகும் என்பதால் அந்தியுக்கு முன் ஜன்னல்களை மூடுங்கள்.',
      wash: 'வீடு திரும்பியதும் முகம், கை கழுவி உடை மாற்றுங்கள்.',
    },
    alert: {
      none: 'இப்போது காற்று நன்றாக உள்ளது.',
      watch: (a) => `உணர்திறன் உள்ளவர்களே: AQI ${a} உங்களுக்கு ஆரோக்கியமற்றது. கவனம்.`,
      unhealthy: (a) => `காற்று ஆரோக்கியமற்றது (AQI ${a}). வெளியில் குறைவாக இருங்கள்.`,
      severe: (a) => `காற்று மிகவும் ஆரோக்கியமற்றது (AQI ${a}). முடிந்தவரை வீட்டுக்குள் இருங்கள்.`,
    },
    upcoming: {
      worsens: (t, a) => `${t} அருகில் AQI 150-ஐத் தாண்டும் என முன்னறிவிப்பு (அதிகபட்சம் ${a}).`,
      improves: (t) => `${t} அருகில் AQI 100 அல்லது அதற்குக் கீழ் மேம்படும்.`,
    },
  },
};

/** Alert level from the current AQI. Sensitive people are alerted one band earlier. */
function alertLevel(aqi, sensitive) {
  if (aqi > 200) return 'severe';
  if (aqi > 150) return 'unhealthy';
  if (aqi > 100 || (sensitive && aqi > 50)) return 'watch';
  return 'none';
}

/**
 * @param {{air: object, weather: object|null, windows?: object}} environment
 * @param {{lifestyle: string, prefs: object, lang: 'en'|'ta'}} options
 */
function buildPlanner(environment, { lifestyle, prefs, lang }) {
  const copy = COPY[lang] || COPY.en;
  const { current, forecast } = environment.air;
  const sensitive =
    lifestyle === 'elder' ||
    lifestyle === 'parent' ||
    prefs.sensitivity === 'high' ||
    prefs.respiratory;
  const windowFor = (key) => {
    const activity =
      environment.windows && environment.windows.activities.find((a) => a.key === key);
    return activity && activity.window ? `${activity.window.start}-${activity.window.end}` : null;
  };
  const context = {
    aqi: current.aqi,
    temperatureC: environment.weather ? environment.weather.temperatureC : null,
    commute: windowFor('commute'),
    children: windowFor('children'),
    ventilate: windowFor('ventilate'),
  };

  const periodLimits = thresholdsFor('exercise', { lifestyle, prefs });
  const periods = PERIODS.map((period) => {
    const points = forecast.filter(
      (p) => hourOf(p.time) >= period.from && hourOf(p.time) <= period.to,
    );
    if (!points.length) {
      return { key: period.key, label: copy.periods[period.key], available: false };
    }
    const avg = Math.round(points.reduce((sum, p) => sum + p.aqi, 0) / points.length);
    const best = points.reduce((low, p) => (p.aqi < low.aqi ? p : low));
    const verdict = verdictOf(avg, periodLimits);
    const summary = { avgAqi: avg, bestStart: clock(best.time) };
    return {
      key: period.key,
      label: copy.periods[period.key],
      available: true,
      range: `${String(period.from).padStart(2, '0')}:00-${String(period.to + 1).padStart(2, '0')}:00`,
      avgAqi: avg,
      bestHour: clock(best.time),
      bestAqi: best.aqi,
      verdict,
      mode: modeOf[verdict],
      modeLabel: copy.mode[modeOf[verdict]],
      note: copy.periodNote[modeOf[verdict]](summary),
      preferred: period.key === prefs.period,
    };
  });

  const activities = prefs.activities.map((key) => {
    const limits = thresholdsFor(key, { lifestyle, prefs });
    const slot = bestSlot(forecast, 5, 21, limits);
    const mode = slot ? modeOf[slot.verdict] : 'indoor';
    return {
      key,
      label: copy.activity[key],
      slot,
      mode,
      modeLabel: copy.mode[mode],
      advice: slot ? copy.activityAdvice[mode](slot) : copy.mode.indoor,
    };
  });

  const items = [{ key: 'check', text: copy.checklist.check }];
  const add = (key, text) => items.push({ key, text });
  if (current.aqi > 100) add('mask', copy.checklist.mask(context));
  if (current.aqi > 150) {
    add('windows', copy.checklist.windows(context));
    add('purifier', copy.checklist.purifier);
  }
  if (current.aqi > 100) add('roads', copy.checklist.roads);
  if (prefs.respiratory) add('inhaler', copy.checklist.inhaler);
  if (lifestyle === 'parent' && current.aqi > 100) add('indoorPlay', copy.checklist.indoorPlay);
  if (lifestyle === 'elder') add('elder', copy.checklist.elder);
  const temp = context.temperatureC;
  if (temp !== null && temp <= 12) add('cold', copy.checklist.cold(context));
  if (temp !== null && temp >= 32) add('heat', copy.checklist.heat(context));
  add('water', copy.checklist.water);
  const evening = periods.find((p) => p.key === 'evening');
  const afternoon = periods.find((p) => p.key === 'afternoon');
  if (
    evening &&
    afternoon &&
    evening.available &&
    afternoon.available &&
    evening.avgAqi > afternoon.avgAqi + 10 &&
    current.aqi > 100
  ) {
    add('dusk', copy.checklist.dusk);
  }
  if (current.aqi > 150) add('wash', copy.checklist.wash);

  const level = alertLevel(current.aqi, sensitive);
  const rising = forecast.find((p) => p.aqi > 150 && current.aqi <= 150);
  const clearing = forecast.find((p) => p.aqi <= 100 && current.aqi > 100);
  const upcoming = [];
  if (rising) {
    const peak = Math.max(...forecast.map((p) => p.aqi));
    upcoming.push({
      type: 'worsens',
      at: clock(rising.time),
      text: copy.upcoming.worsens(clock(rising.time), peak),
    });
  }
  if (clearing) {
    upcoming.push({
      type: 'improves',
      at: clock(clearing.time),
      text: copy.upcoming.improves(clock(clearing.time)),
    });
  }

  return {
    lifestyle,
    aqi: current.aqi,
    category: current.category,
    outdoorNow: modeOf[verdictOf(current.aqi, periodLimits)],
    alert: {
      level,
      text: level === 'none' ? copy.alert.none : copy.alert[level](current.aqi),
      upcoming,
    },
    periods,
    activities,
    tips: copy.lifestyleTips[lifestyle](context),
    checklist: items,
  };
}

module.exports = { buildPlanner, alertLevel, thresholdsFor };
