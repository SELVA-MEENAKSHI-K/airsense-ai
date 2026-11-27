'use strict';

/** Build 48 hourly points starting at 2026-11-18T00:00 with a simple AQI curve. */
function hourly() {
  const time = [];
  const usAqi = [];
  const pm25 = [];
  for (let i = 0; i < 48; i += 1) {
    const day = i < 24 ? '18' : '19';
    const hour = String(i % 24).padStart(2, '0');
    time.push(`2026-11-${day}T${hour}:00`);
    // Worst at night, best at 14:00.
    const value = 150 + Math.abs((i % 24) - 14) * 8;
    usAqi.push(value);
    pm25.push(value / 2);
  }
  return { time, us_aqi: usAqi, pm2_5: pm25 };
}

const airPayload = {
  timezone: 'Asia/Kolkata',
  current: {
    time: '2026-11-18T01:15',
    us_aqi: 182.4,
    pm2_5: 95.2,
    pm10: 140.1,
    nitrogen_dioxide: 40,
    ozone: 20,
    carbon_monoxide: 600,
    sulphur_dioxide: 12,
  },
  hourly: hourly(),
};

const weatherPayload = {
  current: {
    temperature_2m: 17.5,
    relative_humidity_2m: 71,
    is_day: 0,
    wind_speed_10m: 6.2,
    wind_direction_10m: 310,
  },
};

const geocodePayload = {
  results: [
    {
      id: 1264,
      name: 'Madurai',
      admin1: 'Tamil Nadu',
      country: 'India',
      latitude: 9.9252,
      longitude: 78.1198,
    },
    { name: 'Broken', latitude: null, longitude: null },
  ],
};

const geocodePayloadTa = {
  results: [
    {
      id: 1264,
      name: 'மதுரை',
      admin1: 'தமிழ்நாடு',
      country: 'இந்தியா',
      latitude: 9.9252,
      longitude: 78.1198,
    },
  ],
};

const reversePayload = {
  address: {
    road: 'Anna Nagar Main Road',
    suburb: 'Anna Nagar',
    city: 'Madurai',
    state: 'Tamil Nadu',
    postcode: '625020',
  },
};

const reversePayloadTa = {
  address: { road: 'அண்ணா நகர் முதன்மைச் சாலை', suburb: 'அண்ணா நகர்', city: 'மதுரை', state: 'தமிழ்நாடு' },
};

/** A fetch mock that answers the three Open-Meteo endpoints. */
function mockFetch({ failWeather = false, failAir = false } = {}) {
  return jest.fn(async (url) => {
    const target = String(url);
    const respond = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
    if (target.includes('nominatim.openstreetmap.org')) {
      if (target.includes('lat=0&lon=0')) return respond({ error: 'Unable to geocode' });
      return respond(target.includes('accept-language=ta') ? reversePayloadTa : reversePayload);
    }
    if (target.includes('geocoding-api.open-meteo.com')) {
      return respond(target.includes('language=ta') ? geocodePayloadTa : geocodePayload);
    }
    if (target.includes('air-quality-api.open-meteo.com')) {
      return failAir ? respond({}, false) : respond(airPayload);
    }
    if (target.includes('//api.open-meteo.com')) {
      return failWeather ? respond({}, false) : respond(weatherPayload);
    }
    throw new Error(`Unexpected URL in test: ${target}`);
  });
}

const defaultProfile = {
  commuteMode: 'motorcycle',
  commuteKm: 8,
  homeType: 'apartment',
  cooking: 'lpg',
  vulnerable: [],
  hasPurifier: false,
};

const defaultChoices = {
  switchCommute: null,
  usePurifier: false,
  wearMask: false,
  cleanCooking: false,
  avoidPeakHours: false,
  households: 1,
};

module.exports = { airPayload, weatherPayload, mockFetch, defaultProfile, defaultChoices };
