/** Indoor air page: live ventilation verdict, first actions, tips and honest plant advice. */
import { api } from './api.js';
import { t } from './i18n.js';
import { el, renderStrip, renderStripTicks } from './ui.js';
import { chip, createRefresher } from './lifestyle.js';

function ventilationStrip(windows) {
  const activity = windows && windows.activities.find((a) => a.key === 'ventilate');
  if (!activity) return null;
  return el(
    'div',
    { class: 'strip-wrap', attrs: { role: 'img', 'aria-label': t('indoor.stripLabel') } },
    renderStrip(activity, windows),
    renderStripTicks(windows),
  );
}

/** @param {{getCtx: () => object, onAsk: (topic: string, prompt: string) => void}} deps */
export function mountIndoor({ getCtx, onAsk }) {
  const out = document.getElementById('indoor-out');

  function render(indoor, ctx) {
    const v = indoor.ventilation;
    const hero = el(
      'section',
      { class: `panel vent ${v.status}` },
      el('p', { class: 'eyebrow', text: t('indoor.ventNow') }),
      el('h2', { class: 'now-title', text: v.label }),
      el('p', { text: v.text }),
      v.bestSlot
        ? el('p', { class: 'hint', text: t('indoor.bestSlot', { slot: v.bestSlot }) })
        : null,
      ventilationStrip(ctx.windows),
      el('p', { class: 'hint', text: v.night }),
    );

    const ask = el('button', { class: 'btn btn-primary', type: 'button', text: t('indoor.ask') });
    ask.addEventListener('click', () => onAsk('indoor', t('indoor.askPrompt')));
    const priorities = el(
      'section',
      { class: 'panel' },
      el('h2', { class: 'panel-h', text: t('indoor.priorities') }),
      el(
        'ol',
        { class: 'plain-list numbered' },
        ...indoor.priorities.map((p) => el('li', { text: p })),
      ),
      ask,
    );

    const sections = indoor.sections.map((section) =>
      el(
        'section',
        { class: 'panel' },
        el('h2', { class: 'panel-h', text: section.title }),
        el(
          'ul',
          { class: 'tip-list' },
          ...section.items.map((item) =>
            el(
              'li',
              { class: 'tip' },
              el(
                'div',
                { class: 'tip-head' },
                el('strong', { text: item.title }),
                chip(t(`indoor.cost.${item.cost}`), `cost-${item.cost}`),
              ),
              el('p', { text: item.body }),
            ),
          ),
        ),
      ),
    );

    const plants = el(
      'section',
      { class: 'panel' },
      el('h2', { class: 'panel-h', text: t('indoor.plants') }),
      el('p', { class: 'callout', text: indoor.plants.honest }),
      el(
        'ul',
        { class: 'plant-grid' },
        ...indoor.plants.items.map((p) =>
          el(
            'li',
            { class: 'plant' },
            el('strong', { text: p.name }),
            el('p', { text: p.note }),
            el('p', { class: 'hint', text: p.caution }),
          ),
        ),
      ),
    );

    out.replaceChildren(
      hero,
      priorities,
      el('div', { class: 'two-col two-col--even' }, ...sections),
      plants,
    );
  }

  const { refresh } = createRefresher(out, {
    load: async () => {
      const ctx = getCtx();
      const { indoor } = await api.indoor(ctx.lat, ctx.lon, ctx.lang);
      return { indoor, ctx };
    },
    render: ({ indoor, ctx }) => render(indoor, ctx),
  });
  return { refresh };
}
