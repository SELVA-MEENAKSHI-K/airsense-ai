import { t } from './i18n.js';
import { el, $, number, SVG_NS } from './dom.js';

/**
 * Your estimated PM2.5 exposure for each of the next 24 hours, now versus with your changes.
 * Each hour's forecast PM2.5 is scaled by your personal exposure ratio (average exposure divided
 * by the current ambient PM2.5), so the shape comes from the live forecast.
 */
function renderHourly(impact, forecast, currentPm25) {
  const points = forecast.filter((p) => Number.isFinite(p.pm25));
  if (!points.length || !(currentPm25 > 0)) return el('div');
  const nowRatio = impact.baseline.avgPm25 / currentPm25;
  const withRatio = impact.scenario.avgPm25 / currentPm25;
  const now = points.map((p) => p.pm25 * nowRatio);
  const withChanges = points.map((p) => p.pm25 * withRatio);
  const top = Math.max(...now, 1);
  const width = 10;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${points.length * width} 70`);
  svg.setAttribute('class', 'hourly-svg');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  const peak = now.indexOf(Math.max(...now));
  svg.setAttribute(
    'aria-label',
    t('hourlyAlt', {
      peak: String(points[peak].time).slice(11, 16),
      a: number(now[peak], 0),
      b: number(withChanges[peak], 0),
    }),
  );
  const bar = (value, x, cls) => {
    const h = Math.max(1, (value / top) * 66);
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(68 - h));
    rect.setAttribute('width', '4');
    rect.setAttribute('height', String(h));
    rect.setAttribute('rx', '1.5');
    rect.setAttribute('class', cls);
    return rect;
  };
  points.forEach((_, i) => {
    svg.append(bar(now[i], i * width, 'h-now'), bar(withChanges[i], i * width + 4.5, 'h-with'));
  });
  const ticks = el('div', { class: 'forecast-ticks', attrs: { 'aria-hidden': 'true' } });
  for (const index of [0, 6, 12, 18]) {
    if (points[index]) ticks.append(el('span', { text: String(points[index].time).slice(11, 16) }));
  }
  return el(
    'div',
    { class: 'hourly' },
    el('h3', { class: 'sub', text: t('hourlyHeading') }),
    svg,
    ticks,
    el(
      'p',
      { class: 'hint' },
      el('span', { class: 'key now' }),
      document.createTextNode(` ${t('compareNow')}   `),
      el('span', { class: 'key with' }),
      document.createTextNode(` ${t('compareWith')}`),
    ),
    el('p', { class: 'hint', text: t('hourlyNote') }),
  );
}

/** Impact numbers and before/after bars. */
export function renderImpact(impact, profile, forecast = [], currentPm25 = 0) {
  const host = $('#impact');
  host.replaceChildren();
  host.classList.remove('flash');
  void host.offsetWidth; // restart the highlight animation
  host.classList.add('flash');
  const { savings, baseline, scenario, community } = impact;
  host.append(renderToday(impact, profile));
  const worse = savings.co2KgPerDay < -0.005;

  const stat = (label, value, unit) =>
    el(
      'div',
      { class: 'stat' },
      el('dt', { class: 'stat-label', text: label }),
      el(
        'dd',
        { class: 'stat-value' },
        document.createTextNode(value),
        unit ? el('span', { class: 'stat-unit', text: ` ${unit}` }) : null,
      ),
    );

  const co2Text = `${worse ? '+' : ''}${number(Math.abs(savings.co2KgPerDay), 1)}`;
  host.append(
    el(
      'dl',
      { class: 'stats' },
      stat(t('resultCo2'), worse ? co2Text : number(savings.co2KgPerDay, 1), t('unitKg')),
      stat(t('resultExposure'), `${number(Math.max(0, savings.exposureCutPct), 0)}%`, ''),
      stat(t('resultCigarettes'), number(Math.max(0, savings.cigarettesAvoidedPerDay), 1), ''),
      stat(t('resultTrees'), number(Math.max(0, savings.treesEquivalent), 1), ''),
    ),
  );

  const scale = Math.max(baseline.avgPm25, scenario.avgPm25, 1);
  const bar = (label, value, modifier) => {
    const fill = el('span', { class: `bar-fill ${modifier}` });
    fill.style.width = `${Math.max(2, (value / scale) * 100)}%`;
    return el(
      'div',
      { class: 'compare-row' },
      el('span', { class: 'compare-label', text: label }),
      el('span', { class: 'bar-track' }, fill),
      el('span', { class: 'compare-value', text: `${number(value, 0)} µg/m³` }),
    );
  };
  host.append(
    el(
      'div',
      { class: 'compare', attrs: { role: 'group', 'aria-label': t('compareHeading') } },
      el('h3', { class: 'sub', text: t('compareHeading') }),
      bar(t('compareNow'), baseline.avgPm25, 'now'),
      bar(t('compareWith'), scenario.avgPm25, 'with'),
    ),
  );

  host.append(
    renderHourly(impact, forecast, currentPm25),
    renderBreakdown(impact),
    renderModes(impact),
  );

  if (worse) {
    host.append(
      el('p', {
        class: 'impact-line warn',
        text: t('worseLine', { kg: number(Math.abs(savings.co2KgPerDay), 1) }),
      }),
    );
  } else if (community.co2TonnesPerYear > 0 && community.households > 1) {
    host.append(
      el('p', {
        class: 'impact-line',
        text: t('communityLine', {
          households: number(community.households, 0),
          tonnes: number(community.co2TonnesPerYear, 1),
        }),
      }),
    );
  }

  host.append(el('p', { class: 'hint', text: t('hazeNote') }));

  const details = el(
    'details',
    { class: 'assumptions' },
    el('summary', { text: t('assumptionsHeading') }),
  );
  const list = el('ul');
  impact.assumptions.forEach((item, i) => list.append(el('li', { text: t(`assume.${i}`) })));
  details.append(list);
  host.append(details);
}

/** Live baseline: what today's air and this person's routine add up to, before any change. */
function renderToday(impact, profile) {
  const { baseline, inputs } = impact;
  return el(
    'div',
    { class: 'today' },
    el('h3', { class: 'sub', text: t('labToday') }),
    el('p', {
      text: t('labTodayLine', {
        pm25: number(inputs.pm25, 0),
        avg: number(baseline.avgPm25, 0),
        cig: number(baseline.cigarettesPerDay, 1),
        co2: number(baseline.co2KgPerDay * 250, 0),
      }),
    }),
    profile
      ? el('p', {
          class: 'hint',
          text: t('labBasis', {
            mode: t(`modes.${profile.commuteMode}`),
            km: profile.commuteKm,
            fuel: t(`cookings.${profile.cooking}`),
          }),
        })
      : null,
  );
}

/** Each choice valued alone, so the person sees which one matters most. */
function renderBreakdown(impact) {
  const list = el('ul', { class: 'breakdown' });
  const top = Math.max(1, ...impact.breakdown.map((b) => b.exposureCutPct));
  const ranked = [...impact.breakdown].sort((a, b) => b.exposureCutPct - a.exposureCutPct);
  for (const item of ranked) {
    const fill = el('span', { class: 'bar-fill with' });
    fill.style.width = `${Math.max(3, (item.exposureCutPct / top) * 100)}%`;
    list.append(
      el(
        'li',
        { class: `break-row${item.active ? ' on' : ''}` },
        el(
          'div',
          { class: 'break-head' },
          el('strong', { text: t(`choiceNames.${item.key}`) }),
          el('span', { class: 'badge', text: item.active ? t('breakdownOn') : t('breakdownOff') }),
        ),
        el('span', { class: 'bar-track' }, fill),
        el('p', {
          class: 'hint',
          text:
            t('breakdownLine', {
              pct: number(item.exposureCutPct, 0),
              cig: number(item.cigarettesPerDay, 1),
            }) +
            (item.co2KgPerDay > 0
              ? ` · ${t('breakdownCo2', { kg: number(item.co2KgPerDay, 1) })}`
              : ''),
        }),
      ),
    );
  }
  return el(
    'div',
    { class: 'breakdown-wrap' },
    el('h3', { class: 'sub', text: t('breakdownHeading') }),
    list,
  );
}

/** Every travel mode compared at this distance and today's PM2.5. */
function renderModes(impact) {
  const col = (key) => t(`modesCol.${key}`);
  const head = el(
    'tr',
    null,
    ...['mode', 'co2', 'pm', 'min'].map((k) => el('th', { text: col(k), attrs: { scope: 'col' } })),
  );
  const rows = [...impact.modes]
    .sort((a, b) => a.co2KgPerYear + a.avgPm25 - (b.co2KgPerYear + b.avgPm25))
    .map((m) =>
      el(
        'tr',
        { class: m.current ? 'current' : '' },
        el(
          'th',
          { attrs: { scope: 'row' } },
          document.createTextNode(t(`modes.${m.mode}`)),
          m.current ? el('span', { class: 'badge', text: t('modesYou') }) : null,
        ),
        el('td', { text: `${number(m.co2KgPerYear, 0)} ${t('unitKgYear')}` }),
        el('td', { text: `${number(m.avgPm25, 0)} µg/m³` }),
        el('td', { text: number(m.minutesPerDay, 0) }),
      ),
    );
  return el(
    'div',
    { class: 'modes-wrap' },
    el('h3', { class: 'sub', text: t('modesHeading') }),
    el(
      'div',
      { class: 'table-wrap' },
      el('table', { class: 'table' }, el('thead', null, head), el('tbody', null, ...rows)),
    ),
  );
}
