/**
 * Tiny hash router. Each route is a <section data-view="..."> already in the page; the router
 * shows one, marks the nav link with aria-current, moves focus for keyboard and screen reader
 * users, and keeps the document title in step.
 */

export const ROUTES = Object.freeze({
  '': 'home',
  dashboard: 'dashboard',
  near: 'dashboard',
  planner: 'planner',
  indoor: 'indoor',
  green: 'green',
  assistant: 'assistant',
  lab: 'lab',
  engineering: 'engineering',
  about: 'about',
});

const TITLES = {
  home: 'AirSense AI',
  dashboard: 'Dashboard',
  near: 'Near you',
  planner: 'Daily planner',
  indoor: 'Indoor air',
  green: 'Green living',
  assistant: 'Assistant',
  lab: 'Impact lab',
  engineering: 'Engineering',
  about: 'About',
  notfound: 'Page not found',
};

/** @param {string} hash e.g. "#/dashboard" @returns {string} view name */
export function resolve(hash) {
  const path = String(hash || '')
    .replace(/^#\/?/, '')
    .split(/[?#]/)[0]
    .replace(/\/$/, '');
  return Object.prototype.hasOwnProperty.call(ROUTES, path) ? ROUTES[path] : 'notfound';
}

/**
 * @param {{onChange?: (view: string, previous: string|null) => void}} [options]
 */
export function createRouter({ onChange } = {}) {
  const views = [...document.querySelectorAll('section[data-view]')];
  const links = [...document.querySelectorAll('[data-route]')];
  const nav = document.getElementById('site-nav');
  const toggle = document.getElementById('nav-toggle');
  const main = document.getElementById('main');
  let current = null;

  function setMenu(open) {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  function show(view, { moveFocus }) {
    const previous = current;
    current = view;
    document.body.dataset.view = view;
    for (const section of views) section.hidden = section.dataset.view !== view;
    for (const link of links) {
      if (link.dataset.route === view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.title = view === 'home' ? TITLES.home : `${TITLES[view]} · AirSense AI`;
    setMenu(false);
    window.scrollTo(0, 0);
    if (moveFocus) main.focus({ preventScroll: true });
    if (onChange) onChange(view, previous);
  }

  const go = (moveFocus) => show(resolve(window.location.hash), { moveFocus });

  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('open')) {
      setMenu(false);
      toggle.focus();
    }
  });
  window.addEventListener('hashchange', () => go(true));

  /**
   * Switch to the menu button when the links do not fit on one line. Measuring (rather than
   * guessing a breakpoint) keeps the bar tidy in every language, font and zoom level.
   */
  const header = nav.closest('.nav');
  function fitNav() {
    header.classList.remove('compact');
    setMenu(false);
    if (header.scrollWidth > header.clientWidth + 1 || nav.scrollWidth > nav.clientWidth + 1) {
      header.classList.add('compact');
    }
  }
  window.addEventListener('resize', fitNav);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitNav);
  fitNav();
  go(false);

  return {
    fitNav,
    get view() {
      return current;
    },
    go: (hash) => {
      window.location.hash = hash;
    },
  };
}
