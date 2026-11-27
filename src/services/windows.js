'use strict';

const { hourOf, clock } = require('../utils/time');

/**
 * Clean-air windows: when in the next 24 hours is each everyday activity least harmful?
 *
 * Pure and deterministic, built only from the hourly forecast. Each activity has its own
 * allowed hours, length and AQI thresholds (stricter for children). The result drives both the
 * "Breathing windows" strip in the UI and the grounded prompt sent to the language model.
 */

/** @type {ReadonlyArray<{key: string, from: number, to: number, span: number, go: number, caution: number}>} */
const ACTIVITIES = Object.freeze([
  { key: 'exercise', from: 5, to: 21, span: 1, go: 75, caution: 125 },
  { key: 'children', from: 8, to: 19, span: 1, go: 60, caution: 100 },
  { key: 'commute', from: 6, to: 21, span: 2, go: 100, caution: 150 },
  { key: 'ventilate', from: 6, to: 22, span: 1, go: 100, caution: 150 },
  { key: 'laundry', from: 9, to: 17, span: 3, go: 100, caution: 150 },
]);

/**
 * @param {number} aqi
 * @param {{go: number, caution: number}} activity
 * @returns {'go'|'caution'|'avoid'}
 */
function verdictFor(aqi, activity) {
  if (aqi <= activity.go) return 'go';
  if (aqi <= activity.caution) return 'caution';
  return 'avoid';
}

/** Label of the hour that ends a one-hour slot starting at `time`. */
function endOf(time) {
  const next = (hourOf(time) + 1) % 24;
  return `${String(next).padStart(2, '0')}:00`;
}

/**
 * @param {Array<{time: string, aqi: number}>} forecast Hourly points in time order.
 * @returns {{hours: string[], activities: Array<object>}}
 */
function computeWindows(forecast) {
  const points = Array.isArray(forecast) ? forecast : [];

  const activities = ACTIVITIES.map((activity) => {
    const open = points.map((point) => {
      const hour = hourOf(point.time);
      return hour >= activity.from && hour <= activity.to;
    });

    let best = null;
    for (let start = 0; start + activity.span <= points.length; start += 1) {
      const slice = points.slice(start, start + activity.span);
      if (!open.slice(start, start + activity.span).every(Boolean)) continue;
      const avg = slice.reduce((sum, point) => sum + point.aqi, 0) / activity.span;
      if (!best || avg < best.avg) best = { start, avg, slice };
    }

    const window = best && {
      start: clock(best.slice[0].time),
      end: endOf(best.slice[best.slice.length - 1].time),
      avgAqi: Math.round(best.avg),
      verdict: verdictFor(best.avg, activity),
      index: best.start,
      span: activity.span,
    };

    return {
      key: activity.key,
      opensAt: activity.from,
      closesAt: activity.to,
      window,
      grid: points.map((point, index) =>
        open[index] ? verdictFor(point.aqi, activity) : 'closed',
      ),
    };
  });

  return { hours: points.map((point) => clock(point.time)), activities };
}

/**
 * Compact form for the model: only the facts it needs, so it never has to guess timing.
 * @param {{activities: Array<object>}} windows
 * @returns {Record<string, {best: string, avgAqi: number, verdict: string}|null>}
 */
function summarizeForPrompt(windows) {
  const summary = {};
  for (const activity of windows.activities) {
    summary[activity.key] = activity.window
      ? {
          best: `${activity.window.start}-${activity.window.end}`,
          avgAqi: activity.window.avgAqi,
          verdict: activity.window.verdict,
        }
      : null;
  }
  return summary;
}

module.exports = { ACTIVITIES, computeWindows, summarizeForPrompt, verdictFor };
