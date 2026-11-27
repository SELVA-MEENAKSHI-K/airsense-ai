/**
 * Known cities: used for the quick-pick chips, for naming a detected position ("near Madurai")
 * and for showing a city's name in Tamil when the language is Tamil.
 */
export const CITIES = [
  { name: 'Delhi', ta: 'தில்லி', lat: 28.6139, lon: 77.209 },
  { name: 'Mumbai', ta: 'மும்பை', lat: 19.076, lon: 72.8777 },
  { name: 'Kolkata', ta: 'கொல்கத்தா', lat: 22.5726, lon: 88.3639 },
  { name: 'Chennai', ta: 'சென்னை', lat: 13.0827, lon: 80.2707 },
  { name: 'Bengaluru', ta: 'பெங்களூரு', lat: 12.9716, lon: 77.5946 },
  { name: 'Hyderabad', ta: 'ஹைதராபாத்', lat: 17.385, lon: 78.4867 },
  { name: 'Madurai', ta: 'மதுரை', lat: 9.9252, lon: 78.1198 },
  { name: 'Coimbatore', ta: 'கோயம்புத்தூர்', lat: 11.0168, lon: 76.9558 },
  { name: 'Tiruchirappalli', ta: 'திருச்சிராப்பள்ளி', lat: 10.7905, lon: 78.7047 },
  { name: 'Salem', ta: 'சேலம்', lat: 11.6643, lon: 78.146 },
  { name: 'Tirunelveli', ta: 'திருநெல்வேலி', lat: 8.7139, lon: 77.7567 },
  { name: 'Thanjavur', ta: 'தஞ்சாவூர்', lat: 10.787, lon: 79.1378 },
  { name: 'Erode', ta: 'ஈரோடு', lat: 11.341, lon: 77.7172 },
  { name: 'Vellore', ta: 'வேலூர்', lat: 12.9165, lon: 79.1325 },
  { name: 'Thoothukudi', ta: 'தூத்துக்குடி', lat: 8.7642, lon: 78.1348 },
  { name: 'Kochi', ta: 'கொச்சி', lat: 9.9312, lon: 76.2673 },
  { name: 'Pune', ta: 'புனே', lat: 18.5204, lon: 73.8567 },
  { name: 'Ahmedabad', ta: 'அகமதாபாத்', lat: 23.0225, lon: 72.5714 },
  { name: 'Jaipur', ta: 'ஜெய்ப்பூர்', lat: 26.9124, lon: 75.7873 },
  { name: 'Lucknow', ta: 'லக்னோ', lat: 26.8467, lon: 80.9462 },
  { name: 'Patna', ta: 'பாட்னா', lat: 25.5941, lon: 85.1376 },
  { name: 'Gurugram', ta: 'குருகிராம்', lat: 28.4595, lon: 77.0266 },
];

/** The eight shown as quick picks. */
export const POPULAR = [
  'Delhi',
  'Mumbai',
  'Kolkata',
  'Chennai',
  'Bengaluru',
  'Madurai',
  'Coimbatore',
  'Hyderabad',
];

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in km. */
export function distanceKm(aLat, aLon, bLat, bLon) {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** The known city within `maxKm` of a position, or null. */
export function nearestCity(lat, lon, maxKm = 35) {
  let best = null;
  for (const city of CITIES) {
    const km = distanceKm(lat, lon, city.lat, city.lon);
    if (km <= maxKm && (!best || km < best.km)) best = { city, km };
  }
  return best ? best.city : null;
}

/** A place's name in the chosen language (known cities only; anything else is shown as given). */
export function placeLabel(place, lang) {
  if (!place) return '';
  if (lang !== 'ta') return place.label || place.name;
  const known = CITIES.find((c) => c.name === place.name);
  return place.labelTa || (known ? known.ta : null) || place.label || place.name;
}

/** Short name (no region) in the chosen language. */
export function placeName(place, lang) {
  if (!place) return '';
  if (lang !== 'ta') return place.name;
  const known = CITIES.find((c) => c.name === place.name);
  return known ? known.ta : place.nameTa || place.name;
}
