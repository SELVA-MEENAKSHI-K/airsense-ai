/**
 * Type-ahead place search (ARIA combobox). Suggestions appear while typing, after a short pause,
 * using the same /api/geocode endpoint as the header search. Only the newest request is shown.
 */
import { api } from './api.js';
import { t } from './i18n.js';
import { el } from './ui.js';

const MIN_CHARS = 2;
const PAUSE_MS = 250;

/**
 * @param {{input: HTMLInputElement, list: HTMLElement, status?: HTMLElement,
 *          onPick: (place: object) => void}} options
 */
export function createPlaceSearch({
  input,
  list,
  status,
  onPick,
  getLang = () => 'en',
  getCountry = () => undefined,
}) {
  let timer = null;
  let seq = 0;
  let places = [];
  let active = -1;

  const say = (text) => {
    if (status) status.textContent = text;
  };

  function close() {
    list.hidden = true;
    list.replaceChildren();
    places = [];
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function highlight(index) {
    active = index;
    [...list.children].forEach((item, i) => {
      const on = i === index;
      item.setAttribute('aria-selected', String(on));
      item.classList.toggle('active', on);
      if (on) input.setAttribute('aria-activedescendant', item.id);
    });
    if (index < 0) input.removeAttribute('aria-activedescendant');
  }

  function choose(place) {
    input.value = '';
    close();
    say('');
    onPick(place);
  }

  function render(found) {
    places = found;
    list.replaceChildren(
      ...found.map((place, i) => {
        const item = el('li', {
          class: 'suggest-item',
          text: getLang() === 'ta' && place.labelTa ? place.labelTa : place.label,
          attrs: { role: 'option', id: `${list.id}-${i}`, 'aria-selected': 'false' },
        });
        // mousedown fires before the input loses focus, so the pick is not lost.
        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
          choose(place);
        });
        return item;
      }),
    );
    list.hidden = found.length === 0;
    input.setAttribute('aria-expanded', String(found.length > 0));
    say(found.length ? t('search.count', { n: found.length }) : t('search.none'));
  }

  async function lookup(query) {
    const mine = (seq += 1);
    say(t('search.searching'));
    try {
      const { places: found } = await api.geocode(query, getCountry());
      if (mine === seq) render(found);
    } catch {
      if (mine === seq) {
        close();
        say(t('search.error'));
      }
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const query = input.value.trim();
    seq += 1; // a newer keystroke makes any request in flight stale
    if (query.length < MIN_CHARS) {
      close();
      say('');
      return;
    }
    timer = setTimeout(() => lookup(query), PAUSE_MS);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && places.length) {
      event.preventDefault();
      highlight((active + 1) % places.length);
    } else if (event.key === 'ArrowUp' && places.length) {
      event.preventDefault();
      highlight((active - 1 + places.length) % places.length);
    } else if (event.key === 'Escape' && !list.hidden) {
      event.stopPropagation();
      close();
    } else if (event.key === 'Enter' && active >= 0 && places[active]) {
      event.preventDefault();
      choose(places[active]);
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));

  return {
    /** Enter pressed with nothing highlighted: search now and take the best match. */
    async submit() {
      clearTimeout(timer);
      const query = input.value.trim();
      if (query.length < MIN_CHARS) return;
      if (places.length) return choose(places[0]);
      const mine = (seq += 1);
      say(t('search.searching'));
      try {
        const { places: found } = await api.geocode(query, getCountry());
        if (mine !== seq) return;
        if (found.length) choose(found[0]);
        else say(t('search.none'));
      } catch {
        say(t('search.error'));
      }
    },
    close,
  };
}
