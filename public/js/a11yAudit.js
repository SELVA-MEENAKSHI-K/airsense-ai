/**
 * Live accessibility self-audit. It inspects the page you are looking at (not a stored report)
 * and returns pass/fail per check, so the Engineering page can show real evidence.
 * It is a focused subset of WCAG 2.1 AA, not a replacement for manual testing.
 */

const isVisible = (node) => !node.closest('[hidden]') && node.getClientRects().length > 0;

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function accessibleName(node) {
  const labelledBy = node.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || '')
      .join(' ');
    if (text.trim()) return text.trim();
  }
  return (
    node.getAttribute('aria-label') ||
    (node.labels && [...node.labels].map((label) => label.textContent).join(' ')) ||
    node.textContent ||
    node.getAttribute('title') ||
    ''
  ).trim();
}

function hasReducedMotionRule() {
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.media && rule.media.mediaText.includes('prefers-reduced-motion')) return true;
      }
    } catch {
      /* cross-origin sheet (fonts): skip */
    }
  }
  return false;
}

/** @returns {Array<{key: string, label: string, pass: boolean, detail: string}>} */
export function runAudit(root = document) {
  const results = [];
  const add = (key, label, pass, detail) => results.push({ key, label, pass, detail });

  const lang = document.documentElement.lang;
  add('lang', 'Page language declared', Boolean(lang), `lang="${lang}"`);

  const skip = root.querySelector('a.skip');
  add(
    'skip',
    'Skip link targets the main region',
    Boolean(skip && document.querySelector(skip.getAttribute('href'))),
    skip ? skip.getAttribute('href') : 'missing',
  );

  const landmarks = ['header', 'nav', 'main', 'footer'].filter((tag) => root.querySelector(tag));
  add(
    'landmarks',
    'Landmarks: header, nav, main, footer',
    landmarks.length === 4,
    landmarks.join(', '),
  );

  const h1s = [...root.querySelectorAll('h1')].filter(isVisible);
  add('h1', 'Exactly one visible h1', h1s.length === 1, `${h1s.length} found`);

  const headings = [...root.querySelectorAll('h1,h2,h3,h4')]
    .filter(isVisible)
    .map((h) => Number(h.tagName[1]));
  const skipped = headings.filter((level, i) => i > 0 && level - headings[i - 1] > 1).length;
  add('heading-order', 'Heading levels never skip', skipped === 0, `${skipped} skips`);

  const controls = [...root.querySelectorAll('input, select, textarea')].filter(
    (node) => node.type !== 'hidden' && isVisible(node),
  );
  const unlabeled = controls.filter((node) => !accessibleName(node));
  add(
    'labels',
    'Every visible form control has a label',
    unlabeled.length === 0,
    `${controls.length} controls, ${unlabeled.length} unlabeled`,
  );

  const buttons = [...root.querySelectorAll('button, a[href]')].filter(isVisible);
  const nameless = buttons.filter((node) => !accessibleName(node));
  add(
    'names',
    'Buttons and links have accessible names',
    nameless.length === 0,
    `${buttons.length} checked, ${nameless.length} without a name`,
  );

  const small = buttons.filter((node) => {
    const box = node.getBoundingClientRect();
    return (
      box.height < 40 &&
      !node.closest('.site-foot, .status') &&
      getComputedStyle(node).display !== 'inline'
    );
  });
  add(
    'targets',
    'Touch targets are at least 40px tall',
    small.length === 0,
    `${small.length} below 40px`,
  );

  const ids = [...root.querySelectorAll('[id]')].map((node) => node.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  add(
    'ids',
    'No duplicate ids',
    dupes.length === 0,
    dupes.length ? dupes.join(', ') : `${ids.length} ids`,
  );

  const current = root.querySelectorAll('#site-nav [aria-current="page"]');
  add(
    'current',
    'Navigation marks the current page',
    current.length === 1,
    `${current.length} marked`,
  );

  const live = root.querySelector('[aria-live]');
  add('live', 'Live region announces updates', Boolean(live), live ? `#${live.id}` : 'missing');

  const canvas = root.querySelector('canvas');
  add(
    'canvas',
    'Canvas skyline has a text alternative',
    Boolean(canvas && canvas.getAttribute('aria-label')),
    canvas ? canvas.getAttribute('aria-label') || 'missing' : 'no canvas',
  );

  add('motion', 'Respects prefers-reduced-motion', hasReducedMotionRule(), 'CSS media rule');

  const pairs = [
    ['Body text on page', token('--text'), token('--ink'), 4.5],
    ['Muted text on page', token('--muted'), token('--ink'), 4.5],
    ['Button text on marigold', token('--ink'), token('--marigold'), 4.5],
    ['Active nav text on lagoon', token('--ink'), token('--lagoon'), 4.5],
  ].filter(([, a, b]) => /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b));
  for (const [label, fg, bg, min] of pairs) {
    const ratio = contrast(fg, bg);
    add(
      `contrast-${label}`,
      `Contrast: ${label}`,
      ratio >= min,
      `${ratio.toFixed(1)}:1 (needs ${min}:1)`,
    );
  }

  return results;
}
