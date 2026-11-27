'use strict';

const config = require('../config');
const { TtlCache } = require('../utils/cache');
const { telemetry } = require('./telemetry');
const { fetchJson } = require('../utils/http');
const { AppError } = require('../utils/errors');
const { categorize } = require('../utils/aqi');
const { computeWindows } = require('./windows');

const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

const cache = new TtlCache({ ttlMs: config.cache.environmentTtlMs });
telemetry.registerCache('environment', cache);

/** Round coordinates so nearby users share cache entries (about 1 km). */
const cacheKey = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {string}
 */
function buildAirUrl(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide,sulphur_dioxide',
    hourly: 'us_aqi,pm2_5',
    forecast_days: '2',
    timezone: 'auto',
  });
  return `${AIR_URL}?${params.toString()}`;
}

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {string}
 */
function buildWeatherUrl(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,relative_humidity_2m,is_day,wind_speed_10m,wind_direction_10m',
    timezone: 'auto',
  });
  return `${WEATHER_URL}?${params.toString()}`;
}

/**
 * Turn the raw Open-Meteo air quality payload into the compact shape the app uses.
 * @param {object} raw
 * @returns {object}
 */
function normalizeAir(raw) {
  const current = raw && raw.current;
  if (!current || num(current.us_aqi) === null) {
    throw new AppError(
      'Air quality data is not available for this place',
      502,
      'UPSTREAM_BAD_DATA',
    );
  }

  const aqi = Math.round(current.us_aqi);
  const hourly = raw.hourly || {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const nowHour = String(current.time || '').slice(0, 13);
  const start = Math.max(
    0,
    times.findIndex((time) => String(time).slice(0, 13) >= nowHour),
  );

  const forecast = times
    .slice(start, start + 24)
    .map((time, index) => {
      const value = num(hourly.us_aqi && hourly.us_aqi[start + index]);
      if (value === null) return null;
      const band = categorize(value);
      return {
        time,
        aqi: Math.round(value),
        pm25: num(hourly.pm2_5 && hourly.pm2_5[start + index]),
        level: band.level,
        color: band.color,
      };
    })
    .filter(Boolean);

  const daytime = forecast.filter((point) => {
    const hour = Number(String(point.time).slice(11, 13));
    return hour >= 6 && hour <= 20;
  });
  const cleanestHour = daytime.length
    ? daytime.reduce((best, point) => (point.aqi < best.aqi ? point : best))
    : null;

  const band = categorize(aqi);
  return {
    timezone: raw.timezone || null,
    updatedAt: current.time || null,
    current: {
      aqi,
      level: band.level,
      category: band.key,
      color: band.color,
      pm25: num(current.pm2_5),
      pm10: num(current.pm10),
      no2: num(current.nitrogen_dioxide),
      o3: num(current.ozone),
      co: num(current.carbon_monoxide),
      so2: num(current.sulphur_dioxide),
    },
    forecast,
    cleanestHour,
  };
}

/**
 * @param {object} raw
 * @returns {object|null}
 */
function normalizeWeather(raw) {
  const current = raw && raw.current;
  if (!current) return null;
  return {
    temperatureC: num(current.temperature_2m),
    humidity: num(current.relative_humidity_2m),
    isDay: current.is_day === 1,
    windKmh: num(current.wind_speed_10m),
    windDeg: num(current.wind_direction_10m),
  };
}

/**
 * Live air quality, weather and forecast for a coordinate.
 * Weather is optional: if it fails the air data still loads.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{air: object, weather: object|null, fetchedAt: string}>}
 */
function getEnvironment(lat, lon) {
  return cache.wrap(cacheKey(lat, lon), async () => {
    const timeoutMs = config.upstreamTimeoutMs;
    const [airResult, weatherResult] = await Promise.allSettled([
      fetchJson(buildAirUrl(lat, lon), { timeoutMs }),
      fetchJson(buildWeatherUrl(lat, lon), { timeoutMs }),
    ]);

    if (airResult.status === 'rejected') throw airResult.reason;

    const air = normalizeAir(airResult.value);
    return {
      air,
      windows: computeWindows(air.forecast),
      weather: weatherResult.status === 'fulfilled' ? normalizeWeather(weatherResult.value) : null,
      fetchedAt: new Date().toISOString(),
    };
  });
}

module.exports = {
  getEnvironment,
  normalizeAir,
  normalizeWeather,
  buildAirUrl,
  buildWeatherUrl,
  clearCache: () => cache.clear(),
};
