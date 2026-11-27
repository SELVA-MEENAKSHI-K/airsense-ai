'use strict';

/**
 * Location-based recommendations. Everything here is derived from the live AQI of the chosen
 * place: which outdoor activities are safer right now, and what children, older adults and
 * sensitive people should do. Thresholds are stricter for the more vulnerable groups.
 */

const GROUPS = ['children', 'elderly', 'sensitive'];

// Level boundaries (AQI): at or below the first -> 'good', then 'caution', 'limit', else 'avoid'.
const CUTS = {
  everyone: [100, 150, 200],
  children: [50, 100, 150],
  elderly: [50, 100, 150],
  sensitive: [50, 100, 150],
};

// Activity AQI limits for a typical adult: [ok, caution]; heavier effort breathes in more air.
const ACTIVITIES = [
  { key: 'walking', limits: [100, 150] },
  { key: 'yoga', limits: [100, 150] },
  { key: 'playground', limits: [75, 125] },
  { key: 'cycling', limits: [75, 125] },
  { key: 'jogging', limits: [50, 100] },
  { key: 'sports', limits: [50, 100] },
];

const levelFor = (aqi, cuts) => {
  if (aqi <= cuts[0]) return 'good';
  if (aqi <= cuts[1]) return 'caution';
  if (aqi <= cuts[2]) return 'limit';
  return 'avoid';
};

const COPY = {
  en: {
    levels: {
      good: 'Good to go',
      caution: 'Take care',
      limit: 'Limit outdoor time',
      avoid: 'Stay indoors',
    },
    activities: {
      walking: ['Walking', 'a walk in a park or a room-to-room indoor walk'],
      yoga: ['Yoga and stretching', 'yoga or stretching indoors with the windows shut'],
      playground: ['Playground time', 'indoor games, skipping or dancing at home'],
      cycling: ['Cycling', 'a stationary bike or a gentle indoor workout'],
      jogging: ['Jogging', 'a light indoor workout such as stair climbing or bodyweight moves'],
      sports: ['Heavy outdoor exercise and sports', 'a short, easy indoor session instead'],
    },
    status: {
      ok: (a) => `Fine right now (AQI ${a}). Pick the cleaner hours and stay off busy roads.`,
      caution: (a, alt) => `AQI ${a} is borderline: keep it short and easy, or choose ${alt}.`,
      avoid: (a, alt) => `Skip it outdoors at AQI ${a}. Try ${alt}.`,
    },
    groups: {
      children: {
        title: 'Children',
        who: 'Their lungs are still developing and they breathe faster.',
        do: {
          good: ['Outdoor play is fine.', 'Wash hands and faces after play.'],
          caution: ['Keep outdoor play short and calm.', 'Skip play next to busy roads.'],
          limit: [
            'Move playtime and sports indoors.',
            'Send them to school with a well-fitted mask only if the commute is long.',
            'Keep windows shut at home.',
          ],
          avoid: [
            'Keep children indoors, including break times if the school allows.',
            'Run a purifier in the room where they sleep and study.',
          ],
        },
        avoid: {
          good: [],
          caution: ['Long, hard games outdoors'],
          limit: ['Outdoor sports and races', 'Walking along heavy traffic'],
          avoid: ['All outdoor play', 'Playing near burning waste or traffic'],
        },
      },
      elderly: {
        title: 'Older adults',
        who: 'Heart and lung conditions are more common, and smog can worsen them.',
        do: {
          good: ['A gentle walk in the cleanest hour is fine.'],
          caution: [
            'Walk in the cleanest hour and rest when tired.',
            'Keep regular medicines handy.',
          ],
          limit: [
            'Do the walk indoors or skip it today.',
            'Keep medicines and a phone within reach.',
            'Keep windows shut and use a purifier if you have one.',
          ],
          avoid: [
            'Stay indoors and rest.',
            'Call a doctor if you have chest tightness, breathlessness or dizziness.',
          ],
        },
        avoid: {
          good: [],
          caution: ['Climbing stairs or hills outdoors'],
          limit: ['Walks near traffic', 'Carrying heavy loads outdoors'],
          avoid: ['Any outdoor errand that can wait', 'Heavy exertion'],
        },
      },
      sensitive: {
        title: 'Sensitive people (asthma, heart or lung conditions, pregnancy)',
        who: 'Even moderate smog can trigger symptoms.',
        do: {
          good: ['Carry your reliever inhaler as usual.'],
          caution: [
            'Carry your reliever inhaler and take it as prescribed.',
            'Cut outdoor exertion short.',
          ],
          limit: [
            'Avoid exercise outdoors.',
            "Follow your doctor's action plan.",
            'A well-fitted N95 mask helps if you must go out.',
          ],
          avoid: [
            'Stay indoors with windows shut.',
            'Contact your doctor early if symptoms start, such as wheezing or a tight chest.',
          ],
        },
        avoid: {
          good: [],
          caution: ['Hard exercise outdoors'],
          limit: ['Any exercise outdoors', 'Dusty places and smoke'],
          avoid: ['Going outside without need', 'Smoke, incense and dust at home'],
        },
      },
      everyone: {
        title: 'Everyone else',
        who: 'Healthy adults feel it less but are still affected.',
        do: {
          good: ['Enjoy the outdoors.'],
          caution: ['Reduce long or intense outdoor exercise.'],
          limit: [
            'Reduce time outdoors and avoid heavy exercise outside.',
            'Wear an N95 mask on busy roads.',
          ],
          avoid: ['Avoid outdoor exercise completely.', 'Wear an N95 mask if you must go out.'],
        },
        avoid: {
          good: [],
          caution: ['Long runs along traffic'],
          limit: ['Heavy exercise outdoors', 'Busy roads at rush hour'],
          avoid: ['Any exercise outdoors', 'Burning waste or leaves'],
        },
      },
    },
    headline: (place, aqi, label) => `${place}: AQI ${aqi}, ${label.toLowerCase()}`,
    bestHour: (h) => `The cleanest daytime hour in the forecast is around ${h}.`,
  },
  ta: {
    levels: {
      good: 'வெளியே செல்லலாம்',
      caution: 'கவனம் தேவை',
      limit: 'வெளியில் நேரத்தைக் குறையுங்கள்',
      avoid: 'வீட்டுக்குள் இருங்கள்',
    },
    activities: {
      walking: ['நடைப்பயிற்சி', 'பூங்கா நடை அல்லது வீட்டுக்குள் நடப்பது'],
      yoga: ['யோகா, நீட்சிப் பயிற்சி', 'ஜன்னல்களை மூடி வீட்டுக்குள் யோகா'],
      playground: ['விளையாட்டுத் திடல்', 'வீட்டுக்குள் விளையாட்டு, கயிறு தாண்டுதல், நடனம்'],
      cycling: ['சைக்கிள் ஓட்டுதல்', 'வீட்டுக்குள் நிலையான சைக்கிள் அல்லது லேசான உடற்பயிற்சி'],
      jogging: ['மெதுவோட்டம்', 'படி ஏறுதல் போன்ற லேசான வீட்டுப் பயிற்சி'],
      sports: ['கடின வெளிப்புறப் பயிற்சி, விளையாட்டு', 'அதற்குப் பதில் குறுகிய, எளிய வீட்டுப் பயிற்சி'],
    },
    status: {
      ok: (a) => `இப்போது சரி (AQI ${a}). தூய்மையான நேரத்தைத் தேர்ந்து, நெரிசலான சாலைகளைத் தவிருங்கள்.`,
      caution: (a, alt) =>
        `AQI ${a} எல்லைக்கோடு: குறுகிய, எளிய அளவில் செய்யுங்கள், அல்லது ${alt} தேர்ந்தெடுங்கள்.`,
      avoid: (a, alt) => `AQI ${a}-ல் வெளியில் வேண்டாம். ${alt} முயலுங்கள்.`,
    },
    groups: {
      children: {
        title: 'குழந்தைகள்',
        who: 'அவர்களின் நுரையீரல் இன்னும் வளர்கிறது; வேகமாக மூச்சு விடுகிறார்கள்.',
        do: {
          good: ['வெளியில் விளையாடலாம்.', 'விளையாடியபின் கை, முகம் கழுவுங்கள்.'],
          caution: [
            'வெளி விளையாட்டை குறுகியதாகவும் அமைதியாகவும் வையுங்கள்.',
            'நெரிசலான சாலை அருகே விளையாட வேண்டாம்.',
          ],
          limit: [
            'விளையாட்டையும் பயிற்சியையும் வீட்டுக்குள் மாற்றுங்கள்.',
            'பயணம் நீளமாக இருந்தால் மட்டும் சரியாகப் பொருந்தும் முகக்கவசம் அணிவியுங்கள்.',
            'வீட்டில் ஜன்னல்களை மூடி வையுங்கள்.',
          ],
          avoid: [
            'குழந்தைகளை வீட்டுக்குள் வையுங்கள்; பள்ளி அனுமதித்தால் இடைவேளையும் உள்ளே.',
            'அவர்கள் தூங்கும், படிக்கும் அறையில் சுத்திகரிப்பானை இயக்குங்கள்.',
          ],
        },
        avoid: {
          good: [],
          caution: ['வெளியில் நீண்ட, கடினமான விளையாட்டு'],
          limit: ['வெளி விளையாட்டுப் போட்டிகள்', 'அதிக போக்குவரத்து அருகே நடப்பது'],
          avoid: ['எல்லா வெளி விளையாட்டும்', 'குப்பை எரிப்பு, போக்குவரத்து அருகே விளையாடுவது'],
        },
      },
      elderly: {
        title: 'முதியோர்',
        who: 'இதய, நுரையீரல் பிரச்சினைகள் அதிகம்; புகைமூட்டம் அவற்றை மோசமாக்கலாம்.',
        do: {
          good: ['தூய்மையான நேரத்தில் மெதுவான நடை சரி.'],
          caution: [
            'தூய்மையான நேரத்தில் நடந்து, களைப்பானால் ஓய்வெடுங்கள்.',
            'வழக்கமான மருந்துகளை அருகில் வையுங்கள்.',
          ],
          limit: [
            'நடையை வீட்டுக்குள் செய்யுங்கள் அல்லது இன்று தவிருங்கள்.',
            'மருந்து, கைபேசி அருகிலேயே இருக்கட்டும்.',
            'ஜன்னல்களை மூடி, சுத்திகரிப்பான் இருந்தால் இயக்குங்கள்.',
          ],
          avoid: [
            'வீட்டுக்குள் ஓய்வெடுங்கள்.',
            'நெஞ்சு இறுக்கம், மூச்சுத்திணறல், தலைச்சுற்றல் இருந்தால் மருத்துவரை அழையுங்கள்.',
          ],
        },
        avoid: {
          good: [],
          caution: ['வெளியில் படி, மேடு ஏறுவது'],
          limit: ['போக்குவரத்து அருகே நடை', 'வெளியில் கனமான சுமை'],
          avoid: ['தள்ளிப்போடக்கூடிய வெளி வேலைகள்', 'கடின உழைப்பு'],
        },
      },
      sensitive: {
        title: 'உணர்திறன் உள்ளவர்கள் (ஆஸ்துமா, இதய/நுரையீரல் பிரச்சினை, கர்ப்பம்)',
        who: 'மிதமான புகைமூட்டமும் அறிகுறிகளைத் தூண்டலாம்.',
        do: {
          good: ['வழக்கம்போல் இன்ஹேலரை எடுத்துச் செல்லுங்கள்.'],
          caution: [
            'இன்ஹேலரை எடுத்துச் சென்று, பரிந்துரைத்தபடி பயன்படுத்துங்கள்.',
            'வெளிப்புற உழைப்பைக் குறைத்துக்கொள்ளுங்கள்.',
          ],
          limit: [
            'வெளியில் உடற்பயிற்சி வேண்டாம்.',
            'மருத்துவரின் செயல் திட்டத்தைப் பின்பற்றுங்கள்.',
            'வெளியே போக வேண்டுமெனில் N95 முகக்கவசம் உதவும்.',
          ],
          avoid: [
            'ஜன்னல்களை மூடி வீட்டுக்குள் இருங்கள்.',
            'மூச்சிரைப்பு, நெஞ்சு இறுக்கம் தொடங்கினால் முன்கூட்டியே மருத்துவரை அணுகுங்கள்.',
          ],
        },
        avoid: {
          good: [],
          caution: ['வெளியில் கடின உடற்பயிற்சி'],
          limit: ['வெளியில் எந்த உடற்பயிற்சியும்', 'தூசி, புகை உள்ள இடங்கள்'],
          avoid: ['தேவையின்றி வெளியே செல்வது', 'வீட்டில் புகை, சாம்பிராணி, தூசி'],
        },
      },
      everyone: {
        title: 'மற்றவர்கள்',
        who: 'ஆரோக்கியமான பெரியவர்களுக்கு குறைவாகத் தெரிந்தாலும் பாதிப்பு உண்டு.',
        do: {
          good: ['வெளியில் மகிழ்ச்சியாக இருங்கள்.'],
          caution: ['நீண்ட, கடின வெளிப்புற உடற்பயிற்சியைக் குறையுங்கள்.'],
          limit: [
            'வெளியில் நேரத்தைக் குறைத்து, கடின உடற்பயிற்சியைத் தவிருங்கள்.',
            'நெரிசலான சாலையில் N95 முகக்கவசம் அணியுங்கள்.',
          ],
          avoid: [
            'வெளியில் உடற்பயிற்சியை முழுவதும் தவிருங்கள்.',
            'வெளியே போக வேண்டுமெனில் N95 முகக்கவசம் அணியுங்கள்.',
          ],
        },
        avoid: {
          good: [],
          caution: ['போக்குவரத்து அருகே நீண்ட ஓட்டம்'],
          limit: ['வெளியில் கடின உடற்பயிற்சி', 'நெரிசல் நேரச் சாலைகள்'],
          avoid: ['வெளியில் எந்த உடற்பயிற்சியும்', 'குப்பை, இலை எரிப்பு'],
        },
      },
    },
    headline: (place, aqi, label) => `${place}: AQI ${aqi}, ${label}`,
    bestHour: (h) => `இன்றைய பகலின் தூய்மையான நேரம் சுமார் ${h}.`,
  },
};

/**
 * @param {{air: object}} environment
 * @param {{lang: 'en'|'ta', groups?: string[], place?: string}} options
 */
function buildLocal(environment, { lang, groups = [], place = '' }) {
  const copy = COPY[lang] || COPY.en;
  const { aqi } = environment.air.current;
  const selected = GROUPS.filter((g) => groups.includes(g));
  const strict = selected.length > 0;
  const best = environment.air.cleanestHour;
  const bestHour = best ? String(best.time).slice(11, 16) : null;

  const order = [...GROUPS, 'everyone'];
  const cards = order.map((key) => {
    const level = levelFor(aqi, CUTS[key]);
    const text = copy.groups[key];
    return {
      key,
      title: text.title,
      who: text.who,
      level,
      label: copy.levels[level],
      do: text.do[level],
      avoid: text.avoid[level],
      selected: selected.includes(key),
    };
  });

  // Activities use the strictest limits among the selected groups (30% lower), so a family with a
  // child or an elder is never told something is fine that is only fine for a healthy adult.
  const factor = strict ? 0.7 : 1;
  const activities = ACTIVITIES.map((activity) => {
    const [okLimit, cautionLimit] = activity.limits.map((n) => Math.round(n * factor));
    const status = aqi <= okLimit ? 'ok' : aqi <= cautionLimit ? 'caution' : 'avoid';
    const [label, alternative] = copy.activities[activity.key];
    const note = status === 'ok' ? copy.status.ok(aqi) : copy.status[status](aqi, alternative);
    return { key: activity.key, label, status, note, limit: okLimit };
  });

  const level = levelFor(aqi, strict ? CUTS.sensitive : CUTS.everyone);
  return {
    aqi,
    category: environment.air.current.category,
    place,
    level,
    headline: copy.headline(place || '', aqi, copy.levels[level]),
    cleanestHour: bestHour,
    bestHourNote: bestHour ? copy.bestHour(bestHour) : '',
    strict,
    cards,
    activities,
  };
}

module.exports = { buildLocal, GROUPS, levelFor, CUTS };
