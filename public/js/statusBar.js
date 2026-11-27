import { t } from './i18n.js';
import { el } from './ui.js';

const $ = (selector) => document.querySelector(selector);

/** Screen-reader-only announcement (the visible #status bar is for loading and errors). */
export function announce(message) {
  const live = $('#live');
  live.textContent = '';
  window.setTimeout(() => {
    live.textContent = message;
  }, 60);
}

/**
 * Shows (or clears, when `message` is empty) the visible status bar.
 * @param {string} message
 * @param {{isError?: boolean, onRetry?: Function}} [options]
 */
export function setStatus(message, { isError = false, onRetry } = {}) {
  const status = $('#status');
  status.replaceChildren();
  status.classList.toggle('error', isError);
  status.classList.toggle('visible', Boolean(message));
  if (!message) return;
  status.append(document.createTextNode(message));
  if (onRetry) {
    const button = el('button', {
      class: 'btn btn-quiet',
      text: t('retry'),
      attrs: { type: 'button' },
    });
    button.addEventListener('click', onRetry, { once: true });
    status.append(button);
  }
}
