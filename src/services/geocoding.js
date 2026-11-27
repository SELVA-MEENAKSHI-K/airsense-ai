'use strict';

const config = require('../config');
const { TtlCache } = require('../utils/cache');
const { telemetry } = require('./telemetry');
const { fetchJson } = require('../utils/http');

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
// Nominatim's usage policy asks for an identifying User-Agent and at most one request a second;
// results are cached by ~11 m cell, so repeat lookups never reach it.
const REVERSE_HEADERS = { 'User-Agent': 'AirSense-AI/1.0 (urban air quality assistant)' };
const REVERSE_CACHE_MAX = 2000;
const SEARCH_CACHE_MAX = 1000;
const reverseCache = new TtlCache({
  ttlMs: config.cache.geocodeTtlMs,
  maxEntries: REVERSE_CACHE_MAX,
});
telemetry.registerCache('reverse', reverseCache);
const cache = new TtlCache({ ttlMs: config.cache.geocodeTtlMs, maxEntries: SEARCH_CACHE_MAX });
telemetry.registerCache('geocode', cache);

/**
 * Search places by name.
 * @param {string} query Already validated, trimmed text.
 * @returns {Promise<Array<{name: string, region: string, country: string, lat: number, lon: number, label: string, nameTa: ?string, labelTa: ?string}>>}
 */
function searchPlaces(query, { country } = {}) {
  const key = `${country || '*'}:${query.toLowerCase()}`;
  return cache.wrap(key, async () => {
    const lookup = (language) => {
      const params = new URLSearchParams({
        name: query,
        count: country ? '10' : '5',
        language,
        format: 'json',
      });
      if (country) params.set('countryCode', country);
      return fetchJson(`${GEOCODE_URL}?${params.toString()}`, {
        timeoutMs: config.upstreamTimeoutMs,
      });
    };
    // English is the source of truth; Tamil names are a best-effort extra so the UI can show
    // the place in the reader's language. If the Tamil lookup fails the English name is used.
    const [raw, rawTa] = await Promise.all([lookup('en'), lookup('ta').catch(() => null)]);

    const results = Array.isArray(raw && raw.results) ? raw.results : [];
    const tamil = new Map(
      (Array.isArray(rawTa && rawTa.results) ? rawTa.results : []).map((item) => [item.id, item]),
    );
    const labelOf = (item) =>
      [item.name, item.admin1 || '', item.country || ''].filter(Boolean).join(', ');
    return results
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
      .map((item) => {
        const ta = tamil.get(item.id);
        return {
          name: item.name,
          region: item.admin1 || '',
          country: item.country || '',
          lat: item.latitude,
          lon: item.longitude,
          label: labelOf(item),
          nameTa: ta && ta.name ? ta.name : null,
          labelTa: ta ? labelOf(ta) : null,
        };
      });
  });
}

/** First non-empty value of the listed address fields. */
const pick = (address, fields) => fields.map((field) => address[field]).find(Boolean) || '';

/** Street, area and city parts of an OpenStreetMap address, in one language. */
function describeAddress(result) {
  const address = (result && result.address) || {};
  const street = pick(address, ['road', 'pedestrian', 'footway', 'residential', 'path']);
  const area = pick(address, ['suburb', 'neighbourhood', 'quarter', 'city_district', 'hamlet']);
  const city = pick(address, [
    'city',
    'town',
    'village',
    'municipality',
    'state_district',
    'county',
  ]);
  const state = address.state || '';
  const parts = [street, area, city, state].filter(
    (part, index, all) => part && all.indexOf(part) === index,
  );
  return { street, area, city, state, postcode: address.postcode || '', label: parts.join(', ') };
}

/**
 * Turn coordinates into a street-level place ("Anna Nagar Main Road, Anna Nagar, Madurai").
 * Tamil names are a best-effort extra. Returns null when the point has no address (open sea).
 * @param {number} lat
 * @param {number} lon
 */
function reversePlace(lat, lon) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  return reverseCache.wrap(key, async () => {
    const lookup = (language) => {
      const params = new URLSearchParams({
        format: 'jsonv2',
        lat: String(lat),
        lon: String(lon),
        zoom: '18',
        addressdetails: '1',
        'accept-language': language,
      });
      return fetchJson(`${REVERSE_URL}?${params.toString()}`, {
        timeoutMs: config.upstreamTimeoutMs,
        headers: REVERSE_HEADERS,
      });
    };
    const raw = await lookup('en');
    if (!raw || raw.error || !raw.address) return null;
    const en = describeAddress(raw);
    const ta = await lookup('ta')
      .then(describeAddress)
      .catch(() => null);
    return {
      name: en.city || en.area || en.street,
      label: en.label,
      street: en.street,
      area: en.area,
      city: en.city,
      state: en.state,
      postcode: en.postcode,
      nameTa: ta && ta.city ? ta.city : null,
      labelTa: ta && ta.label ? ta.label : null,
      lat,
      lon,
    };
  });
}

module.exports = {
  searchPlaces,
  reversePlace,
  describeAddress,
  clearCache: () => {
    cache.clear();
    reverseCache.clear();
  },
};
