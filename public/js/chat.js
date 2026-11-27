/**
 * Chat drawer. Sends the last few turns to /api/chat, which grounds every answer in live air data.
 * All text is rendered with textContent. Focus moves into the drawer on open and back on close.
 */
import { api } from './api.js';
import { t } from './i18n.js';
import { el } from './ui.js';

const TOPICS = ['general', 'indoor', 'sustainability', 'planner'];
const MAX_TURNS = 8;
const PROVIDERS = { gemini: 'Gemini', anthropic: 'Claude' };

/** @param {{getCtx: () => object}} deps */
export function mountChat({ getCtx }) {
  const fab = document.getElementById('chat-fab');
  const panel = document.getElementById('chat-panel');
  const closeBtn = document.getElementById('chat-close');
  const log = document.getElementById('chat-log');
  const chips = document.getElementById('chat-chips');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const sub = document.getElementById('chat-sub');
  const topicHost = panel.querySelector('.chat-topics');
  const sendBtn = form.querySelector('button[type="submit"]');

  let topic = 'general';
  let history = [];
  let busy = false;
  let welcomed = false;

  function renderTopics() {
    topicHost.replaceChildren(
      ...TOPICS.map((key) => {
        const b = el('button', {
          class: 'topic',
          type: 'button',
          text: t(`chat.topic.${key}`),
          attrs: { 'aria-pressed': String(key === topic) },
        });
        b.addEventListener('click', () => {
          topic = key;
          renderTopics();
        });
        return b;
      }),
    );
  }

  function renderSub() {
    const ctx = getCtx();
    sub.textContent = ctx.air ? t('chat.sub', { place: ctx.place, aqi: ctx.air.aqi }) : ctx.place;
  }

  function scroll() {
    log.scrollTop = log.scrollHeight;
  }

  function addMessage(role, text, meta) {
    const bubble = el(
      'div',
      { class: `msg ${role}` },
      el('span', { class: 'msg-who', text: role === 'user' ? t('chat.you') : t('chat.bot') }),
      el('p', { text }),
    );
    if (meta) bubble.append(meta);
    log.append(bubble);
    scroll();
    return bubble;
  }

  function metaFor(result) {
    const wrap = el('div', { class: 'msg-meta' });
    const who =
      result.source === 'ai'
        ? t('chat.byAi', { provider: PROVIDERS[result.provider] || 'AI' })
        : t('chat.byRules');
    const why =
      result.source === 'fallback' && result.fallbackReason
        ? ` (${t(`chat.why.${result.fallbackReason}`)})`
        : '';
    wrap.append(
      el('span', {
        class: `chip ${result.source === 'ai' ? 'accent' : ''}`.trim(),
        text: who + why,
      }),
    );
    if (result.traceId)
      wrap.append(
        el('a', { class: 'link', text: t('chat.trace'), attrs: { href: '#/engineering' } }),
      );
    return wrap;
  }

  function renderChips(items) {
    chips.replaceChildren(
      ...items.map((text) => {
        const b = el('button', { class: 'chip chip-btn', type: 'button', text });
        b.addEventListener('click', () => send(text));
        return b;
      }),
    );
  }

  function welcome() {
    if (welcomed) return;
    welcomed = true;
    const ctx = getCtx();
    addMessage('assistant', t('chat.welcome', { place: ctx.place }));
  }

  async function send(text) {
    const message = String(text || '')
      .trim()
      .slice(0, 500);
    if (!message || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    chips.replaceChildren();
    welcome();
    addMessage('user', message);
    history.push({ role: 'user', content: message });
    history = history.slice(-MAX_TURNS);
    log.setAttribute('aria-busy', 'true');
    const pending = addMessage('assistant', t('chat.thinking'));
    pending.classList.add('pending');

    const ctx = getCtx();
    try {
      const result = await api.chat({
        lat: ctx.lat,
        lon: ctx.lon,
        locationName: ctx.place,
        lang: ctx.lang,
        topic,
        lifestyle: ctx.lifestyle,
        profile: ctx.profile,
        messages: history,
      });
      pending.remove();
      addMessage('assistant', result.reply, metaFor(result));
      history.push({ role: 'assistant', content: result.reply.slice(0, 500) });
      history = history.slice(-MAX_TURNS);
      renderChips(result.followUps || []);
    } catch {
      pending.remove();
      history.pop();
      addMessage('assistant', t('chat.error'));
    } finally {
      busy = false;
      sendBtn.disabled = false;
      log.setAttribute('aria-busy', 'false');
      input.focus();
    }
  }

  function open(options = {}) {
    if (options.topic && TOPICS.includes(options.topic)) topic = options.topic;
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    document.body.classList.add('chat-open');
    renderTopics();
    renderSub();
    welcome();
    if (options.prompt) send(options.prompt);
    else input.focus();
  }

  function close() {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('chat-open');
    fab.focus();
  }

  fab.addEventListener('click', () => (panel.hidden ? open() : close()));
  closeBtn.addEventListener('click', close);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    send(input.value);
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  return {
    open,
    /** Language or place changed: redraw labels, keep history. */
    relabel() {
      renderTopics();
      renderSub();
    },
    /** A new place makes earlier answers stale. */
    reset() {
      history = [];
      welcomed = false;
      log.replaceChildren();
      chips.replaceChildren();
      if (!panel.hidden) {
        renderSub();
        welcome();
      }
    },
  };
}
