/**
 * Dashboard "for your place" module: type-ahead place search, quick picks, location permission,
 * safer outdoor activities, advice for children, older adults and sensitive people, and a
 * Gemini-written personalised plan (via /api/advice). Everything is driven by the live AQI.
 */
import { api } from './api.js';
import { t } from './i18n.js';
import { el, renderTimeline } from './ui.js';
import { chip, readStore, writeStore, setBusy } from './lifestyle.js';
import { createPlaceSearch } from './placeSearch.js';

const KEY = 'airsense.groups.v1';
const GROUPS = ['children', 'elderly', 'sensitive'];
const VULNERABLE = { children: 'children', elderly: 'elderly', sensitive: 'respiratory' };

/**
 * @param {{getCtx: () => object, cities: object[], onPick: (place: object) => void, onLocate: () => void}} deps
 */
export function mountLocal({ getCtx, cities, onPick, onLocate }) {
  const activitiesHost = document.getElementById('local-activities');
  const groupsHost = document.getElementById('local-groups');
  const aiButton = document.getElementById('near-ai-btn');
  const aiBox = document.getElementById('near-ai-out');
  const form = document.getElementById('dash-search');
  const input = document.getElementById('dash-q');
  const message = document.getElementById('dash-msg');
  const cityHost = document.getElementById('dash-cities');
  const groupBoxes = [...document.querySelectorAll('#near-groups input[name="groups"]')];
  let groups = readStore(KEY, []).filter((g) => GROUPS.includes(g));
  let seq = 0;
  let aiSeq = 0;

  const search = createPlaceSearch({
    input,
    list: document.getElementById('dash-suggest'),
    status: message,
    getLang: () => getCtx().lang,
    onPick,
  });

  function renderCities() {
    cityHost.replaceChildren(
      ...cities.map((city) => {
        const b = el('button', {
          class: 'chip chip-btn',
          type: 'button',
          text: getCtx().lang === 'ta' ? city.ta : city.name,
        });
        b.addEventListener('click', () =>
          onPick({
            name: city.name,
            label: `${city.name}, India`,
            labelTa: `${city.ta}, இந்தியா`,
            lat: city.lat,
            lon: city.lon,
          }),
        );
        return b;
      }),
    );
  }

  function groupCard(card) {
    return el(
      'section',
      { class: `panel group ${card.level}${card.selected ? ' selected' : ''}` },
      el(
        'div',
        { class: 'activity-head' },
        el('h3', { class: 'panel-h', text: card.title }),
        chip(card.label, `lvl-${card.level}`),
      ),
      el('p', { class: 'hint', text: card.who }),
      el('ul', { class: 'plain-list' }, ...card.do.map((x) => el('li', { text: x }))),
      card.avoid.length
        ? el(
            'p',
            { class: 'avoid' },
            el('strong', { text: `${t('near.avoid')}: ` }),
            document.createTextNode(card.avoid.join('; ')),
          )
        : null,
      card.selected ? chip(t('near.yours'), 'accent') : null,
    );
  }

  function renderAi(result) {
    const { advice } = result;
    aiBox.replaceChildren(
      ...[
        el(
          'div',
          { class: 'msg-meta' },
          chip(t(`risk.${advice.riskLevel}`), `risk-${advice.riskLevel}`),
          chip(
            result.source === 'ai' ? t('near.by') : t('near.byRules'),
            result.source === 'ai' ? 'accent' : '',
          ),
          result.traceId
            ? el('a', { class: 'link', text: t('near.trace'), attrs: { href: '#/engineering' } })
            : null,
        ),
        el('p', { class: 'summary', text: advice.summary }),
        advice.healthNote ? el('p', { class: 'callout', text: advice.healthNote }) : null,
        renderTimeline(advice.dailyRoutine),
      ].filter(Boolean),
    );
  }

  async function askAi() {
    const ctx = getCtx();
    const mine = (aiSeq += 1);
    aiButton.disabled = true;
    aiBox.setAttribute('aria-busy', 'true');
    aiBox.replaceChildren(el('p', { class: 'hint', text: t('near.aiBusy') }));
    try {
      const result = await api.advice({
        lat: ctx.lat,
        lon: ctx.lon,
        locationName: ctx.place,
        lang: ctx.lang,
        profile: { ...ctx.profile, vulnerable: groups.map((g) => VULNERABLE[g]) },
      });
      if (mine === aiSeq) renderAi(result);
    } catch {
      if (mine === aiSeq)
        aiBox.replaceChildren(el('p', { class: 'message error', text: t('near.aiFail') }));
    } finally {
      if (mine === aiSeq) {
        aiButton.disabled = false;
        aiBox.setAttribute('aria-busy', 'false');
      }
    }
  }

  function render(local) {
    activitiesHost.replaceChildren(
      ...[
        el('p', { class: `now-title lvl-text ${local.level}`, text: local.headline }),
        local.bestHourNote ? el('p', { class: 'hint', text: local.bestHourNote }) : null,
        local.strict ? el('p', { class: 'hint', text: t('near.stricter') }) : null,
      ].filter(Boolean),
      el(
        'ul',
        { class: 'activity-list' },
        ...local.activities.map((a) =>
          el(
            'li',
            { class: 'activity' },
            el(
              'div',
              { class: 'activity-head' },
              el('strong', { text: a.label }),
              chip(t(`near.status.${a.status}`), `st-${a.status}`),
            ),
            el('p', { text: a.note }),
          ),
        ),
      ),
    );
    groupsHost.replaceChildren(
      el('div', { class: 'two-col two-col--even' }, ...local.cards.map(groupCard)),
    );
  }

  async function refresh() {
    const ctx = getCtx();
    const mine = (seq += 1);
    setBusy(activitiesHost, true);
    aiBox.replaceChildren(); // an AI plan belongs to the place and groups it was made for
    try {
      const { local } = await api.local(ctx.lat, ctx.lon, ctx.lang, ctx.place, groups);
      if (mine === seq) render(local);
    } catch {
      if (mine === seq)
        activitiesHost.replaceChildren(el('p', { class: 'message error', text: t('chat.error') }));
    } finally {
      if (mine === seq) setBusy(activitiesHost, false);
    }
  }

  for (const box of groupBoxes) {
    box.checked = groups.includes(box.value);
    box.addEventListener('change', () => {
      groups = groupBoxes.filter((b) => b.checked).map((b) => b.value);
      writeStore(KEY, groups);
      refresh();
    });
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    search.submit();
  });
  document.getElementById('dash-locate').addEventListener('click', onLocate);
  aiButton.addEventListener('click', askAi);
  renderCities();

  return { refresh, relabel: renderCities };
}
