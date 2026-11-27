import { api } from './api.js';
import { createBackdrop } from './backdrop.js';
import { initMotion } from './motion.js';
import { t, setLanguage, getLanguage, translateDocument } from './i18n.js';
import * as ui from './ui.js';
import { el } from './ui.js';
import { createRouter } from './router.js';
import { mountLifestyleSelector, readStore, writeStore } from './lifestyle.js';
import { mountWizard } from './wizard.js';
import { mountLocal } from './localView.js';
import { mountPlanner } from './plannerView.js';
import { mountIndoor } from './indoorView.js';
import { mountGreen } from './greenView.js';
import { mountChat } from './chat.js';
import { mountAlerts } from './alerts.js';
import { mountGate } from './gate.js';
import { initCursor } from './cursor.js';
import { announce, setStatus } from './statusBar.js';
import { createSky, SKY_KEY, SKY_MODES } from './sky.js';
import { CITIES as ALL_CITIES, placeLabel, placeName } from './cities.js';

const STORE_KEY = 'airsense.v1';
const LIFESTYLE_KEY = 'airsense.lifestyle.v1';
const REFRESH_MS = 5 * 60 * 1000;
const REACH = [1, 50, 1000, 10000];
const MODES = ['car', 'motorcycle', 'auto', 'bus', 'metro', 'bicycle', 'walk', 'wfh'];
const HOME_CITIES = ['Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bengaluru', 'Madurai'];
const CITIES = ALL_CITIES.filter((city) => HOME_CITIES.includes(city.name));
const DEFAULT_PLACE = {
  name: ALL_CITIES[0].name,
  label: `${ALL_CITIES[0].name}, India`,
  lat: ALL_CITIES[0].lat,
  lon: ALL_CITIES[0].lon,
};

const $ = (selector) => document.querySelector(selector);

const state = {
  lang: 'en',
  place: DEFAULT_PLACE,
  chosen: false,
  env: null,
  lastLoadedAt: 0,
  profile: {
    commuteMode: 'motorcycle',
    commuteKm: 8,
    homeType: 'apartment',
    cooking: 'lpg',
    vulnerable: [],
    hasPurifier: false,
  },
  choices: {
    switchCommute: null,
    usePurifier: false,
    wearMask: false,
    cleanCooking: false,
    avoidPeakHours: false,
    households: 1000,
  },
  lifestyle: 'professional',
  sky: 'auto',
  hasPlan: false,
  traceId: null,
  engineering: null,
};

let skyline;
let sky;
let engineeringLoaded = false;
let envController = null;
let impactSeq = 0;
let planSeq = 0;
let rulesSeq = 0;
let compareSeq = 0;
let wizard;
let gate;
const plans = { comparison: null };
let lifestyleSel;
let planner;
let near;
let router;
let onFormChange = () => {};
let indoor;
let green;
let chat;
let alerts;

/* ---------- small helpers ---------- */

const debounce = (fn, wait) => {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
};

function save() {
  writeStore(STORE_KEY, {
    lang: state.lang,
    place: state.place,
    chosen: state.chosen,
    profile: state.profile,
    choices: state.choices,
  });
}

const isPlace = (p) =>
  p && typeof p.name === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lon);

/** The place as shown in the chosen language (a Tamil name for Tamil, English otherwise). */
const shortName = () =>
  state.place.name === 'Your location' && state.lang === 'ta'
    ? t('yourLocation')
    : placeName(state.place, state.lang);
const longName = () =>
  state.place.name === 'Your location' && state.lang === 'ta'
    ? t('yourLocation')
    : placeLabel(state.place, state.lang);

/** "Showing the air for Madurai" bar on every page except Home. */
function renderWhere() {
  const bar = $('#where');
  const show = Boolean(state.env) && document.body.dataset.view !== 'home';
  bar.hidden = !show;
  if (!show) return;
  const { current } = state.env.air;
  $('#where-text').textContent = t('gate.showing', {
    place: longName(),
    aqi: current.aqi,
    category: t(`category.${current.category}`),
  });
  if (state.place.accuracy) {
    $('#where-text').textContent += ` ${t('gate.within', { m: state.place.accuracy })}`;
  }
  bar.style.setProperty('--aqi-color', current.color);
}

/* ---------- form <-> state ---------- */

function fillSelect(select, options, selected) {
  select.replaceChildren(
    ...options.map(([value, label]) => {
      const option = ui.el('option', { text: label, attrs: { value } });
      if (value === selected) option.selected = true;
      return option;
    }),
  );
}

function buildControls() {
  const profileForm = $('#profile-form');
  const choicesForm = $('#choices-form');

  fillSelect(
    profileForm.commuteMode,
    MODES.map((mode) => [mode, t(`modes.${mode}`)]),
    state.profile.commuteMode,
  );
  fillSelect(
    profileForm.homeType,
    ['apartment', 'house'].map((v) => [v, t(`homes.${v}`)]),
    state.profile.homeType,
  );
  fillSelect(
    profileForm.cooking,
    ['lpg', 'induction', 'biomass'].map((v) => [v, t(`cookings.${v}`)]),
    state.profile.cooking,
  );
  fillSelect(
    choicesForm.switchCommute,
    [['', t('keepAsIs')], ...MODES.map((mode) => [mode, t(`modes.${mode}`)])],
    state.choices.switchCommute || '',
  );
  syncLabFromProfile();

  const reach = $('#reach');
  reach.replaceChildren(
    ...REACH.map((count) => {
      const input = ui.el('input', {
        attrs: { type: 'radio', name: 'reach', value: String(count) },
      });
      input.checked = state.choices.households === count;
      return ui.el('label', { class: 'seg' }, input, ui.el('span', { text: t(`reach.${count}`) }));
    }),
  );
}

/** The lab's "Your day" controls and the My plan form edit the same profile; keep them in step. */
function syncLabFromProfile() {
  const p = state.profile;
  fillSelect(
    $('#labMode'),
    MODES.map((mode) => [mode, t(`modes.${mode}`)]),
    p.commuteMode,
  );
  fillSelect(
    $('#labCooking'),
    ['lpg', 'induction', 'biomass'].map((v) => [v, t(`cookings.${v}`)]),
    p.cooking,
  );
  $('#labKm').value = String(Math.min(60, p.commuteKm));
  $('#labKmOut').textContent = `${Math.min(60, p.commuteKm)} km`;
}

function copyLabToProfile() {
  const form = $('#profile-form');
  form.commuteMode.value = $('#labMode').value;
  form.cooking.value = $('#labCooking').value;
  form.commuteKm.value = $('#labKm').value;
  $('#labKmOut').textContent = `${$('#labKm').value} km`;
}

const PRESETS = {
  reset: {
    switchCommute: '',
    usePurifier: false,
    wearMask: false,
    cleanCooking: false,
    avoidPeakHours: false,
  },
  easy: {
    switchCommute: '',
    usePurifier: false,
    wearMask: true,
    cleanCooking: false,
    avoidPeakHours: true,
  },
  all: {
    switchCommute: 'metro',
    usePurifier: true,
    wearMask: true,
    cleanCooking: true,
    avoidPeakHours: true,
  },
};

function applyPreset(name) {
  const form = $('#choices-form');
  const preset = PRESETS[name];
  form.switchCommute.value = preset.switchCommute;
  for (const key of ['usePurifier', 'wearMask', 'cleanCooking', 'avoidPeakHours']) {
    form.elements[key].checked = preset[key];
  }
  onFormChange();
}

function writeFormsFromState() {
  const profileForm = $('#profile-form');
  const choicesForm = $('#choices-form');
  profileForm.commuteKm.value = String(state.profile.commuteKm);
  profileForm.hasPurifier.checked = state.profile.hasPurifier;
  profileForm.querySelectorAll('input[name="vulnerable"]').forEach((box) => {
    box.checked = state.profile.vulnerable.includes(box.value);
  });
  for (const name of ['usePurifier', 'wearMask', 'cleanCooking', 'avoidPeakHours']) {
    choicesForm.elements[name].checked = state.choices[name];
  }
}

function readForms() {
  const profileForm = $('#profile-form');
  const choicesForm = $('#choices-form');
  const km = Number.parseFloat(profileForm.commuteKm.value);

  state.profile = {
    commuteMode: profileForm.commuteMode.value,
    commuteKm: Number.isFinite(km) ? Math.min(100, Math.max(0, km)) : 0,
    homeType: profileForm.homeType.value,
    cooking: profileForm.cooking.value,
    vulnerable: [...profileForm.querySelectorAll('input[name="vulnerable"]:checked')].map(
      (b) => b.value,
    ),
    hasPurifier: profileForm.hasPurifier.checked,
  };
  const reach = choicesForm.querySelector('input[name="reach"]:checked');
  state.choices = {
    switchCommute: choicesForm.switchCommute.value || null,
    usePurifier: choicesForm.elements.usePurifier.checked,
    wearMask: choicesForm.elements.wearMask.checked,
    cleanCooking: choicesForm.elements.cleanCooking.checked,
    avoidPeakHours: choicesForm.elements.avoidPeakHours.checked,
    households: reach ? Number(reach.value) : 1,
  };
}

/* ---------- live environment ---------- */

function describeSky(env) {
  const { current } = env.air;
  const phase = env.weather && env.weather.isDay === false ? t('nighttime') : t('daytime');
  skyline.canvas.setAttribute(
    'aria-label',
    t('skyLabel', { category: t(`category.${current.category}`), aqi: current.aqi, time: phase }),
  );
}

function renderEnvironment(env, { announceChange = true } = {}) {
  const { current, forecast, cleanestHour } = env.air;
  $('#place-name').textContent = longName();
  ui.renderGauge(current);
  ui.renderPollutants(current);
  ui.renderForecast(forecast, cleanestHour);
  ui.renderWindows(env.windows);
  ui.renderChip(shortName(), current);
  ui.renderHomeLive(shortName(), current);
  renderWhere();
  const time = new Date(env.fetchedAt).toLocaleTimeString(
    getLanguage() === 'ta' ? 'ta-IN' : 'en-IN',
    {
      hour: '2-digit',
      minute: '2-digit',
    },
  );
  $('#updated').textContent = t('updatedAt', { time });
  describeSky(env);

  sky.apply();

  if (announceChange) {
    announce(
      t('announceEnvironment', {
        place: shortName(),
        aqi: current.aqi,
        category: t(`category.${current.category}`),
      }),
    );
  }
}

async function loadEnvironment({ silent = false, fresh = false } = {}) {
  if (envController) envController.abort();
  envController = new AbortController();
  const { signal } = envController;
  const place = state.place;

  if (!silent) setStatus(t('loading'));
  try {
    const env = await api.environment(place.lat, place.lon, signal);
    if (place !== state.place) return;
    state.env = env;
    state.lastLoadedAt = Date.now();
    renderEnvironment(env, { announceChange: !silent });
    alerts.check(env);
    router.fitNav();
    refreshView(document.body.dataset.view);
    setStatus('');
    await refreshImpact();
    if (fresh && state.hasPlan) requestPlans();
  } catch (error) {
    if (error.name === 'AbortError') return;
    setStatus(t('errorEnvironment'), { isError: true, onRetry: () => loadEnvironment({ fresh }) });
  }
}

/* ---------- impact ("what if") ---------- */

async function refreshImpact() {
  if (!state.env) return;
  const seq = (impactSeq += 1);
  try {
    const { impact } = await api.impact({
      pm25: state.env.air.current.pm25 || 0,
      profile: state.profile,
      choices: state.choices,
    });
    if (seq !== impactSeq) return;
    ui.renderImpact(impact, state.profile, state.env.air.forecast, state.env.air.current.pm25 || 0);
    skyline.setReduction(impact.community.visualHazeReduction);
  } catch {
    /* keep the last good numbers on screen */
  }
}

const refreshImpactSoon = debounce(refreshImpact, 220);

/* ---------- AI plan ---------- */

function planInput() {
  const notes = $('#notes').value.trim();
  return {
    lat: state.place.lat,
    lon: state.place.lon,
    locationName: shortName(),
    lang: state.lang,
    profile: state.profile,
    choices: state.choices,
    ...(notes ? { notes } : {}),
  };
}

/** The AirSense plan: deterministic rules over live data. Instant, no model involved. */
async function requestRulesPlan() {
  if (!state.env) return;
  const seq = (rulesSeq += 1);
  const panel = $('#panel-rules');
  panel.setAttribute('aria-busy', 'true');
  ui.renderPlanMessage(t('planLoadingRules'), { host: '#plan-body-rules' });
  try {
    const result = await api.advice({ ...planInput(), engine: 'rules' });
    if (seq !== rulesSeq) return;
    ui.renderAdvice(result, '#plan-body-rules');
    state.traceId = result.traceId || state.traceId;
    $('#trace-link').hidden = !state.traceId;
    announce(t('planReady'));
  } catch {
    if (seq !== rulesSeq) return;
    ui.renderPlanMessage(t('errorPlan'), {
      isError: true,
      onRetry: requestRulesPlan,
      host: '#plan-body-rules',
    });
  } finally {
    if (seq === rulesSeq) panel.setAttribute('aria-busy', 'false');
  }
}

/** The AI plan: written by the language model, validated server-side. Never a copy of the rules plan. */
async function requestAiPlan() {
  if (!state.env) return;
  const seq = (planSeq += 1);
  const panel = $('#panel-ai');
  const button = $('#plan-btn');
  panel.setAttribute('aria-busy', 'true');
  button.disabled = true;
  ui.renderPlanMessage(t('planLoading'));
  try {
    const result = await api.advice(planInput());
    if (seq !== planSeq) return;
    if (result.source === 'ai') {
      ui.renderAdvice(result);
    } else {
      const reason = result.fallbackReason === 'no-api-key' ? 'aiNoKey' : 'aiFailed';
      ui.renderPlanMessage(t(`wiz.${reason}`), { host: '#plan-body' });
    }
    state.traceId = result.traceId || state.traceId;
    $('#trace-link').hidden = !state.traceId;
  } catch {
    if (seq !== planSeq) return;
    ui.renderPlanMessage(t('errorPlan'), { isError: true, onRetry: requestAiPlan });
  } finally {
    if (seq === planSeq) {
      panel.setAttribute('aria-busy', 'false');
      button.disabled = false;
    }
  }
}

/** Your current habits against the AirSense recommendations, priced with the same impact model. */
async function requestComparison() {
  if (!state.env) return;
  const seq = (compareSeq += 1);
  ui.renderCompare(null);
  try {
    const { comparison } = await api.compare({
      lat: state.place.lat,
      lon: state.place.lon,
      lang: state.lang,
      profile: state.profile,
    });
    if (seq !== compareSeq) return;
    plans.comparison = comparison;
    ui.renderCompare(comparison, state.profile);
  } catch {
    if (seq !== compareSeq) return;
    $('#compare-body').replaceChildren(el('p', { class: 'message error', text: t('errorPlan') }));
  }
}

function requestPlans() {
  state.hasPlan = true;
  requestComparison();
  requestRulesPlan();
  requestAiPlan();
}

/** Plain-language summary of the answers, shown on the last wizard step. */
function reviewRows() {
  const p = state.profile;
  const opt = (id) => {
    const select = $(`#${id}`);
    return select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : '';
  };
  const people = p.vulnerable.map((v) => t(`vulnerable.${v}`)).join(', ') || t('wiz.nobody');
  return [
    [t('commute'), `${opt('commuteMode')}, ${p.commuteKm} km`],
    [t('homeLabel'), `${opt('homeType')}, ${opt('cooking')}`],
    [t('purifier'), p.hasPurifier ? t('wiz.yes') : t('wiz.no')],
    [t('household'), people],
  ];
}

/* ---------- lifestyle pages (planner, indoor air, green living, chat) ---------- */

function getCtx() {
  const current = state.env && state.env.air.current;
  return {
    lat: state.place.lat,
    lon: state.place.lon,
    place: shortName(),
    lang: state.lang,
    lifestyle: state.lifestyle,
    profile: state.profile,
    windows: state.env ? state.env.windows : null,
    air: current ? { aqi: current.aqi, category: current.category } : null,
  };
}

/** Refresh only the page that is on screen; the others refresh when you open them. */
function refreshView(view) {
  if (!state.env) return;
  if (view === 'dashboard') near.refresh();
  else if (view === 'planner') planner.refresh();
  else if (view === 'indoor') indoor.refresh();
  else if (view === 'green') green.refresh();
}

function setLifestyle(key) {
  state.lifestyle = key;
  writeStore(LIFESTYLE_KEY, key);
  lifestyleSel.render();
  refreshView(document.body.dataset.view);
}

/* ---------- places ---------- */

/** Home page: live readings for a few cities, fetched in parallel; failures are simply omitted. */
async function loadCities() {
  const results = await Promise.allSettled(
    CITIES.map((city) => api.environment(city.lat, city.lon)),
  );
  const rows = results
    .map((result, index) =>
      result.status === 'fulfilled'
        ? {
            ...CITIES[index],
            label: state.lang === 'ta' ? CITIES[index].ta : CITIES[index].name,
            ...result.value.air.current,
          }
        : null,
    )
    .filter(Boolean);
  ui.renderCities(rows, (city) => {
    pickPlace({
      name: city.name,
      label: `${city.name}, India`,
      labelTa: `${city.ta}, இந்தியா`,
      lat: city.lat,
      lon: city.lon,
    });
    window.location.hash = '#/dashboard';
  });
}

function pickPlace(place) {
  state.place = {
    name: place.name,
    label: place.label || place.name,
    ...(place.nameTa ? { nameTa: place.nameTa } : {}),
    ...(place.labelTa ? { labelTa: place.labelTa } : {}),
    ...(place.accuracy ? { accuracy: place.accuracy } : {}),
    lat: place.lat,
    lon: place.lon,
  };
  state.chosen = true;
  save();
  chat.reset();
  // A plan, comparison, planner or indoor page made for another place is stale: loadEnvironment
  // (fresh) rebuilds the plan if one exists and refreshes the page that is open.
  loadEnvironment({ fresh: true });
}

/** "Use my location" from the dashboard: same detection as the first-run dialog. */
function locate() {
  gate.detect();
}

/* ---------- language ---------- */

function switchLanguage() {
  state.lang = state.lang === 'en' ? 'ta' : 'en';
  applyLanguage();
  save();
  if (state.hasPlan) requestPlans();
}

function applyLanguage() {
  setLanguage(state.lang);
  translateDocument();
  $('#live').textContent = ''; // an announcement in the old language would otherwise linger
  if (router) router.fitNav();
  const button = $('#lang-btn');
  button.textContent = t('langButton');
  button.setAttribute('aria-label', t('langButtonLabel'));
  button.setAttribute('lang', state.lang === 'en' ? 'ta' : 'en');
  buildControls();
  writeFormsFromState();
  if (state.env) {
    renderEnvironment(state.env, { announceChange: false });
    refreshImpact();
  }
  loadCities();
  if (skyline) sky.apply();
  if (gate) gate.relabel();
  if (state.env) renderWhere();
  if (planner) {
    lifestyleSel.render();
    planner.relabel();
    near.relabel();
    wizard.relabel();
    alerts.relabel();
    chat.relabel();
    refreshView(document.body.dataset.view);
  }
}

/* ---------- boot ---------- */

async function init() {
  const saved = readStore(STORE_KEY, {});
  if (saved.lang === 'ta') state.lang = 'ta';
  if (isPlace(saved.place)) state.place = saved.place;
  state.chosen = saved.chosen === true && isPlace(saved.place);
  if (saved.profile) state.profile = { ...state.profile, ...saved.profile };
  if (saved.choices) state.choices = { ...state.choices, ...saved.choices };
  else {
    // First visit: start with a realistic scenario so the lab shows real numbers, not zeros.
    state.choices.switchCommute = state.profile.commuteMode === 'metro' ? null : 'metro';
    state.choices.usePurifier = !state.profile.hasPurifier;
    state.choices.wearMask = true;
  }

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  initMotion({ reducedMotion: motion.matches });
  initCursor({ reducedMotion: motion.matches });
  skyline = await createBackdrop({ reducedMotion: motion.matches });
  sky = createSky({ state, getSkyline: () => skyline, button: $('#sky-btn') });
  motion.addEventListener('change', (event) => {
    skyline.reducedMotion = event.matches;
    skyline.start();
  });
  skyline.start();
  const savedSky = readStore(SKY_KEY, 'auto');
  if (SKY_MODES.includes(savedSky)) state.sky = savedSky;

  const savedLifestyle = readStore(LIFESTYLE_KEY, null);
  if (['student', 'professional', 'elder', 'parent'].includes(savedLifestyle))
    state.lifestyle = savedLifestyle;
  const onAsk = (topic, prompt) => chat.open({ topic, prompt });
  lifestyleSel = mountLifestyleSelector({ get: () => state.lifestyle, set: setLifestyle });
  near = mountLocal({
    getCtx,
    cities: CITIES,
    onPick: pickPlace,
    onLocate: locate,
  });
  planner = mountPlanner({ getCtx, onAsk });
  indoor = mountIndoor({ getCtx, onAsk });
  green = mountGreen({ getCtx, onAsk });
  chat = mountChat({ getCtx });
  alerts = mountAlerts({ getPlace: shortName });

  wizard = mountWizard({
    review: () => {
      readForms();
      return reviewRows();
    },
    onFinish: () => {
      readForms();
      requestPlans();
    },
  });
  applyLanguage();

  onFormChange = () => {
    readForms();
    save();
    syncLabFromProfile();
    refreshImpactSoon();
  };
  $('#profile-form').addEventListener('input', onFormChange);
  $('#choices-form').addEventListener('input', (event) => {
    if (event.target.id && event.target.id.startsWith('lab')) copyLabToProfile();
    onFormChange();
  });
  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => applyPreset(button.dataset.preset));
  });
  $('#profile-form').addEventListener('submit', (event) => event.preventDefault());
  $('#choices-form').addEventListener('submit', (event) => event.preventDefault());

  gate = mountGate({ onPick: pickPlace, getLang: () => state.lang, onLang: switchLanguage });
  $('#place-chip').addEventListener('click', () => gate.show());
  $('#where-change').addEventListener('click', () => gate.show());
  $('#lang-btn').addEventListener('click', switchLanguage);
  $('#sky-btn').addEventListener('click', sky.cycle);
  $('#plan-btn').addEventListener('click', requestAiPlan);

  window.setInterval(() => {
    if (!document.hidden) loadEnvironment({ silent: true });
  }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - state.lastLoadedAt > REFRESH_MS) {
      loadEnvironment({ silent: true });
    }
  });

  router = createRouter({
    onChange: (view) => {
      renderWhere();
      skyline.setView(view);
      if (view === 'engineering') openEngineering();
      refreshView(view);
    },
  });

  readForms();
  loadEnvironment({ fresh: true });
  if (!state.chosen) gate.show({ required: true });
}

async function openEngineering() {
  const root = $('#eng-root');
  if (!engineeringLoaded) {
    engineeringLoaded = true;
    try {
      const { mountEngineering } = await import('./engineering.js');
      state.engineering = mountEngineering(root, { getTraceId: () => state.traceId });
    } catch {
      engineeringLoaded = false;
      root.replaceChildren(ui.el('p', { class: 'message error', text: t('errorEnvironment') }));
      return;
    }
  }
  state.engineering.refresh();
}

init();
