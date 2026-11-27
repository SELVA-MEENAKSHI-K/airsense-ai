'use strict';

/**
 * Rule-based advice used when the GenAI provider is not configured, times out,
 * or returns something that fails validation. It follows the same shape as the model output,
 * so the UI never has to care where advice came from.
 */

const MODE_LABELS = {
  en: {
    car: 'car',
    motorcycle: 'motorcycle',
    auto: 'auto-rickshaw',
    bus: 'bus',
    metro: 'metro',
    bicycle: 'bicycle',
    walk: 'walking',
    wfh: 'working from home',
  },
  ta: {
    car: 'கார்',
    motorcycle: 'இருசக்கர வாகனம்',
    auto: 'ஆட்டோ',
    bus: 'பேருந்து',
    metro: 'மெட்ரோ',
    bicycle: 'சைக்கிள்',
    walk: 'நடை',
    wfh: 'வீட்டிலிருந்து வேலை',
  },
};

const MOTORIZED = new Set(['car', 'motorcycle', 'auto']);
const TRANSIT = new Set(['bus', 'metro']);
const ACTIVE = new Set(['bicycle', 'walk']);

const RISK_BY_LEVEL = ['low', 'low', 'moderate', 'high', 'severe', 'severe'];

const COPY = {
  en: {
    summary: [
      ({ aqi }) =>
        `Air is clean right now (AQI ${aqi}). A good day for time outdoors and fresh air.`,
      ({ aqi }) =>
        `Air quality is acceptable (AQI ${aqi}). Sensitive people should go easy on long outdoor effort.`,
      ({ aqi }) =>
        `AQI ${aqi} is unhealthy for sensitive groups. Keep outdoor time short and choose cleaner travel.`,
      ({ aqi }) =>
        `AQI ${aqi} is unhealthy for everyone. Cut time outdoors and clean up your indoor air.`,
      ({ aqi }) =>
        `AQI ${aqi} means very polluted air. Stay indoors as much as you can and protect your breathing.`,
      ({ aqi }) =>
        `AQI ${aqi} is hazardous. Stay indoors, keep windows shut and avoid all outdoor exertion.`,
    ],
    morning: {
      when: 'Morning',
      heavy: 'Skip outdoor exercise and keep windows shut during the early smog peak.',
      light: 'Light outdoor exercise is fine, but stay away from busy roads.',
      why: 'Cool morning air traps pollution close to the ground.',
    },
    cleanest: {
      when: ({ hour }) => `Around ${hour}`,
      action: 'Do errands and air out the house in this window.',
      why: ({ hourAqi }) => `The forecast shows the cleanest daytime air then (AQI ${hourAqi}).`,
      fallbackWhen: 'Midday',
      fallbackWhy: 'Sunshine and warmth usually lift pollution a little around midday.',
    },
    commute: {
      when: 'Commute',
      motorized: {
        action: 'Use the metro or a bus on two or three days a week, or share the ride.',
        why: 'Fewer vehicles means less exhaust where your family breathes.',
      },
      transit: {
        action: 'Keep using public transport and wear a well-fitted mask at crowded stops.',
        why: 'Shared transport gives the lowest emissions per person.',
      },
      active: {
        action: 'Choose quieter lanes away from main roads, and wear a mask when AQI is high.',
        why: 'Deep breathing next to traffic pulls in more pollution.',
      },
      wfh: {
        action: 'Bundle errands into one trip instead of several.',
        why: 'Fewer trips means less exhaust and less exposure.',
      },
    },
    evening: {
      when: 'Evening',
      action: 'Close windows at dusk and run a purifier, or damp-mop the floors.',
      why: 'Smog often thickens after sunset as the air cools.',
    },
    indoor: [
      {
        tip: 'Keep windows shut when AQI is above 150 and air the home near the cleanest hour.',
        why: 'It stops outdoor smog from flowing straight in.',
      },
      {
        tip: 'Run a HEPA purifier in the bedroom, or damp-dust and mop daily without one.',
        why: 'Wet cleaning keeps fine dust from floating back into the air you sleep in.',
      },
      {
        biomass: {
          tip: 'Cook with the exhaust fan on, and plan a move from firewood to LPG or induction.',
          why: 'Biomass smoke is the biggest indoor source of PM2.5.',
        },
        lpg: {
          tip: 'Switch on the chimney or crack a window while cooking.',
          why: 'Gas cooking adds fine particles and fumes to indoor air.',
        },
        induction: {
          tip: 'Keep using induction for cooking.',
          why: 'It adds almost no indoor smoke.',
        },
      },
      {
        tip: 'Avoid incense sticks and mosquito coils on high-AQI days.',
        why: 'They release fine particles right where you sit.',
      },
    ],
    swaps: {
      motorized: (mode) => ({
        swap: `Replace some ${mode} trips with metro or bus.`,
        why: 'Per passenger-km, a metro emits roughly one-seventh of the CO2 of a car.',
      }),
      other: (mode) => ({
        swap: `Keep using ${mode} and group your errands.`,
        why: 'Low-emission travel is already your biggest win.',
      }),
      cooking: {
        biomass: {
          swap: 'Move cooking from firewood or coal to LPG or induction.',
          why: 'It removes the largest source of smoke inside the home.',
        },
        other: {
          swap: 'Try induction cooking for one meal a day.',
          why: 'It cuts indoor fumes and kitchen heat.',
        },
      },
      burning: {
        swap: 'Do not burn leaves or garbage, and report open burning to your local body.',
        why: 'Open burning is a large and avoidable source of winter smog.',
      },
    },
    impact: {
      withChanges: (i) =>
        `With your chosen changes you would cut about ${i.co2} kg of CO2 a day (${i.year} kg a year, like ${i.trees} trees) and breathe about ${i.pct}% less PM2.5, roughly ${i.cigs} fewer cigarettes' worth a day. If ${i.households} households did the same, about ${i.tonnes} tonnes of CO2 would be avoided each year.`,
      withoutChanges: (i) =>
        `Today you breathe PM2.5 equal to about ${i.cigs} cigarettes a day. Pick a different commute, a purifier, a mask or cleaner cooking to see how much each one helps.`,
    },
    health:
      'Because children, elders or people with breathing problems live with you, watch for cough, wheeze or breathlessness, and see a doctor if it persists.',
  },
  ta: {
    summary: [
      ({ aqi }) => `காற்று இப்போது சுத்தமாக உள்ளது (AQI ${aqi}). வெளியில் நேரம் செலவிட நல்ல நாள்.`,
      ({ aqi }) =>
        `காற்றின் தரம் ஏற்கத்தக்கது (AQI ${aqi}). உணர்திறன் உள்ளவர்கள் நீண்ட நேர வெளிப்புற உழைப்பைத் தவிர்க்கலாம்.`,
      ({ aqi }) =>
        `AQI ${aqi}: உணர்திறன் உள்ளவர்களுக்குப் பாதிப்பு தரும். வெளியில் இருக்கும் நேரத்தைக் குறைத்து, தூய்மையான பயண முறையைத் தேர்ந்தெடுங்கள்.`,
      ({ aqi }) =>
        `AQI ${aqi}: எல்லோருக்கும் பாதிப்பு தரும். வெளியில் செல்வதைக் குறைத்து, வீட்டுக்குள் காற்றைத் தூய்மையாக வைத்திருங்கள்.`,
      ({ aqi }) =>
        `AQI ${aqi}: மிகவும் மாசடைந்த காற்று. முடிந்தவரை வீட்டுக்குள் இருந்து, சுவாசத்தைப் பாதுகாத்துக் கொள்ளுங்கள்.`,
      ({ aqi }) =>
        `AQI ${aqi}: அபாயகரமான காற்று. வீட்டுக்குள்ளேயே இருந்து, ஜன்னல்களை மூடி, வெளிப்புற உடற்பயிற்சியைத் தவிர்க்கவும்.`,
    ],
    morning: {
      when: 'காலை',
      heavy: 'வெளிப்புற உடற்பயிற்சியைத் தவிர்த்து, அதிகாலைப் புகைமூட்டத்தின் போது ஜன்னல்களை மூடி வையுங்கள்.',
      light: 'இலகுவான வெளிப்புற உடற்பயிற்சி சரி, ஆனால் நெரிசலான சாலைகளைத் தவிர்க்கவும்.',
      why: 'குளிர்ந்த காலைக் காற்றில் மாசு தரைக்கு அருகிலேயே தங்கிவிடும்.',
    },
    cleanest: {
      when: ({ hour }) => `${hour} அருகில்`,
      action: 'வெளிவேலைகளை முடிக்கவும், வீட்டைக் காற்றோட்டமாக வைக்கவும் இந்த நேரத்தைப் பயன்படுத்துங்கள்.',
      why: ({ hourAqi }) =>
        `முன்னறிவிப்பின்படி பகலில் மிகத் தூய்மையான காற்று அப்போது இருக்கும் (AQI ${hourAqi}).`,
      fallbackWhen: 'மதியம்',
      fallbackWhy: 'சூரிய ஒளியும் வெப்பமும் மதிய நேரத்தில் மாசைச் சற்றுக் குறைக்கும்.',
    },
    commute: {
      when: 'பயணம்',
      motorized: {
        action:
          'வாரத்தில் இரண்டு அல்லது மூன்று நாட்கள் மெட்ரோ அல்லது பேருந்தில் செல்லுங்கள், அல்லது வாகனத்தைப் பகிருங்கள்.',
        why: 'வாகனங்கள் குறைந்தால் உங்கள் குடும்பம் சுவாசிக்கும் இடத்தில் புகை குறையும்.',
      },
      transit: {
        action:
          'பொது போக்குவரத்தைத் தொடருங்கள்; நெரிசலான நிறுத்தங்களில் சரியாகப் பொருந்தும் முகக்கவசம் அணியுங்கள்.',
        why: 'பகிர்ந்த போக்குவரத்து ஒருவருக்குக் குறைந்த புகையை வெளியிடுகிறது.',
      },
      active: {
        action:
          'முக்கிய சாலைகளை விட்டு அமைதியான தெருக்களைத் தேர்ந்தெடுங்கள்; AQI அதிகமாக இருந்தால் முகக்கவசம் அணியுங்கள்.',
        why: 'வாகனங்களுக்கு அருகில் ஆழ்ந்து சுவாசித்தால் அதிக மாசு உள்ளே செல்லும்.',
      },
      wfh: {
        action: 'பல பயணங்களுக்குப் பதிலாக வெளிவேலைகளை ஒரே பயணமாகச் சேர்த்து முடியுங்கள்.',
        why: 'குறைந்த பயணங்கள் என்றால் குறைந்த புகையும் குறைந்த மாசு உள்ளிழுப்பும்.',
      },
    },
    evening: {
      when: 'மாலை',
      action:
        'அந்தி நேரத்தில் ஜன்னல்களை மூடி, காற்று சுத்திகரிப்பானை இயக்குங்கள் அல்லது தரையை ஈரத்துணியால் துடையுங்கள்.',
      why: 'சூரியன் மறைந்து காற்று குளிரும்போது புகைமூட்டம் அடர்த்தியாகும்.',
    },
    indoor: [
      {
        tip: 'AQI 150-ஐ மீறினால் ஜன்னல்களை மூடி வைத்து, மிகத் தூய்மையான நேரத்தில் மட்டும் வீட்டைக் காற்றோட்டமாக்குங்கள்.',
        why: 'வெளிப்புறப் புகைமூட்டம் நேராக உள்ளே வருவதைத் தடுக்கும்.',
      },
      {
        tip: 'படுக்கையறையில் HEPA சுத்திகரிப்பானை இயக்குங்கள்; இல்லையெனில் தினமும் ஈரத்துணியால் தூசி துடைத்து தரையைத் துடையுங்கள்.',
        why: 'ஈரமாகச் சுத்தம் செய்தால் நுண்தூசி மீண்டும் காற்றில் பறக்காது.',
      },
      {
        biomass: {
          tip: 'எக்ஸாஸ்ட் ஃபேனை இயக்கி சமைக்கவும்; விறகு அடுப்பிலிருந்து LPG அல்லது இண்டக்ஷனுக்கு மாற திட்டமிடுங்கள்.',
          why: 'விறகுப் புகையே வீட்டுக்குள் PM2.5-ன் மிகப்பெரிய ஆதாரம்.',
        },
        lpg: {
          tip: 'சமைக்கும் போது சிம்னியை இயக்குங்கள் அல்லது ஜன்னலைச் சிறிது திறந்து வையுங்கள்.',
          why: 'எரிவாயு சமையல் வீட்டுக்குள் நுண்துகள்களையும் புகையையும் சேர்க்கும்.',
        },
        induction: {
          tip: 'சமையலுக்கு இண்டக்ஷனைத் தொடர்ந்து பயன்படுத்துங்கள்.',
          why: 'இது வீட்டுக்குள் கிட்டத்தட்ட புகையே சேர்ப்பதில்லை.',
        },
      },
      {
        tip: 'AQI அதிகமுள்ள நாட்களில் ஊதுபத்தி, கொசுவர்த்திச் சுருள் ஆகியவற்றைத் தவிர்க்கவும்.',
        why: 'நீங்கள் அமரும் இடத்திலேயே நுண்துகள்களை வெளியிடும்.',
      },
    ],
    swaps: {
      motorized: (mode) => ({
        swap: `சில ${mode} பயணங்களுக்குப் பதிலாக மெட்ரோ அல்லது பேருந்தைப் பயன்படுத்துங்கள்.`,
        why: 'ஒரு பயணிக்கு ஒரு கிலோமீட்டருக்கு, மெட்ரோ காரை விட ஏறத்தாழ ஏழில் ஒரு பங்கு CO2 மட்டுமே வெளியிடுகிறது.',
      }),
      other: (mode) => ({
        swap: `${mode} தொடருங்கள்; வெளிவேலைகளைச் சேர்த்து முடியுங்கள்.`,
        why: 'குறைந்த மாசுப் பயணம் ஏற்கெனவே உங்கள் மிகப்பெரிய நன்மை.',
      }),
      cooking: {
        biomass: {
          swap: 'விறகு அல்லது நிலக்கரி சமையலிலிருந்து LPG அல்லது இண்டக்ஷனுக்கு மாறுங்கள்.',
          why: 'வீட்டுக்குள் புகையின் மிகப்பெரிய ஆதாரம் நீங்கும்.',
        },
        other: {
          swap: 'தினமும் ஒரு வேளை சமையலை இண்டக்ஷனில் செய்து பாருங்கள்.',
          why: 'வீட்டுக்குள் புகையும் சமையலறை வெப்பமும் குறையும்.',
        },
      },
      burning: {
        swap: 'இலைகள், குப்பைகளை எரிக்காதீர்கள்; திறந்தவெளி எரிப்பை உள்ளாட்சி அமைப்பிடம் தெரிவியுங்கள்.',
        why: 'திறந்தவெளி எரிப்பு குளிர்காலப் புகைமூட்டத்தின் பெரிய, தவிர்க்கக்கூடிய ஆதாரம்.',
      },
    },
    impact: {
      withChanges: (i) =>
        `நீங்கள் தேர்ந்தெடுத்த மாற்றங்களால் நாளொன்றுக்கு சுமார் ${i.co2} கிலோ CO2 குறையும் (ஆண்டுக்கு ${i.year} கிலோ, ${i.trees} மரங்களுக்குச் சமம்). நீங்கள் சுவாசிக்கும் PM2.5 சுமார் ${i.pct}% குறையும்; அதாவது நாளுக்கு ஏறத்தாழ ${i.cigs} சிகரெட் அளவு மாசு குறையும். ${i.households} குடும்பங்கள் இதையே செய்தால், ஆண்டுக்கு சுமார் ${i.tonnes} டன் CO2 தவிர்க்கப்படும்.`,
      withoutChanges: (i) =>
        `இன்று நீங்கள் சுவாசிக்கும் PM2.5, நாளுக்கு சுமார் ${i.cigs} சிகரெட்டுக்குச் சமம். வேறு பயண முறை, காற்று சுத்திகரிப்பான், முகக்கவசம் அல்லது தூய்மையான சமையலைத் தேர்ந்தெடுத்து ஒவ்வொன்றும் எவ்வளவு உதவுகிறது என்று பாருங்கள்.`,
    },
    health:
      'குழந்தைகள், முதியவர்கள் அல்லது சுவாசப் பிரச்சினை உள்ளவர்கள் வீட்டில் இருப்பதால், இருமல், மூச்சிரைப்பு அல்லது மூச்சுத்திணறல் இருக்கிறதா எனக் கவனியுங்கள்; தொடர்ந்தால் மருத்துவரைப் பாருங்கள்.',
  },
};

/**
 * @param {object} environment Result of getEnvironment().
 * @param {object} impact Result of computeImpact().
 * @param {object} profile Validated profile.
 * @param {string} lang 'en' | 'ta'
 * @returns {object} Advice in the same shape the model returns.
 */
function buildFallbackAdvice({ environment, impact, profile, lang = 'en', choices = {} }) {
  const copy = COPY[lang] || COPY.en;
  const labels = MODE_LABELS[lang] || MODE_LABELS.en;
  const { aqi, level } = environment.air.current;
  const cleanest = environment.air.cleanestHour;
  const mode = profile.commuteMode;
  const modeLabel = labels[mode];

  const commuteGroup = MOTORIZED.has(mode)
    ? 'motorized'
    : TRANSIT.has(mode)
      ? 'transit'
      : ACTIVE.has(mode)
        ? 'active'
        : 'wfh';

  const dailyRoutine = [
    {
      when: copy.morning.when,
      action: level >= 3 ? copy.morning.heavy : copy.morning.light,
      why: copy.morning.why,
    },
    cleanest
      ? {
          when: copy.cleanest.when({ hour: String(cleanest.time).slice(11, 16) }),
          action: copy.cleanest.action,
          why: copy.cleanest.why({ hourAqi: cleanest.aqi }),
        }
      : {
          when: copy.cleanest.fallbackWhen,
          action: copy.cleanest.action,
          why: copy.cleanest.fallbackWhy,
        },
    { when: copy.commute.when, ...copy.commute[commuteGroup] },
    { when: copy.evening.when, action: copy.evening.action, why: copy.evening.why },
  ];

  const indoorTips = [
    copy.indoor[0],
    copy.indoor[1],
    copy.indoor[2][profile.cooking],
    copy.indoor[3],
  ];

  const sustainableAlternatives = [
    commuteGroup === 'motorized' ? copy.swaps.motorized(modeLabel) : copy.swaps.other(modeLabel),
    profile.cooking === 'biomass' ? copy.swaps.cooking.biomass : copy.swaps.cooking.other,
    copy.swaps.burning,
  ];

  const savings = impact.savings;
  const hasChanges =
    Math.abs(savings.co2KgPerDay) > 0.001 ||
    Math.abs(savings.exposureCutPct) >= 1 ||
    Boolean(choices.wearMask || choices.usePurifier || choices.cleanCooking);
  const impactExplanation = hasChanges
    ? copy.impact.withChanges({
        co2: savings.co2KgPerDay.toFixed(1),
        year: Math.round(savings.co2KgPerYear),
        trees: savings.treesEquivalent.toFixed(1),
        pct: Math.round(savings.exposureCutPct),
        cigs: savings.cigarettesAvoidedPerDay.toFixed(1),
        households: impact.community.households,
        tonnes: impact.community.co2TonnesPerYear.toFixed(1),
      })
    : copy.impact.withoutChanges({ cigs: impact.baseline.cigarettesPerDay.toFixed(1) });

  return {
    summary: copy.summary[Math.min(level, 5)]({ aqi }),
    riskLevel: RISK_BY_LEVEL[Math.min(level, 5)],
    dailyRoutine,
    indoorTips,
    sustainableAlternatives,
    impactExplanation,
    healthNote: profile.vulnerable.length > 0 ? copy.health : '',
  };
}

module.exports = { buildFallbackAdvice };
