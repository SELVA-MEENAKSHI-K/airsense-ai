/**
 * Motion layer: pointer tilt with a light glare, staggered scroll reveals and number count-ups.
 * Everything here is decoration. With reduced motion it does nothing and content just appears.
 */

const TILT_SELECTOR = '.city, .module, .score, .how li, .home-card, .orb';
const REVEAL_SELECTOR =
  '.panel, .city, .module, .score, .how li, .window-row, .pipe-step, .site-foot';

/** @param {{reducedMotion: boolean}} options */
export function initMotion({ reducedMotion }) {
  if (reducedMotion || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('motion');

  /* ----- reveal on scroll, staggered ----- */
  const seen = new WeakSet();
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.08, rootMargin: '0px 0px -6% 0px' },
  );
  const watch = (root) => {
    const nodes = root.matches?.(REVEAL_SELECTOR) ? [root] : [];
    nodes.push(...root.querySelectorAll(REVEAL_SELECTOR));
    nodes.forEach((node, index) => {
      if (seen.has(node)) return;
      seen.add(node);
      node.classList.add('reveal');
      node.style.setProperty('--i', String(index % 8));
      io.observe(node);
    });
  };
  watch(document.getElementById('main'));
  watch(document.querySelector('.site-foot'));
  new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === 1) watch(node);
      });
    }
  }).observe(document.getElementById('main'), { childList: true, subtree: true });

  /* ----- pointer tilt with glare ----- */
  let frame = 0;
  let active = null;
  const reset = (node) => {
    node.style.setProperty('--rx', '0deg');
    node.style.setProperty('--ry', '0deg');
    node.classList.remove('tilting');
  };
  document.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return;
      const node = event.target.closest?.(TILT_SELECTOR);
      if (active && active !== node) reset(active);
      active = node || null;
      if (!node || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = node.getBoundingClientRect();
        const px = (event.clientX - box.left) / box.width;
        const py = (event.clientY - box.top) / box.height;
        const max = node.matches('.home-card') ? 3 : 9;
        node.style.setProperty('--ry', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
        node.style.setProperty('--rx', `${((0.5 - py) * 2 * max).toFixed(2)}deg`);
        node.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
        node.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
        node.classList.add('tilting');
      });
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => active && reset(active), true);
}

/**
 * Count a number up (or down) to its new value. Falls back to a plain set.
 * @param {HTMLElement} node
 * @param {number} to
 */
export function countTo(node, to) {
  const reduced = !document.documentElement.classList.contains('motion');
  const from = Number.parseInt(node.textContent, 10);
  if (reduced || !Number.isFinite(from) || from === to) {
    node.textContent = String(to);
    return;
  }
  const start = performance.now();
  const span = 700;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / span);
    const eased = 1 - (1 - t) ** 3;
    node.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
