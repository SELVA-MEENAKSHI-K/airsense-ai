import { t } from './i18n.js';
import { writeStore } from './lifestyle.js';
import { announce } from './statusBar.js';

export const SKY_KEY = 'airsense.sky.v1';
export const SKY_MODES = ['auto', 'day', 'night'];

/**
 * Day/night scene controller. In "auto" it follows the chosen place's local time;
 * the person can force day or night with the sky button.
 * @param {{state: object, getSkyline: () => ({setEnvironment: Function}|undefined), button: HTMLElement}} deps
 */
export function createSky({ state, getSkyline, button }) {
  const isDayNow = () => {
    if (state.sky === 'day') return true;
    if (state.sky === 'night') return false;
    return state.env && state.env.weather ? state.env.weather.isDay : null;
  };

  function apply({ announceChange = false } = {}) {
    const day = isDayNow();
    const effective = day === false ? 'night' : 'day';
    const { env } = state;
    document.documentElement.dataset.sky = effective;
    button.dataset.skyMode = state.sky;
    button.dataset.effective = effective;
    const label = t(`sky.${state.sky}`);
    button.setAttribute('aria-label', label);
    button.title = label;
    getSkyline().setEnvironment({
      aqi: env ? env.air.current.aqi : undefined,
      isDay: day,
      windKmh: env && env.weather ? env.weather.windKmh : null,
      windDeg: env && env.weather ? env.weather.windDeg : null,
    });
    if (announceChange) {
      const mode = t(`sky.mode${state.sky[0].toUpperCase()}${state.sky.slice(1)}`);
      announce(t('sky.changed', { mode }));
    }
  }

  function cycle() {
    state.sky = SKY_MODES[(SKY_MODES.indexOf(state.sky) + 1) % SKY_MODES.length];
    writeStore(SKY_KEY, state.sky);
    apply({ announceChange: true });
  }

  return { isDayNow, apply, cycle };
}
