/**
 * Colourful cursor: a dot that follows the pointer exactly and a ring that trails it.
 * The ring slowly cycles through colours and takes the air-quality colour on hover targets.
 * Only used with a fine pointer (mouse, trackpad). Touch devices, and anyone who prefers reduced
 * motion for the trailing, keep or get a plain, non-animated version. Text fields always keep
 * the normal I-beam so typing never feels odd.
 */

const INTERACTIVE = 'a, button, summary, [role="tab"], [role="option"], select, label, .chip-btn';

/** @param {{reducedMotion: boolean}} options */
export function initCursor({ reducedMotion }) {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!fine || !dot || !ring) return { destroy() {} };

  const root = document.documentElement;
  root.classList.add('has-cursor');
  if (reducedMotion) root.classList.add('cursor-still');

  let x = -100;
  let y = -100;
  let rx = x;
  let ry = y;
  let raf = 0;
  let hue = 170;

  const place = (node, px, py) => {
    node.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)`;
  };

  function frame() {
    rx += (x - rx) * 0.18;
    ry += (y - ry) * 0.18;
    place(ring, rx, ry);
    if (!reducedMotion) {
      hue = (hue + 0.6) % 360;
      root.style.setProperty('--cursor-hue', hue.toFixed(1));
    }
    raf = window.requestAnimationFrame(frame);
  }

  function onMove(event) {
    x = event.clientX;
    y = event.clientY;
    place(dot, x, y);
    if (reducedMotion) {
      rx = x;
      ry = y;
      place(ring, x, y);
    }
    root.classList.add('cursor-on');
    const target = event.target instanceof Element ? event.target : null;
    const text =
      target &&
      target.closest(
        'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea',
      );
    root.classList.toggle('cursor-text', Boolean(text));
    root.classList.toggle('cursor-link', Boolean(target && target.closest(INTERACTIVE)));
  }

  const onDown = () => root.classList.add('cursor-down');
  const onUp = () => root.classList.remove('cursor-down');
  const onLeave = () => root.classList.remove('cursor-on');

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('pointerleave', onLeave);
  if (!reducedMotion) raf = window.requestAnimationFrame(frame);

  return {
    destroy() {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerleave', onLeave);
      root.classList.remove('has-cursor', 'cursor-on', 'cursor-text', 'cursor-link', 'cursor-down');
    },
  };
}
