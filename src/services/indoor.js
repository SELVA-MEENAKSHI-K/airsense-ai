'use strict';

const { localized } = require('../utils/text');
const content = require('../data/lifestyleContent');

const VENT = {
  en: {
    open: (c) =>
      `Outdoor AQI is ${c.aqi}, so airing is fine. Open windows on opposite sides for 10 to 15 minutes${c.slot ? `, best around ${c.slot}` : ''}, and especially after cooking.`,
    brief: (c) =>
      `Outdoor AQI is ${c.aqi}. Air the home only briefly${c.slot ? ` around ${c.slot}` : ''}, for about 10 minutes, and avoid rush hours when roadside air is worst.`,
    closed: (c) =>
      `Outdoor AQI is ${c.aqi}, so keep windows and doors shut. If the room feels stuffy or after cooking, air it for 5 to 10 minutes${c.slot ? ` around ${c.slot}` : ''} and run a purifier or fan-filter afterwards.`,
    night:
      'Close all windows before dusk and keep them shut overnight; smog tends to thicken as the air cools.',
    labels: { open: 'Open the windows', brief: 'Air briefly', closed: 'Keep windows shut' },
  },
  ta: {
    open: (c) =>
      `வெளியில் AQI ${c.aqi}, காற்றோட்டம் விடலாம். எதிர்ப்பக்க ஜன்னல்களை 10-15 நிமிடம் திறங்கள்${c.slot ? `; ${c.slot} அருகில் சிறந்தது` : ''}, குறிப்பாக சமைத்தபின்.`,
    brief: (c) =>
      `வெளியில் AQI ${c.aqi}. சுமார் 10 நிமிடம் மட்டும் காற்றோட்டம் விடுங்கள்${c.slot ? ` (${c.slot} அருகில்)` : ''}; நெரிசல் நேரத்தைத் தவிருங்கள்.`,
    closed: (c) =>
      `வெளியில் AQI ${c.aqi}, ஜன்னல், கதவுகளை மூடியே வையுங்கள். புழுக்கமாக இருந்தால் அல்லது சமையலுக்குப் பின் ${c.slot ? `${c.slot} அருகில் ` : ''}5-10 நிமிடம் மட்டும் திறந்து, பின் சுத்திகரிப்பானை இயக்குங்கள்.`,
    night:
      'அந்திக்கு முன் எல்லா ஜன்னல்களையும் மூடி இரவு முழுவதும் மூடியே வையுங்கள்; காற்று குளிரும்போது புகைமூட்டம் அடர்த்தியாகும்.',
    labels: {
      open: 'ஜன்னல்களைத் திறக்கலாம்',
      brief: 'சிறிது நேரம் மட்டும்',
      closed: 'ஜன்னல்களை மூடி வையுங்கள்',
    },
  },
};

/**
 * Indoor air quality guidance: a live ventilation verdict from the outdoor AQI plus curated tips.
 * @param {{air: object, windows?: object}} environment
 * @param {{lang: 'en'|'ta'}} options
 */
function buildIndoor(environment, { lang }) {
  const copy = VENT[lang] || VENT.en;
  const { aqi } = environment.air.current;
  const vent =
    environment.windows && environment.windows.activities.find((a) => a.key === 'ventilate');
  const slot = vent && vent.window ? `${vent.window.start}-${vent.window.end}` : null;
  const status = aqi <= 100 ? 'open' : aqi <= 150 ? 'brief' : 'closed';

  const sections = content.INDOOR_SECTIONS.map((section) => ({
    key: section.key,
    title: localized(section.title, lang),
    items: section.items.map((item) => ({
      cost: item.cost,
      title: localized(item.title, lang),
      body: localized(item.body, lang),
    })),
  }));
  const order =
    aqi > 150
      ? ['budget', 'ventilation', 'kitchen', 'dust']
      : ['ventilation', 'kitchen', 'dust', 'budget'];
  sections.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  const byKey = Object.fromEntries(sections.map((s) => [s.key, s.items]));
  const priorities =
    aqi > 150
      ? [byKey.budget[0], byKey.budget[1], byKey.ventilation[1]]
      : aqi > 100
        ? [byKey.ventilation[0], byKey.kitchen[0], byKey.budget[1]]
        : [byKey.ventilation[0], byKey.kitchen[0], byKey.dust[0]];

  return {
    outdoorAqi: aqi,
    ventilation: {
      status,
      label: copy.labels[status],
      text: copy[status]({ aqi, slot }),
      bestSlot: slot,
      night: copy.night,
    },
    priorities: priorities.map((item) => item.title),
    sections,
    plants: {
      intro: localized(content.PLANTS.intro, lang),
      honest: localized(content.PLANTS.honest, lang),
      items: content.PLANTS.items.map((plant) => ({
        name: localized(plant.name, lang),
        note: localized(plant.note, lang),
        caution: localized(plant.caution, lang),
      })),
    },
  };
}

module.exports = { buildIndoor };
