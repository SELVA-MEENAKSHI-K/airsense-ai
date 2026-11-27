'use strict';

/**
 * US AQI bands (EPA). Colours are chosen to stay distinguishable on dark glass panels.
 */
const BANDS = Object.freeze([
  { key: 'good', max: 50, level: 0, color: '#4CC38A' },
  { key: 'moderate', max: 100, level: 1, color: '#E8D44D' },
  { key: 'sensitive', max: 150, level: 2, color: '#F59E42' },
  { key: 'unhealthy', max: 200, level: 3, color: '#F0624D' },
  { key: 'veryUnhealthy', max: 300, level: 4, color: '#B565C8' },
  { key: 'hazardous', max: Infinity, level: 5, color: '#C2415B' },
]);

/** Berkeley Earth rule of thumb: 22 µg/m³ of PM2.5 over 24h ≈ 1 cigarette per day. */
const PM25_PER_CIGARETTE = 22;

/**
 * Map an AQI value to its band.
 * @param {number|null|undefined} aqi
 * @returns {{key: string, level: number, color: string}|null}
 */
function categorize(aqi) {
  if (typeof aqi !== 'number' || !Number.isFinite(aqi) || aqi < 0) return null;
  const band = BANDS.find((candidate) => aqi <= candidate.max);
  return { key: band.key, level: band.level, color: band.color };
}

/**
 * Convert a PM2.5 concentration into "cigarettes per day" equivalents.
 * @param {number} pm25 µg/m³
 * @returns {number}
 */
function pm25ToCigarettes(pm25) {
  if (!Number.isFinite(pm25) || pm25 <= 0) return 0;
  return pm25 / PM25_PER_CIGARETTE;
}

module.exports = { BANDS, PM25_PER_CIGARETTE, categorize, pm25ToCigarettes };
