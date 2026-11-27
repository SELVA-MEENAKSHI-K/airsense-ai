/**
 * DOM rendering helpers. All dynamic text goes through textContent, never innerHTML,
 * so API and AI output can never inject markup.
 */
import { t } from './i18n.js';
import { countTo } from './motion.js';
import { el, $, number, SVG_NS } from './dom.js';

export { el };
export { renderCompare } from './uiCompare.js';
export { renderImpact } from './uiImpact.js';

const RING_LENGTH = 2 * Math.PI * 84;

/** Update the big AQI gauge, category and cigarette line. */
export function renderGauge(current) {
  const gauge = $('.gauge');
  gauge.style.setProperty('--aqi-color', current.color);
  const fraction = Math.min(1, current.aqi / 300);
  $('#ring-arc').style.strokeDashoffset = String(RING_LENGTH * (1 - fraction));
  countTo($('#aqi-value'), current.aqi);
  $('#aqi-category').textContent = t(`category.${current.category}`);
  $('#aqi-category').style.setProperty('--aqi-color', current.color);

  const cigarettes = current.pm25 ? current.pm25 / 22 : 0;
  $('#cigarettes').textContent =
    cigarettes >= 0.1 ? t('cigarettes', { n: number(cigarettes, 1) }) : '';
}

export function renderPollutants(current) {
  const list = $('#pollutants');
  list.replaceChildren();
  const rows = [
    ['PM2.5', current.pm25],
    ['PM10', current.pm10],
    ['NO₂', current.no2],
    ['O₃', current.o3],
  ];
  for (const [label, value] of rows) {
    if (value === null || value === undefined) continue;
    list.append(
      el(
        'div',
        { class: 'pollutant' },
        el('dt', { text: label }),
        el('dd', { text: `${number(value, 0)} µg/m³` }),
      ),
    );
  }
}

/** Bar strip for the 24h forecast, with the cleanest daytime hour outlined. */
export function renderForecast(forecast, cleanest) {
  const host = $('#forecast');
  host.replaceChildren();
  $('#best-time').textContent = '';
  if (!forecast.length) return;

  const values = forecast.map((point) => point.aqi);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const top = Math.max(max, 60);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 240 64');
  svg.setAttribute('class', 'forecast-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('forecastAlt', { min, max }));
  svg.setAttribute('preserveAspectRatio', 'none');

  forecast.forEach((point, index) => {
    const height = Math.max(6, (point.aqi / top) * 60);
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(index * 10 + 1));
    rect.setAttribute('y', String(62 - height));
    rect.setAttribute('width', '8');
    rect.setAttribute('height', String(height));
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', point.color);
    if (cleanest && point.time === cleanest.time) {
      rect.setAttribute('stroke', '#FFFFFF');
      rect.setAttribute('stroke-width', '1.5');
    }
    svg.append(rect);
  });
  host.append(svg);

  const ticks = el('div', { class: 'forecast-ticks', attrs: { 'aria-hidden': 'true' } });
  for (const index of [0, 6, 12, 18]) {
    if (forecast[index])
      ticks.append(el('span', { text: String(forecast[index].time).slice(11, 16) }));
  }
  host.append(ticks);

  if (cleanest) {
    $('#best-time').textContent = t('bestTime', {
      hour: String(cleanest.time).slice(11, 16),
      aqi: cleanest.aqi,
    });
  }
}

/** Render the AI (or fallback) plan. */
export function renderAdvice(result, host = '#plan-body') {
  const body = $(host);
  body.replaceChildren();
  const { advice, source } = result;

  body.append(
    el(
      'div',
      { class: 'plan-meta' },
      el('span', { class: `chip risk-${advice.riskLevel}`, text: t(`risk.${advice.riskLevel}`) }),
      el('span', {
        class: `chip source-${source}`,
        text: t({ ai: 'sourceAi', rules: 'sourceRules' }[source] || 'sourceFallback'),
      }),
    ),
    el('p', { class: 'summary', text: advice.summary }),
  );

  if (result.noteIgnored) body.append(el('p', { class: 'hint warn', text: t('noteIgnored') }));

  const routine = renderTimeline(advice.dailyRoutine);
  body.append(el('h3', { class: 'sub', text: t('routineHeading') }), routine);

  const indoor = el('ul', { class: 'tips' });
  for (const item of advice.indoorTips) {
    indoor.append(
      el(
        'li',
        null,
        el('p', { class: 'action', text: item.tip }),
        el('p', { class: 'why', text: item.why }),
      ),
    );
  }
  body.append(el('h3', { class: 'sub', text: t('indoorHeading') }), indoor);

  const swaps = el('ul', { class: 'swaps' });
  for (const item of advice.sustainableAlternatives) {
    swaps.append(
      el(
        'li',
        null,
        el('p', { class: 'action', text: item.swap }),
        el('p', { class: 'why', text: item.why }),
      ),
    );
  }
  body.append(el('h3', { class: 'sub', text: t('swapsHeading') }), swaps);

  body.append(
    el('h3', { class: 'sub', text: t('whyHeading') }),
    el('p', { class: 'explain', text: advice.impactExplanation }),
  );
  if (advice.healthNote) body.append(el('p', { class: 'health', text: advice.healthNote }));
}

/** Show a skeleton line or message in the plan area. */
export function renderPlanMessage(message, { isError = false, onRetry, host = '#plan-body' } = {}) {
  const body = $(host);
  body.replaceChildren(el('p', { class: isError ? 'message error' : 'message', text: message }));
  if (onRetry) {
    body.append(
      el('button', { class: 'btn btn-quiet', text: t('retry'), attrs: { type: 'button' } }),
    );
    body.querySelector('button').addEventListener('click', onRetry, { once: true });
  }
}

/** "Breathing windows": one row per activity with a 24-cell strip and its best slot marked. */
export function renderWindows(windows) {
  const host = $('#windows');
  host.replaceChildren();
  if (!windows || !windows.activities.length) return;

  for (const activity of windows.activities) {
    const label = t(`activity.${activity.key}`);
    const best = activity.window;
    const summary = best
      ? t('windowBest', { start: best.start, end: best.end, aqi: best.avgAqi })
      : t('verdict.closed');

    const strip = renderStrip(activity, windows);

    host.append(
      el(
        'div',
        {
          class: 'window-row',
          attrs: {
            role: 'group',
            'aria-label': `${label}. ${summary}. ${best ? t(`verdict.${best.verdict}`) : ''}`,
          },
        },
        el(
          'div',
          { class: 'window-head' },
          el('span', { class: 'window-label', text: label }),
          el('span', { class: `window-best ${best ? best.verdict : 'avoid'}`, text: summary }),
        ),
        strip,
      ),
    );
  }

  host.append(renderStripTicks(windows));
}

/** One row of hour cells: the verdict for each hour, the best window outlined. */
export function renderStrip(activity, windows) {
  const best = activity.window;
  const strip = el('div', { class: 'strip', attrs: { 'aria-hidden': 'true' } });
  activity.grid.forEach((verdict, index) => {
    const inBest = best && index >= best.index && index < best.index + best.span;
    strip.append(
      el('span', {
        class: `cell ${verdict}${inBest ? ' best' : ''}`,
        attrs: { title: windows.hours[index] },
      }),
    );
  });
  return strip;
}

/** 00:00, 06:00, 12:00, 18:00 labels under a strip. */
export function renderStripTicks(windows) {
  return el(
    'div',
    { class: 'strip-ticks', attrs: { 'aria-hidden': 'true' } },
    ...[0, 6, 12, 18].map((i) => el('span', { text: windows.hours[i] || '' })),
  );
}

/** A "when / what to do / why" list used by the plan and the dashboard advice. */
export function renderTimeline(steps) {
  return el(
    'ol',
    { class: 'timeline' },
    ...steps.map((step) =>
      el(
        'li',
        null,
        el('span', { class: 'when', text: step.when }),
        el(
          'div',
          null,
          el('p', { class: 'action', text: step.action }),
          el('p', { class: 'why', text: step.why }),
        ),
      ),
    ),
  );
}

/** Home page: a grid of live city readings. Each is a link to that city's dashboard. */
export function renderCities(cities, onPick) {
  const list = $('#cities');
  list.replaceChildren();
  for (const city of cities) {
    const button = el(
      'button',
      {
        class: 'city',
        attrs: {
          type: 'button',
          'aria-label': `${city.label || city.name}: ${t('cityAqi', { aqi: city.aqi })}, ${t(`category.${city.category}`)}`,
        },
      },
      el('span', { class: 'city-name', text: city.label || city.name }),
      el('span', { class: 'city-aqi', text: '0' }),
      el('span', { class: 'city-cat', text: t(`category.${city.category}`) }),
    );
    button.style.setProperty('--aqi-color', city.color);
    countTo(button.querySelector('.city-aqi'), city.aqi);
    button.addEventListener('click', () => onPick(city));
    list.append(el('li', null, button));
  }
}

/** Header chip and the home page headline reflect the current place and reading. */
export function renderChip(placeName, current) {
  $('#chip-place').textContent = placeName;
  $('#chip-aqi').textContent = current ? t('cityAqi', { aqi: current.aqi }) : '';
  $('.place-chip').style.setProperty('--aqi-color', current ? current.color : 'var(--muted)');
}

export function renderHomeLive(placeName, current) {
  const orb = $('.orb');
  orb.style.setProperty('--aqi-color', current.color);
  countTo($('#orb-aqi'), current.aqi);
  $('#orb-cat').textContent = t(`category.${current.category}`);
  $('#home-live').textContent = t('home.live', {
    place: placeName,
    aqi: current.aqi,
    category: t(`category.${current.category}`),
  });
}
