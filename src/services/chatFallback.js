'use strict';

/**
 * Rule-based answers for the chat assistant, used when no AI key is set, the model fails, or a
 * model reply is rejected by the grounding check. Every number comes from the live environment
 * passed in, so even the fallback never invents a measurement.
 */

const { summarizeForPrompt } = require('./windows');
const { PM25_PER_CIGARETTE } = require('../utils/aqi');

const CATEGORY = {
  en: {
    good: 'good',
    moderate: 'moderate',
    sensitive: 'unhealthy for sensitive groups',
    unhealthy: 'unhealthy',
    veryUnhealthy: 'very unhealthy',
    hazardous: 'hazardous',
  },
  ta: {
    good: 'நல்லது',
    moderate: 'மிதமானது',
    sensitive: 'உணர்திறன் உள்ளவர்களுக்கு ஆரோக்கியமற்றது',
    unhealthy: 'ஆரோக்கியமற்றது',
    veryUnhealthy: 'மிகவும் ஆரோக்கியமற்றது',
    hazardous: 'ஆபத்தானது',
  },
};

/** Ordered: the first matching intent wins. Keywords cover English, Tamil and Tanglish. */
const INTENTS = [
  ['greeting', /^(hi|hello|hey|vanakkam|வணக்கம்)\b/i],
  ['thanks', /\b(thanks|thank you|nandri)\b|நன்றி/i],
  [
    'aqiMeaning',
    /(what('| i)?s|what is|explain|meaning|mean).*(aqi|air quality index)|aqi.*(mean|scale|range)|ஏ\.?க்யூ\.?ஐ|aqi என்றால்/i,
  ],
  ['pollutants', /pm\s?2\.?5|pm\s?10|no2|nitrogen|ozone|o3|pollutant|particulate|துகள்/i],
  ['mask', /mask|n95|respirator|முகக்கவசம்|மாஸ்க்/i],
  ['exercise', /jog|run|walk|exercise|workout|yoga|gym|cycle|cycling|நடை|உடற்பயிற்சி|ஓட/i],
  ['children', /child|kid|school|baby|infant|student|குழந்தை|பள்ளி/i],
  [
    'health',
    /asthma|breath|cough|lung|heart|elder|senior|grandp|respirat|health|symptom|இருமல்|மூச்சு|ஆஸ்துமா/i,
  ],
  ['ventilate', /window|ventilat|fresh air|open the|ஜன்னல்/i],
  ['purifier', /purifier|hepa|filter|air cleaner|சுத்திகரிப்பான்/i],
  ['plants', /plant|snake plant|money plant|areca|செடி/i],
  ['kitchen', /cook|kitchen|chimney|stove|lpg|induction|firewood|biomass|சமை/i],
  ['dust', /dust|smoke|incense|agarbatti|mosquito coil|sweep|mop|vacuum|தூசி|புகை/i],
  [
    'transport',
    /metro|bus|train|car\b|carpool|bike|motorcycle|scooter|commute|transport|vehicle|பேருந்து|பயணம்/i,
  ],
  ['energy', /energy|electric|power|\bac\b|led|solar|bill|மின்/i],
  ['impact', /impact|co2|carbon|footprint|reduce pollution|difference|how much|trees?/i],
  ['now', /now|today|current|right now|how('| i)?s the air|safe|இப்போது|இன்று/i],
];

/** Maps a question to an intent key (defaults to "now").
 * @param {string} text
 * @returns {string} */
function detectIntent(text) {
  const hit = INTENTS.find(([, pattern]) => pattern.test(text));
  return hit ? hit[0] : 'now';
}

/** Formats a window as "10:00-12:00 (AQI 61)", or null when there is none.
 * @returns {string|null} */
function slot(window) {
  return window ? `${window.best} (AQI ${window.avgAqi})` : null;
}

/** Collects the live numbers the rule-based replies need.
 * @returns {object} */
function buildContext(environment, lang, lifestyle) {
  const { current } = environment.air;
  const windows = environment.windows ? summarizeForPrompt(environment.windows) : {};
  return {
    lang,
    lifestyle,
    aqi: current.aqi,
    category: CATEGORY[lang][current.category] || current.category,
    level: current.level ?? 0,
    pm25: current.pm25,
    pm10: current.pm10,
    no2: current.no2,
    o3: current.o3,
    cigarettes: current.pm25 ? Math.round((current.pm25 / PM25_PER_CIGARETTE) * 10) / 10 : null,
    temperatureC: environment.weather ? environment.weather.temperatureC : null,
    windows,
    unhealthy: current.aqi > 100,
    heavy: current.aqi > 150,
  };
}

const EN = {
  greeting: (c) =>
    `Hello! I am AirSense. Right now the air here is ${c.category} with AQI ${c.aqi}. Ask me about masks, exercise, indoor air or greener travel.`,
  thanks: () => 'You are welcome. Ask me anything else about the air you breathe.',
  aqiMeaning: (c) =>
    `AQI is a 0 to 500 score for how polluted the air is. 0-50 good, 51-100 moderate, 101-150 unhealthy for sensitive groups, 151-200 unhealthy, 201-300 very unhealthy, above 300 hazardous. Right now your AQI is ${c.aqi}, which is ${c.category}.`,
  pollutants: (c) =>
    `Right now PM2.5 is ${c.pm25 ?? 'not available'} µg/m³ and PM10 is ${c.pm10 ?? 'not available'} µg/m³. PM2.5 is fine dust that reaches deep into the lungs, mostly from vehicles, burning and construction. NO2 is ${c.no2 ?? 'not available'} µg/m³ and ozone is ${c.o3 ?? 'not available'} µg/m³.${c.cigarettes ? ` Breathing today's PM2.5 all day is like about ${c.cigarettes} cigarettes.` : ''}`,
  mask: (c) =>
    c.unhealthy
      ? `With AQI ${c.aqi}, a well-fitted N95 or FFP2 mask helps outdoors, especially on busy roads. Cloth and surgical masks stop very little fine dust. The mask must seal around the nose and cheeks.`
      : `At AQI ${c.aqi} a mask is not needed for most people. Keep one handy for busy roads, and for anyone with breathing problems.`,
  exercise: (c) => {
    const w = slot(c.windows.exercise);
    if (c.heavy) {
      return `AQI is ${c.aqi}, so hard outdoor exercise is not a good idea now.${w ? ` The cleanest hour in the forecast is ${w}.` : ''} Prefer an indoor workout, stretching or yoga with the windows shut.`;
    }
    return `AQI is ${c.aqi} (${c.category}).${w ? ` The best slot for outdoor exercise is ${w}.` : ''} ${c.unhealthy ? 'Keep it light and away from traffic.' : 'A walk or jog should be fine.'}`;
  },
  children: (c) => {
    const w = slot(c.windows.children);
    return `Children breathe faster, so keep play outdoors for cleaner hours. AQI is ${c.aqi} now.${w ? ` The best slot is ${w}.` : ''} ${c.unhealthy ? 'Prefer indoor play today and avoid roadsides on the school run.' : 'Normal outdoor play is fine.'}`;
  },
  health: (c) =>
    `With AQI ${c.aqi} (${c.category}), people with asthma, heart or lung conditions, elders and young children should take extra care: less time outdoors, a mask on busy roads, windows shut at the worst hours. If breathlessness or a cough persists, please see a doctor. I cannot diagnose.`,
  ventilate: (c) => {
    const w = slot(c.windows.ventilate);
    return c.heavy
      ? `Outdoor AQI is ${c.aqi}, so keep windows mostly shut.${w ? ` If you must air the house, do it for 10 minutes around ${w}.` : ''} Run a purifier if you have one.`
      : `Outdoor AQI is ${c.aqi}, so airing is fine.${w ? ` The cleanest slot is ${w}.` : ''} Open windows on opposite sides for 10 to 15 minutes.`;
  },
  purifier: (c) =>
    `A purifier with a HEPA filter, sized for the room, can cut indoor fine dust a lot. Keep doors and windows closed while it runs and clean the pre-filter monthly. With AQI ${c.aqi} outside it is worth running, mainly in the bedroom at night.`,
  plants: () =>
    'Indoor plants make a room feel fresher, but their effect on air pollutants is very small in a real home. You would need a jungle to match one purifier. Grow them for wellbeing, and rely on ventilation, cleaning and filters for the air.',
  kitchen: (c) =>
    `Cooking is a big indoor source of fine dust. Use the chimney or exhaust fan during and 10 minutes after cooking, and keep the lid on pots. Induction gives no combustion smoke, LPG gives some, and firewood or coal gives a lot. Outdoor AQI is ${c.aqi}.`,
  dust: () =>
    'Damp-mop and wipe surfaces instead of dry sweeping, which lifts dust into the air. Avoid incense, mosquito coils and candles indoors, and never burn waste. Wash bedsheets weekly and keep shoes at the door.',
  transport: (c) =>
    `Metro, bus or a shared ride puts far less pollution on the road per person than a private car or two-wheeler. ${c.unhealthy ? `At AQI ${c.aqi} cycling or walking on busy roads exposes you to more dust, so use transit today.` : `At AQI ${c.aqi} cycling and walking are good choices on quieter routes.`} Open the Impact lab to see numbers for your own commute.`,
  energy: () =>
    'Most grid electricity still comes from burning fuel, so saving power cuts pollution too. LED bulbs, a 24-26 °C AC setting, switching off standby devices, and a 5-star fan or fridge all help. The Green living page lists the habits with approximate savings.',
  impact: () =>
    'Open the Impact lab: it works out, by formula and using today’s PM2.5, how much CO₂ and fine dust a switch such as metro instead of a motorcycle would save for you, and what that looks like if a whole street did it. I explain those numbers, I do not make them up.',
  now: (c) =>
    `Right now the AQI is ${c.aqi} (${c.category}), PM2.5 ${c.pm25 ?? 'not available'} µg/m³.${c.temperatureC !== null ? ` Temperature ${c.temperatureC} °C.` : ''} ${c.heavy ? 'Limit time outdoors, keep windows shut and wear an N95 on busy roads.' : c.unhealthy ? 'Sensitive people should reduce long outdoor effort.' : 'It is fine to be outdoors.'}`,
};

const TA = {
  greeting: (c) =>
    `வணக்கம்! நான் AirSense. இங்கே இப்போது காற்று ${c.category}, AQI ${c.aqi}. முகக்கவசம், உடற்பயிற்சி, வீட்டுக்குள் காற்று, பசுமைப் பயணம் பற்றிக் கேளுங்கள்.`,
  thanks: () => 'நன்றி. நீங்கள் சுவாசிக்கும் காற்று பற்றி வேறு எதையும் கேளுங்கள்.',
  aqiMeaning: (c) =>
    `AQI என்பது காற்று எவ்வளவு மாசடைந்துள்ளது என்பதைக் காட்டும் 0 முதல் 500 வரையிலான அளவு. 0-50 நல்லது, 51-100 மிதமானது, 101-150 உணர்திறன் உள்ளவர்களுக்கு ஆரோக்கியமற்றது, 151-200 ஆரோக்கியமற்றது, 201-300 மிகவும் ஆரோக்கியமற்றது, 300-க்கு மேல் ஆபத்தானது. இப்போது உங்கள் AQI ${c.aqi}, அது ${c.category}.`,
  pollutants: (c) =>
    `இப்போது PM2.5 ${c.pm25 ?? 'கிடைக்கவில்லை'} µg/m³, PM10 ${c.pm10 ?? 'கிடைக்கவில்லை'} µg/m³. PM2.5 நுரையீரலின் ஆழம் வரை செல்லும் நுண்துகள்; வாகனப் புகை, எரிப்பு, கட்டுமானத்திலிருந்து வருகிறது. NO2 ${c.no2 ?? 'கிடைக்கவில்லை'}, ஓசோன் ${c.o3 ?? 'கிடைக்கவில்லை'} µg/m³.`,
  mask: (c) =>
    c.unhealthy
      ? `AQI ${c.aqi} இருக்கும்போது, நன்கு பொருந்தும் N95 முகக்கவசம் வெளியில், குறிப்பாக நெரிசலான சாலைகளில் உதவும். துணி, சர்ஜிக்கல் முகக்கவசங்கள் நுண்துகளை மிகக் குறைவாகவே தடுக்கும்.`
      : `AQI ${c.aqi} இருக்கும்போது பெரும்பாலானோருக்கு முகக்கவசம் தேவையில்லை. நெரிசலான சாலைகளுக்கும் மூச்சுப் பிரச்சினை உள்ளவர்களுக்கும் வைத்திருங்கள்.`,
  exercise: (c) => {
    const w = slot(c.windows.exercise);
    return c.heavy
      ? `AQI ${c.aqi} என்பதால் இப்போது வெளியில் கடின உடற்பயிற்சி வேண்டாம்.${w ? ` முன்னறிவிப்பில் தூய்மையான நேரம் ${w}.` : ''} ஜன்னல்களை மூடி வீட்டுக்குள் யோகா செய்யுங்கள்.`
      : `AQI ${c.aqi} (${c.category}).${w ? ` வெளியில் உடற்பயிற்சிக்கு சிறந்த நேரம் ${w}.` : ''}`;
  },
  children: (c) => {
    const w = slot(c.windows.children);
    return `குழந்தைகள் வேகமாக சுவாசிப்பதால், தூய்மையான நேரத்தில் வெளியில் விளையாடவிடுங்கள். இப்போது AQI ${c.aqi}.${w ? ` சிறந்த நேரம் ${w}.` : ''}`;
  },
  health: (c) =>
    `AQI ${c.aqi} (${c.category}) இருக்கும்போது ஆஸ்துமா, இதய, நுரையீரல் பிரச்சினை உள்ளவர்கள், முதியவர்கள், சிறு குழந்தைகள் கூடுதல் கவனம் செலுத்த வேண்டும்: வெளியில் குறைவாக, நெரிசல் சாலைகளில் முகக்கவசம். இருமல் அல்லது மூச்சுத்திணறல் தொடர்ந்தால் மருத்துவரைப் பாருங்கள்.`,
  ventilate: (c) => {
    const w = slot(c.windows.ventilate);
    return c.heavy
      ? `வெளியில் AQI ${c.aqi} என்பதால் ஜன்னல்களை மூடியே வையுங்கள்.${w ? ` காற்றோட்டம் தேவைப்பட்டால் ${w} அருகில் 10 நிமிடம் மட்டும்.` : ''}`
      : `வெளியில் AQI ${c.aqi}, காற்றோட்டம் விடலாம்.${w ? ` சிறந்த நேரம் ${w}.` : ''}`;
  },
  purifier: (c) =>
    `அறைக்குப் பொருந்தும் HEPA சுத்திகரிப்பான் வீட்டுக்குள் நுண்துகளை நன்கு குறைக்கும். இயங்கும்போது கதவு, ஜன்னல்களை மூடுங்கள். வெளியில் AQI ${c.aqi} இருப்பதால் படுக்கையறையில் இரவில் இயக்குவது நல்லது.`,
  plants: () =>
    'உட்புறச் செடிகள் அறைக்குப் புத்துணர்வு தரும்; ஆனால் உண்மையான வீட்டில் மாசைக் குறைக்கும் விளைவு மிகச் சிறியது. காற்றுக்கு காற்றோட்டம், சுத்தம், வடிகட்டியை நம்புங்கள்.',
  kitchen: (c) =>
    `சமையல் வீட்டுக்குள் நுண்துகளின் பெரிய ஆதாரம். சமைக்கும்போதும் பின் 10 நிமிடமும் சிம்னி அல்லது எக்ஸாஸ்ட் ஃபேன் ஓட்டுங்கள். இண்டக்ஷன் புகை இல்லை, LPG சிறிது, விறகு/நிலக்கரி அதிகம். வெளியில் AQI ${c.aqi}.`,
  dust: () =>
    'உலர் பெருக்குவதைவிட ஈரத் துணியால் துடையுங்கள். வீட்டுக்குள் ஊதுபத்தி, கொசு விரட்டிச் சுருள் வேண்டாம். படுக்கை விரிப்புகளை வாரம் ஒருமுறை துவையுங்கள்.',
  transport: (c) =>
    `தனிக் கார் அல்லது இருசக்கர வாகனத்தைவிட மெட்ரோ, பேருந்து, பகிர்ந்த பயணம் ஒருவருக்கு மிகக் குறைவான மாசே தரும். AQI ${c.aqi}. உங்கள் பயணத்துக்கான எண்களுக்கு தாக்க ஆய்வகத்தைத் திறங்கள்.`,
  energy: () =>
    'மின்சாரம் பெரும்பாலும் எரிபொருளிலிருந்து வருவதால் மின்சிக்கனம் மாசையும் குறைக்கும். LED விளக்கு, ஏசி 24-26 °C, ஸ்டாண்ட்பை சாதனங்களை அணைத்தல் உதவும்.',
  impact: () =>
    'தாக்க ஆய்வகத்தைத் திறங்கள்: இன்றைய PM2.5 அடிப்படையில் சூத்திரத்தால் உங்கள் மாற்றம் எவ்வளவு CO₂ மற்றும் நுண்துகளைக் குறைக்கும் என்று கணக்கிடுகிறது. அவற்றை நான் விளக்குவேன்; கற்பனையாகச் சொல்லமாட்டேன்.',
  now: (c) =>
    `இப்போது AQI ${c.aqi} (${c.category}), PM2.5 ${c.pm25 ?? 'கிடைக்கவில்லை'} µg/m³.${c.temperatureC !== null ? ` வெப்பநிலை ${c.temperatureC} °C.` : ''}`,
};

const FOLLOW_UPS = {
  en: {
    general: ['What does AQI mean?', 'Is it safe to go jogging now?', 'Do I need a mask today?'],
    indoor: [
      'Should I open the windows?',
      'Do indoor plants clean the air?',
      'How do I cut kitchen smoke?',
    ],
    sustainability: [
      'Is metro better than my bike?',
      'How do I save electricity?',
      'What can one family change?',
    ],
    planner: [
      'When is the best time to walk?',
      'What should I carry today?',
      'Is it safe for my kids?',
    ],
  },
  ta: {
    general: ['AQI என்றால் என்ன?', 'இப்போது ஓடலாமா?', 'இன்று முகக்கவசம் தேவையா?'],
    indoor: [
      'ஜன்னல்களைத் திறக்கலாமா?',
      'உட்புறச் செடிகள் காற்றைச் சுத்தம் செய்யுமா?',
      'சமையல் புகையை எப்படிக் குறைப்பது?',
    ],
    sustainability: ['மெட்ரோ சிறந்ததா?', 'மின்சாரத்தை எப்படிச் சேமிப்பது?', 'ஒரு குடும்பம் என்ன மாற்றலாம்?'],
    planner: [
      'நடைபயிற்சிக்கு சிறந்த நேரம்?',
      'இன்று என்ன எடுத்துச் செல்ல வேண்டும்?',
      'குழந்தைகளுக்குப் பாதுகாப்பா?',
    ],
  },
};

/**
 * @param {{message: string, environment: object, lang: 'en'|'ta', topic: string, lifestyle?: string}} input
 * @returns {{reply: string, followUps: string[], intent: string}}
 */
function buildChatFallback({ message, environment, lang, topic, lifestyle }) {
  const intent = detectIntent(message);
  const context = buildContext(environment, lang, lifestyle);
  const table = lang === 'ta' ? TA : EN;
  return {
    reply: table[intent](context),
    followUps: FOLLOW_UPS[lang][topic] || FOLLOW_UPS[lang].general,
    intent,
  };
}

module.exports = { buildChatFallback, detectIntent };
