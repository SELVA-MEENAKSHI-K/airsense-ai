'use strict';

/**
 * Prompt-injection guard for the only free-text inputs we accept
 * (a place name and a short optional note). Everything else is a validated enum or number.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const NAME_DISALLOWED = /[^\p{L}\p{M}\p{N} ,.'’()-]/gu;

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)/i,
  /disregard\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|instructions)/i,
  /(system|developer)\s*(prompt|message|instruction)/i,
  /you\s+are\s+now\b/i,
  /act\s+as\b/i,
  /reveal\s+(your|the)\s+(prompt|instructions|rules)/i,
  /<\/?\s*(system|assistant|user|untrusted|script)/i,
  /```/,
  /\bjailbreak\b/i,
];

/**
 * @param {string|undefined|null} value
 * @returns {string}
 */
function collapse(value) {
  return String(value ?? '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Keep only characters that can appear in a place name.
 * @param {string|undefined|null} value
 * @returns {string}
 */
function sanitizeName(value) {
  return collapse(value).replace(NAME_DISALLOWED, '').slice(0, 80).trim();
}

/**
 * Detect common instruction-hijacking phrases.
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeInjection(text) {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Clean a free-text note. Suspicious notes are dropped instead of forwarded to the model.
 * @param {string|undefined|null} value
 * @returns {{value: string, flagged: boolean}}
 */
function sanitizeNote(value) {
  const cleaned = collapse(value).slice(0, 200);
  if (!cleaned) return { value: '', flagged: false };
  if (looksLikeInjection(cleaned)) return { value: '', flagged: true };
  return { value: cleaned.replace(/[<>{}[\]`]/g, ''), flagged: false };
}

module.exports = { collapse, sanitizeName, sanitizeNote, looksLikeInjection };
