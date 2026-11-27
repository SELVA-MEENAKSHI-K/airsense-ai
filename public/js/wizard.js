/**
 * "My plan" setup wizard and plan tabs.
 * Four steps (travel, home, people, review) must be completed before any plan is built.
 * Pure DOM; the page owns the data, this module only moves between steps.
 */
import { t } from './i18n.js';
import { el } from './ui.js';

const STEPS = 4;

/**
 * @param {{onFinish: () => void, onEdit?: () => void, review: () => Array<[string, string]>}} deps
 */
export function mountWizard({ onFinish, onEdit, review }) {
  const form = document.getElementById('profile-form');
  const panels = [...form.querySelectorAll('fieldset.step')];
  const indicator = document.getElementById('wiz-steps');
  const back = document.getElementById('wiz-back');
  const next = document.getElementById('wiz-next');
  const wizard = document.querySelector('.wizard');
  const results = document.getElementById('plan-results');
  const edit = document.getElementById('wiz-edit');
  const km = document.getElementById('commuteKm');
  let step = 1;

  function renderIndicator() {
    indicator.replaceChildren(
      ...panels.map((_, i) => {
        const n = i + 1;
        const item = el(
          'li',
          { class: `step-dot${n === step ? ' current' : ''}${n < step ? ' done' : ''}` },
          el('span', { class: 'step-num', text: n < step ? '✓' : String(n) }),
          el('span', { class: 'step-name', text: t(`wiz.name${n}`) }),
        );
        if (n === step) item.setAttribute('aria-current', 'step');
        return item;
      }),
    );
  }

  function renderReview() {
    document
      .getElementById('wiz-review')
      .replaceChildren(
        ...review().flatMap(([label, value]) => [
          el('dt', { text: label }),
          el('dd', { text: value }),
        ]),
      );
  }

  function valid() {
    if (step !== 1) return true;
    const value = Number.parseFloat(km.value);
    const ok = Number.isFinite(value) && value >= 0 && value <= 100;
    km.setAttribute('aria-invalid', String(!ok));
    if (!ok) {
      km.focus();
      document.getElementById('live').textContent = t('wiz.badKm');
    }
    return ok;
  }

  function show(n, { focus = true } = {}) {
    step = Math.min(STEPS, Math.max(1, n));
    panels.forEach((panel, i) => {
      panel.hidden = i + 1 !== step;
    });
    if (step === STEPS) renderReview();
    back.hidden = step === 1;
    next.textContent = t(step === STEPS ? 'wiz.build' : 'wiz.next');
    renderIndicator();
    if (focus) panels[step - 1].querySelector('legend').focus();
  }

  next.addEventListener('click', () => {
    if (!valid()) return;
    if (step < STEPS) show(step + 1);
    else {
      wizard.hidden = true;
      results.hidden = false;
      results.querySelector('h2').setAttribute('tabindex', '-1');
      results.querySelector('h2').focus();
      onFinish();
    }
  });
  back.addEventListener('click', () => show(step - 1));
  edit.addEventListener('click', () => {
    results.hidden = true;
    wizard.hidden = false;
    show(1);
    if (onEdit) onEdit();
  });

  // Tabs: AirSense (rules) and AI. Arrow keys move between them.
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab, { focus = false } = {}) {
    for (const other of tabs) {
      const on = other === tab;
      other.setAttribute('aria-selected', String(on));
      other.tabIndex = on ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      const dir = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (dir) {
        event.preventDefault();
        selectTab(tabs[(i + dir + tabs.length) % tabs.length], { focus: true });
      }
    });
  });

  show(1, { focus: false });
  return {
    relabel() {
      show(step, { focus: false });
    },
    showTab(name) {
      selectTab(document.getElementById(`tab-${name}`));
    },
    get finished() {
      return !results.hidden;
    },
  };
}
