/**
 * Shared lifestyle selector (student, professional, elder, parent) and the helpers that the
 * Planner, Indoor air and Green living pages share. Selection lives in one place so every page
 * stays in sync. Rendering uses textContent only.
 */
import { t } from './i18n.js';
import { el } from './ui.js';

export const LIFESTYLES = ['student', 'professional', 'elder', 'parent'];

/** Render the radio tiles into every [data-lifestyle-host], and report changes. */
export function mountLifestyleSelector({ get, set }) {
  const hosts = [...document.querySelectorAll('[data-lifestyle-host]')];
  let counter = 0;

  function render() {
    for (const host of hosts) {
      counter += 1;
      const name = `lifestyle-${counter}`;
      const group = el(
        'fieldset',
        { class: 'tiles' },
        el('legend', { text: t('lifestyle.label') }),
      );
      for (const key of LIFESTYLES) {
        const input = el('input', { attrs: { type: 'radio', name, value: key } });
        input.checked = get() === key;
        input.addEventListener('change', () => set(key));
        group.append(
          el(
            'label',
            { class: 'tile' },
            input,
            el(
              'span',
              { class: 'tile-body' },
              el('strong', { text: t(`lifestyle.${key}`) }),
              el('small', { text: t(`lifestyle.${key}D`) }),
            ),
          ),
        );
      }
      host.replaceChildren(group);
    }
  }
  render();
  return { render };
}

/** A small stat strip: label above a value. */
export function chip(text, modifier = '') {
  return el('span', { class: `chip ${modifier}`.trim(), text });
}

/** Mark a section busy while it loads. */
export function setBusy(node, busy) {
  node.setAttribute('aria-busy', String(busy));
}

/**
 * The load, render and error handling shared by the Planner, Indoor air and Green living pages.
 * A newer refresh always wins: a slow older response never overwrites a newer one.
 * @param {HTMLElement} out
 * @param {{load: () => Promise<any>, render: (result: any) => void}} handlers
 */
export function createRefresher(out, { load, render }) {
  let seq = 0;
  return {
    async refresh() {
      const mine = (seq += 1);
      setBusy(out, true);
      try {
        const result = await load();
        if (mine === seq) render(result);
      } catch {
        if (mine === seq) {
          out.replaceChildren(el('p', { class: 'message error', text: t('chat.error') }));
        }
      } finally {
        if (mine === seq) setBusy(out, false);
      }
    },
  };
}

/** localStorage helpers that never throw. */
export function readStore(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep working without persistence */
  }
}
