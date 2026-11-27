/**
 * Location gate: a dialog that opens on the first visit (and from "Change location").
 * Three ways in, in this order: detect, search, pick a popular city. Choosing a place hands it to
 * main.js, which refreshes every module. Everything behind the dialog is inert while it is open,
 * so keyboard and screen-reader users cannot wander off before choosing.
 */
import { t } from './i18n.js';
import { el } from './ui.js';
import { api } from './api.js';
import { createPlaceSearch } from './placeSearch.js';
import { CITIES, POPULAR, nearestCity, placeLabel } from './cities.js';
import { COUNTRIES, INDIA_STATES } from './regions.js';

const $ = (id) => document.getElementById(id);

/**
 * @param {{onPick: (place: object) => void, getLang: () => string, onLang: () => void}} options
 */
export function mountGate({ onPick, getLang, onLang }) {
  const root = $('gate');
  const message = $('gate-msg');
  const locateBtn = $('gate-locate');
  const closeBtn = $('gate-close');
  let dismissible = false;
  let opener = null;
  let open = false;

  const say = (text, isError = false) => {
    message.textContent = text;
    message.classList.toggle('error', isError);
  };

  const search = createPlaceSearch({
    input: $('gate-q'),
    list: $('gate-suggest'),
    status: message,
    getLang,
    getCountry: () => $('gate-country').value || undefined,
    onPick: (place) => choose(place),
  });
  $('gate-form').addEventListener('submit', (event) => {
    event.preventDefault();
    search.submit();
  });

  /* ---------- country, state, city ---------- */
  const countrySel = $('gate-country');
  const stateSel = $('gate-state');
  const citySel = $('gate-city');
  const goBtn = $('gate-pick-go');

  const option = (value, text) => el('option', { text, attrs: { value } });
  const isIndia = () => countrySel.value === 'IN';

  function fillSelect(select, items, placeholder, keep) {
    select.replaceChildren(
      option('', placeholder),
      ...items.map(([value, text]) => option(value, text)),
    );
    select.value = items.some(([value]) => value === keep) ? keep : '';
  }

  /** Rebuild the three lists in the current language, keeping what was already chosen. */
  function renderPicker() {
    const ta = getLang() === 'ta';
    const keep = { country: countrySel.value || 'IN', state: stateSel.value, city: citySel.value };
    fillSelect(
      countrySel,
      COUNTRIES.map((c) => [c.code, ta ? c.ta : c.name]),
      t('gate.choose'),
      keep.country,
    );
    if (!countrySel.value) countrySel.value = 'IN';
    const india = isIndia();
    $('gate-state-field').hidden = !india;
    $('gate-city-field').hidden = !india;
    $('gate-pick-hint').hidden = india || !countrySel.value;
    goBtn.hidden = !india;
    fillSelect(
      stateSel,
      india
        ? Object.entries(INDIA_STATES)
            .map(([name, data]) => [name, ta ? data.ta : name])
            .sort((a, b) => a[1].localeCompare(b[1], ta ? 'ta' : 'en'))
        : [],
      t('gate.choose'),
      keep.state,
    );
    const state = INDIA_STATES[stateSel.value];
    fillSelect(
      citySel,
      state ? state.cities.map(([name, nameTa]) => [name, ta ? nameTa : name]) : [],
      t('gate.choose'),
      keep.city,
    );
    citySel.disabled = !state;
    goBtn.disabled = !citySel.value;
  }

  countrySel.addEventListener('change', () => {
    stateSel.value = '';
    citySel.value = '';
    renderPicker();
    $('gate-q').value = '';
  });
  stateSel.addEventListener('change', () => {
    citySel.value = '';
    renderPicker();
    if (stateSel.value) citySel.focus();
  });
  citySel.addEventListener('change', renderPicker);

  /** Find the chosen city: ask the geocoder (limited to India) and prefer the right state. */
  $('gate-pick').addEventListener('submit', async (event) => {
    event.preventDefault();
    const state = INDIA_STATES[stateSel.value];
    const city = state && state.cities.find(([name]) => name === citySel.value);
    if (!city) return;
    goBtn.disabled = true;
    goBtn.setAttribute('aria-busy', 'true');
    say(t('gate.finding', { place: getLang() === 'ta' ? city[1] : city[0] }));
    try {
      const { places } = await api.geocode(city[0], 'IN');
      const norm = (text) => String(text || '').toLowerCase();
      const found =
        places.find((p) => norm(p.region) === norm(stateSel.value)) ||
        places.find((p) => norm(p.name) === norm(city[0])) ||
        places[0];
      if (!found) {
        say(t('gate.notFound'), true);
        return;
      }
      choose({
        ...found,
        name: city[0],
        label: `${city[0]}, ${stateSel.value}, India`,
        nameTa: city[1],
        labelTa: `${city[1]}, ${state.ta}, இந்தியா`,
      });
    } catch {
      say(t('gate.lookupFailed'), true);
    } finally {
      goBtn.removeAttribute('aria-busy');
      goBtn.disabled = !citySel.value;
    }
  });

  function renderCities() {
    const lang = getLang();
    const langBtn = $('gate-lang');
    langBtn.textContent = t('langButton');
    langBtn.setAttribute('aria-label', t('langButtonLabel'));
    langBtn.setAttribute('lang', lang === 'en' ? 'ta' : 'en');
    renderPicker();
    $('gate-cities').replaceChildren(
      ...POPULAR.map((name) => {
        const city = CITIES.find((c) => c.name === name);
        const button = el('button', {
          class: 'chip chip-btn',
          type: 'button',
          text: lang === 'ta' ? city.ta : city.name,
        });
        button.addEventListener('click', () =>
          choose({
            name: city.name,
            label: `${city.name}, India`,
            labelTa: `${city.ta}, இந்தியா`,
            lat: city.lat,
            lon: city.lon,
          }),
        );
        return button;
      }),
    );
  }

  /** Everything except the dialog (and the live region) becomes unreachable while it is open. */
  function setInert(on) {
    for (const node of document.body.children) {
      if (node === root || node.id === 'live' || node.tagName === 'SCRIPT') continue;
      node.inert = on;
    }
  }

  function close() {
    if (!open) return;
    open = false;
    root.hidden = true;
    setInert(false);
    document.documentElement.classList.remove('gate-open');
    if (opener && opener.focus && document.contains(opener)) opener.focus();
  }

  function choose(place) {
    say('');
    close();
    onPick(place);
  }

  function describeError(error) {
    if (error && error.code === 1) return t('gate.denied');
    if (error && error.code === 3) return t('gate.timeout');
    if (!window.isSecureContext) return t('gate.insecure');
    return t('gate.unavailable');
  }

  function detect() {
    if (!navigator.geolocation) {
      say(t('gate.unsupported'), true);
      return;
    }
    locateBtn.disabled = true;
    locateBtn.setAttribute('aria-busy', 'true');
    say(t('gate.asking'));
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        // 4 decimals is about 11 m: precise enough for a street, not a doorstep.
        const lat = Number(position.coords.latitude.toFixed(4));
        const lon = Number(position.coords.longitude.toFixed(4));
        const accuracy = Math.round(position.coords.accuracy || 0);
        say(t('gate.naming'));
        let found = null;
        try {
          found = (await api.reverse(lat, lon)).place;
        } catch {
          found = null; // offline lookup: fall back to the nearest known city below
        }
        locateBtn.disabled = false;
        locateBtn.removeAttribute('aria-busy');
        const city = nearestCity(lat, lon);
        const place = found
          ? { ...found, lat, lon }
          : city
            ? {
                name: city.name,
                label: t('gate.near', { place: city.name }),
                labelTa: t('gate.near', { place: city.ta }),
                lat,
                lon,
              }
            : { name: t('yourLocation'), label: t('yourLocation'), lat, lon };
        choose(accuracy > 0 ? { ...place, accuracy } : place);
      },
      (error) => {
        locateBtn.disabled = false;
        locateBtn.removeAttribute('aria-busy');
        if (!open) show();
        say(describeError(error), true);
        $('gate-q').focus();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  locateBtn.addEventListener('click', detect);
  closeBtn.addEventListener('click', close);
  $('gate-lang').addEventListener('click', () => {
    onLang();
    renderCities();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dismissible) close();
  });

  /** @param {{required?: boolean}} options required: the user must choose (first visit). */
  function show({ required = false } = {}) {
    dismissible = !required;
    opener = document.activeElement;
    open = true;
    renderCities();
    say('');
    closeBtn.hidden = !dismissible;
    root.hidden = false;
    setInert(true);
    document.documentElement.classList.add('gate-open');
    $('gate-locate').focus();
  }

  return {
    show,
    detect,
    isOpen: () => open,
    relabel() {
      renderCities();
    },
    describe: (place) => placeLabel(place, getLang()),
  };
}
