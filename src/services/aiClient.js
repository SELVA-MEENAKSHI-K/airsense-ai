'use strict';

const config = require('../config');
const { fetchJson } = require('../utils/http');
const { AppError } = require('../utils/errors');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const ANTHROPIC_MAX_TOKENS = 1800;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/** @returns {boolean} Whether the selected provider has an API key. */
function isConfigured() {
  const { provider, geminiKey, anthropicKey } = config.ai;
  if (provider === 'anthropic') return Boolean(anthropicKey);
  return Boolean(geminiKey);
}

/**
 * Extract a JSON object from model text, tolerating accidental code fences.
 * @param {string} text
 * @returns {object}
 */
function parseJsonText(text) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new AppError('AI returned no JSON', 502, 'AI_BAD_OUTPUT');
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new AppError('AI returned invalid JSON', 502, 'AI_BAD_OUTPUT');
  }
}

/** Calls Gemini with the system instruction and returns its text.
 * @param {{system: string, user: string}} prompt
 * @returns {Promise<string>} */
async function callGemini({ system, user }) {
  const url = `${GEMINI_BASE}/${encodeURIComponent(config.ai.geminiModel)}:generateContent`;
  const data = await fetchJson(url, {
    method: 'POST',
    timeoutMs: config.ai.timeoutMs,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.ai.geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    }),
  });
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content;
  const text = parts && parts.parts ? parts.parts.map((part) => part.text || '').join('') : '';
  return parseJsonText(text);
}

/** Calls the Anthropic Messages API and returns its text.
 * @param {{system: string, user: string}} prompt
 * @returns {Promise<string>} */
async function callAnthropic({ system, user }) {
  const data = await fetchJson(ANTHROPIC_URL, {
    method: 'POST',
    timeoutMs: config.ai.timeoutMs,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.ai.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.ai.anthropicModel,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      temperature: 0.4,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const text = Array.isArray(data && data.content)
    ? data.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
    : '';
  return parseJsonText(text);
}

/**
 * Ask the configured provider for a JSON object.
 * @param {{system: string, user: string}} prompt
 * @returns {Promise<object>}
 */
async function generateJson(prompt) {
  if (!isConfigured()) throw new AppError('AI provider is not configured', 503, 'AI_DISABLED');
  return config.ai.provider === 'anthropic' ? callAnthropic(prompt) : callGemini(prompt);
}

module.exports = { isConfigured, generateJson, parseJsonText };
