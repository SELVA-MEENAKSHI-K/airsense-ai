/** Green living page: lifestyle-ordered swaps with computed impact, and a weekly challenge. */
import { api } from './api.js';
import { t } from './i18n.js';
import { el } from './ui.js';
import { chip, readStore, writeStore, createRefresher } from './lifestyle.js';

const KEY = 'airsense.challenge.v1';
const nf = (n) =>
  Number(n).toLocaleString(document.documentElement.lang === 'ta' ? 'ta-IN' : 'en-IN');

/** @param {{getCtx: () => object, onAsk: (topic: string, prompt: string) => void}} deps */
export function mountGreen({ getCtx, onAsk }) {
  const out = document.getElementById('green-out');

  function renderAction(action) {
    const impact = action.impact;
    return el(
      'li',
      { class: 'action' },
      el('h3', { text: action.title }),
      el('p', { text: action.body }),
      impact.kgCo2PerYear !== null
        ? el(
            'p',
            { class: 'impact-figure' },
            el('strong', { text: t('green.perYear', { kg: nf(impact.kgCo2PerYear) }) }),
            chip(t('green.approx'), 'accent'),
          )
        : el('p', { class: 'hint', text: t('green.noFigure') }),
      el('p', { class: 'hint', text: impact.basis }),
      action.gate ? el('p', { class: `gate ${action.gate.status}`, text: action.gate.text }) : null,
    );
  }

  function renderChallenge(challenge) {
    const saved = readStore(KEY, {});
    const done = new Set(saved.week === challenge.weekId ? saved.done : []);
    const bar = el('span', { class: 'bar-fill with' });
    const track = el('span', { class: 'bar-track' }, bar);
    const label = el('p', { class: 'hint', attrs: { role: 'status' } });
    const update = () => {
      const count = challenge.tasks.filter((task) => done.has(task.id)).length;
      bar.style.width = `${(count / challenge.tasks.length) * 100}%`;
      label.textContent = t('green.progress', { done: count, total: challenge.tasks.length });
    };
    const list = el('ul', { class: 'checklist' });
    for (const task of challenge.tasks) {
      const input = el('input', { attrs: { type: 'checkbox' } });
      input.checked = done.has(task.id);
      input.addEventListener('change', () => {
        if (input.checked) done.add(task.id);
        else done.delete(task.id);
        writeStore(KEY, { week: challenge.weekId, done: [...done] });
        update();
      });
      list.append(
        el(
          'li',
          null,
          el(
            'label',
            { class: 'check' },
            input,
            el('span', {
              text: task.impactKgCo2
                ? `${task.text} ${t('green.impactTask', { kg: task.impactKgCo2 })}`
                : task.text,
            }),
          ),
        ),
      );
    }
    update();
    return el(
      'section',
      { class: 'panel challenge' },
      el('p', { class: 'eyebrow', text: `${t('green.challengeHeading')} · ${challenge.weekId}` }),
      el('h2', { class: 'now-title', text: challenge.title }),
      list,
      track,
      label,
    );
  }

  function render(data) {
    const ask = el('button', { class: 'btn btn-primary', type: 'button', text: t('green.ask') });
    ask.addEventListener('click', () => onAsk('sustainability', t('green.askPrompt')));
    out.replaceChildren(
      renderChallenge(data.challenge),
      el(
        'section',
        { class: 'panel' },
        el('h2', { class: 'panel-h', text: t('green.actionsHeading') }),
        el('ul', { class: 'action-grid' }, ...data.actions.map(renderAction)),
        el('p', {
          class: 'hint',
          text: t('green.assumes', { km: data.assumedCommuteKm, grid: data.gridKgPerKwh }),
        }),
        ask,
      ),
    );
  }

  const { refresh } = createRefresher(out, {
    load: async () => {
      const ctx = getCtx();
      const { sustainability } = await api.sustainability(
        ctx.lat,
        ctx.lon,
        ctx.lang,
        ctx.lifestyle,
      );
      return sustainability;
    },
    render,
  });
  return { refresh };
}
