import { t } from './i18n.js';
import { el, $, number } from './dom.js';

/**
 * "Your plan" against the "AirSense plan": what you do today, what the live air makes worth
 * changing, and what each side means for the air you breathe and the CO2 you emit.
 */
export function renderCompare(data, profile) {
  const host = $('#compare-body');
  if (!data) {
    host.replaceChildren(el('p', { class: 'hint', text: t('planLoadingRules') }));
    return;
  }
  const yesNo = (v) => t(v ? 'wiz.yes' : 'wiz.no');
  const show = {
    commute: (v, mine) =>
      `${t(`modes.${v}`)}${mine && v !== 'wfh' ? `, ${profile.commuteKm} km` : ''}`,
    cooking: (v) => t(`cookings.${v}`),
    purifier: yesNo,
    mask: yesNo,
    peak: yesNo,
  };
  const th = (text, scope = 'col') => el('th', { text, attrs: { scope } });
  const changeChip = (changed) =>
    changed ? el('span', { class: 'chip accent', text: t('cmp.change') }) : null;

  const habitRows = data.rows.map((r) =>
    el(
      'tr',
      { class: r.changed ? 'changed' : '' },
      th(t(`cmp.row.${r.key}`), 'row'),
      el('td', { text: show[r.key](r.yours, true) }),
      el(
        'td',
        null,
        el('span', { text: show[r.key](r.airsense, false) }),
        ' ',
        changeChip(r.changed),
      ),
      el('td', { class: 'why-cell', text: r.why }),
    ),
  );

  const res = data.results;
  const nf = (n, d = 1) => number(n, d);
  const metric = (key, pair, unit, digits) => {
    const diff = pair.airsense - pair.yours;
    const better = diff < -0.0001;
    return el(
      'tr',
      null,
      th(t(`cmp.metric.${key}`), 'row'),
      el('td', { text: `${nf(pair.yours, digits)} ${unit}` }),
      el('td', { text: `${nf(pair.airsense, digits)} ${unit}` }),
      el(
        'td',
        null,
        el('span', {
          class: better ? 'delta good' : 'delta',
          text: better ? `${nf(diff, digits)} ${unit}` : t('cmp.same'),
        }),
      ),
    );
  };
  const metricRows = [
    metric('pm25', res.pm25Exposure, 'µg/m³', 0),
    metric('cigs', res.cigarettesPerDay, t('cmp.cigUnit'), 1),
    metric('co2day', res.co2KgPerDay, 'kg', 1),
    metric('co2year', res.co2KgPerYear, 'kg', 0),
  ];

  const table = (caption, head, rows) =>
    el(
      'div',
      { class: 'table-wrap', attrs: { role: 'region', tabindex: '0', 'aria-label': caption } },
      el(
        'table',
        { class: 'compare' },
        el('caption', { class: 'sr-only', text: caption }),
        el('thead', null, el('tr', null, ...head.map((h) => th(h)))),
        el('tbody', null, ...rows),
      ),
    );

  const summary =
    data.changes === 0
      ? t('cmp.noChanges')
      : t('cmp.summary', {
          n: data.changes,
          cut: number(res.exposureCutPct, 0),
          co2: number(Math.max(0, res.co2KgPerYear.yours - res.co2KgPerYear.airsense), 0),
        });

  host.replaceChildren(
    el('p', { class: 'callout', text: summary }),
    el('h3', { class: 'sub', text: t('cmp.habits') }),
    table(
      t('cmp.habits'),
      [t('cmp.what'), t('cmp.yours'), t('cmp.airsense'), t('cmp.whyCol')],
      habitRows,
    ),
    el('h3', { class: 'sub', text: t('cmp.means') }),
    table(
      t('cmp.means'),
      [t('cmp.what'), t('cmp.yours'), t('cmp.airsense'), t('cmp.diff')],
      metricRows,
    ),
    el('p', { class: 'hint', text: t('cmp.footnote', { aqi: data.aqi }) }),
  );
}
