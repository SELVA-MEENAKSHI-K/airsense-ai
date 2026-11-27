/** Daily planner page: lifestyle-aware day plan, checklist and alert preferences. */
import { api } from './api.js';
import { t } from './i18n.js';
import { el } from './ui.js';
import { chip, readStore, writeStore, createRefresher } from './lifestyle.js';

const PREFS_KEY = 'airsense.planner.v1';
const DEFAULT_PREFS = {
  activities: ['walking'],
  sensitivity: 'normal',
  period: 'morning',
  respiratory: false,
};

/**
 * @param {{getCtx: () => object, onAsk: (topic: string, prompt: string) => void}} deps
 */
export function mountPlanner({ getCtx, onAsk }) {
  const out = document.getElementById('planner-out');
  const form = document.getElementById('planner-form');
  let prefs = { ...DEFAULT_PREFS, ...readStore(PREFS_KEY, {}) };

  function fillSelects() {
    const period = form.elements.period;
    period.replaceChildren(
      ...['morning', 'afternoon', 'evening'].map((k) => {
        const o = el('option', { text: t(`planner.periods.${k}`), attrs: { value: k } });
        return o;
      }),
    );
    const sens = form.elements.sensitivity;
    sens.replaceChildren(
      el('option', { text: t('planner.sensNormal'), attrs: { value: 'normal' } }),
      el('option', { text: t('planner.sensHigh'), attrs: { value: 'high' } }),
    );
  }

  function writeForm() {
    for (const box of form.querySelectorAll('input[name="activities"]')) {
      box.checked = prefs.activities.includes(box.value);
    }
    form.elements.period.value = prefs.period;
    form.elements.sensitivity.value = prefs.sensitivity;
    form.elements.respiratory.checked = prefs.respiratory;
  }

  function readForm() {
    const activities = [...form.querySelectorAll('input[name="activities"]:checked')].map(
      (b) => b.value,
    );
    prefs = {
      activities: activities.length ? activities : ['walking'],
      period: form.elements.period.value,
      sensitivity: form.elements.sensitivity.value,
      respiratory: form.elements.respiratory.checked,
    };
    writeStore(PREFS_KEY, prefs);
  }

  const dayKey = () => `airsense.checklist.${new Date().toISOString().slice(0, 10)}`;

  function renderChecklist(items) {
    const saved = readStore(dayKey(), {});
    const total = items.length;
    const progress = el('p', { class: 'hint' });
    const update = () => {
      const done = items.filter((i) => saved[i.key]).length;
      progress.textContent = t('planner.checklistDone', { done, total });
    };
    const list = el('ul', { class: 'checklist' });
    for (const item of items) {
      const input = el('input', { attrs: { type: 'checkbox' } });
      input.checked = Boolean(saved[item.key]);
      input.addEventListener('change', () => {
        saved[item.key] = input.checked;
        writeStore(dayKey(), saved);
        update();
      });
      list.append(
        el('li', null, el('label', { class: 'check' }, input, el('span', { text: item.text }))),
      );
    }
    update();
    return el(
      'section',
      { class: 'panel' },
      el('h2', { class: 'panel-h', text: t('planner.checklistHeading') }),
      list,
      progress,
    );
  }

  function renderPeriods(plan) {
    const grid = el('div', { class: 'period-grid' });
    for (const period of plan.periods) {
      if (!period.available) continue;
      grid.append(
        el(
          'article',
          { class: `period ${period.mode}${period.preferred ? ' preferred' : ''}` },
          el('h3', { text: period.label }),
          el('p', { class: 'period-mode', text: t(`planner.${period.mode}`) }),
          el('p', {
            class: 'hint',
            text: `${period.range} · ${t('planner.avg', { aqi: period.avgAqi })}`,
          }),
          el('p', { text: t('planner.bestAt', { time: period.bestHour }) }),
          el('p', { class: 'hint', text: period.note }),
          period.preferred ? chip(t('planner.yours'), 'accent') : null,
        ),
      );
    }
    return el(
      'section',
      { class: 'panel' },
      el('h2', { class: 'panel-h', text: t('planner.periodsHeading') }),
      grid,
    );
  }

  function renderActivities(plan) {
    const list = el('ul', { class: 'activity-list' });
    for (const activity of plan.activities) {
      list.append(
        el(
          'li',
          { class: `activity ${activity.mode}` },
          el(
            'div',
            { class: 'activity-head' },
            el('strong', { text: activity.label }),
            chip(t(`planner.${activity.mode}`), activity.mode),
          ),
          el('p', { text: activity.slot ? activity.advice : t('planner.noSlot') }),
        ),
      );
    }
    return el(
      'section',
      { class: 'panel' },
      el('h2', { class: 'panel-h', text: t('planner.activitiesHeading') }),
      list,
    );
  }

  function renderPlan(plan) {
    const head = el(
      'section',
      { class: `panel now ${plan.outdoorNow}` },
      el('p', { class: 'eyebrow', text: t('planner.now') }),
      el('h2', { class: 'now-title', text: t(`planner.${plan.outdoorNow}`) }),
      el('p', { text: plan.alert.text }),
      ...plan.alert.upcoming.map((u) =>
        el('p', { class: 'hint', text: `${t('planner.upcoming')}: ${u.text}` }),
      ),
    );
    const ask = el('button', { class: 'btn btn-primary', type: 'button', text: t('planner.ask') });
    ask.addEventListener('click', () => onAsk('planner', t('planner.askPrompt')));
    const tips = el(
      'section',
      { class: 'panel' },
      el('h2', { class: 'panel-h', text: t('planner.tipsHeading') }),
      el('ul', { class: 'plain-list' }, ...plan.tips.map((tip) => el('li', { text: tip }))),
      ask,
    );
    out.replaceChildren(
      head,
      renderPeriods(plan),
      renderActivities(plan),
      renderChecklist(plan.checklist),
      tips,
    );
  }

  const { refresh } = createRefresher(out, {
    load: async () => {
      const ctx = getCtx();
      const { planner } = await api.planner({
        lat: ctx.lat,
        lon: ctx.lon,
        lang: ctx.lang,
        lifestyle: ctx.lifestyle,
        prefs,
      });
      return planner;
    },
    render: renderPlan,
  });

  fillSelects();
  writeForm();
  form.addEventListener('change', () => {
    readForm();
    refresh();
  });

  return {
    refresh,
    relabel() {
      fillSelects();
      writeForm();
    },
  };
}
