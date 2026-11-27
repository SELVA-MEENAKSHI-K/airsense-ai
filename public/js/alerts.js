/**
 * Pollution alerts. The check runs in the browser against the live data already loaded, so it
 * works without accounts or a push server; the limit is stated in the UI: alerts fire only while
 * a tab is open. An in-page banner always works; the Notification API is optional.
 */
import { t } from './i18n.js';
import { el } from './ui.js';
import { readStore, writeStore } from './lifestyle.js';

const KEY = 'airsense.alerts.v1';
const LEVELS = { watch: 100, unhealthy: 150, severe: 200 };

/** @param {{getPlace: () => string}} deps */
export function mountAlerts({ getPlace }) {
  const banner = document.getElementById('alert-banner');
  const select = document.getElementById('al-level');
  const notifyBtn = document.getElementById('notify-btn');
  const notifyState = document.getElementById('notify-state');
  const prefs = { level: 'watch', notify: false, ...readStore(KEY, {}) };
  if (!LEVELS[prefs.level]) prefs.level = 'watch';
  let lastKey = '';
  let dismissedKey = '';
  let lastEnv = null;

  const supported = typeof window !== 'undefined' && 'Notification' in window;

  function fillSelect() {
    select.replaceChildren(
      ...Object.keys(LEVELS).map((k) =>
        el('option', { text: t(`alerts.${k}`), attrs: { value: k } }),
      ),
    );
    select.value = prefs.level;
  }

  function renderState() {
    if (!supported) notifyState.textContent = t('alerts.unsupported');
    else if (Notification.permission === 'denied') notifyState.textContent = t('alerts.blocked');
    else if (prefs.notify && Notification.permission === 'granted')
      notifyState.textContent = t('alerts.enabled');
    else notifyState.textContent = '';
    notifyBtn.disabled =
      !supported ||
      Notification.permission === 'denied' ||
      (prefs.notify && Notification.permission === 'granted');
  }

  function hide() {
    banner.hidden = true;
    banner.replaceChildren();
  }

  function show(text, key) {
    if (dismissedKey === key) return;
    const close = el('button', {
      class: 'btn btn-quiet',
      type: 'button',
      text: t('alerts.dismiss'),
    });
    close.addEventListener('click', () => {
      dismissedKey = key;
      hide();
    });
    banner.replaceChildren(el('p', { text }), close);
    banner.hidden = false;
  }

  function notify(aqi, key) {
    if (!prefs.notify || !supported || Notification.permission !== 'granted' || key === lastKey)
      return;
    try {
      new Notification(t('alerts.title', { place: getPlace() }), {
        body: t('alerts.body', { aqi }),
      });
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }

  /** @param {object} env the /api/environment payload */
  function check(env) {
    lastEnv = env;
    const limit = LEVELS[prefs.level];
    const place = getPlace();
    const { current, forecast } = env.air;
    if (current.aqi > limit) {
      const key = `now:${place}:${prefs.level}`;
      show(t('alerts.now', { aqi: current.aqi, place }), key);
      notify(current.aqi, key);
      lastKey = key;
      return;
    }
    const next = (forecast || [])
      .slice(0, 12)
      .find((p) => p.aqi > limit && new Date(p.time) > new Date());
    if (next) {
      const time = new Date(next.time).toLocaleTimeString(
        document.documentElement.lang === 'ta' ? 'ta-IN' : 'en-IN',
        { hour: '2-digit', minute: '2-digit' },
      );
      show(t('alerts.soon', { place, limit, time }), `soon:${place}:${next.time}:${prefs.level}`);
      lastKey = '';
      return;
    }
    lastKey = '';
    hide();
  }

  select.addEventListener('change', () => {
    prefs.level = select.value;
    writeStore(KEY, prefs);
    dismissedKey = '';
    if (lastEnv) check(lastEnv);
  });
  notifyBtn.addEventListener('click', async () => {
    if (!supported) return;
    try {
      const result = await Notification.requestPermission();
      prefs.notify = result === 'granted';
      writeStore(KEY, prefs);
    } catch {
      /* ignore */
    }
    renderState();
    if (lastEnv) check(lastEnv);
  });

  fillSelect();
  renderState();
  return {
    check,
    relabel() {
      fillSelect();
      renderState();
      if (lastEnv) {
        dismissedKey = '';
        check(lastEnv);
      }
    },
  };
}
