'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const aiClient = require('./aiClient');
const { telemetry } = require('./telemetry');
const {
  SYSTEM_INSTRUCTION,
  INSTRUCTION_SHA,
  INSTRUCTION_SECTIONS,
} = require('./systemInstruction');

const QUALITY_FILE = path.join(__dirname, '..', 'data', 'quality-report.json');

/**
 * The GenAI pipeline, stage by stage. Keys match the stage keys recorded in each trace,
 * so the Engineering page can light up the stages a real request went through.
 */
const PIPELINE = Object.freeze([
  {
    key: 'environment',
    title: 'Live air and weather',
    where: 'src/services/environment.js',
    detail: 'Open-Meteo AQI, pollutants, 24 h forecast and wind, fetched on the server and cached.',
  },
  {
    key: 'impact',
    title: 'Impact model',
    where: 'src/utils/impact.js',
    detail: 'CO₂, PM2.5 exposure and community effect are computed by formula, never by the model.',
  },
  {
    key: 'sanitize',
    title: 'Input guard',
    where: 'src/utils/sanitize.js',
    detail: 'Place names are whitelisted, notes with hijack phrases are dropped before any prompt.',
  },
  {
    key: 'prompt',
    title: 'Grounded prompt',
    where: 'src/services/advice.js',
    detail:
      'One JSON document: live data, profile, what-if choices, computed impact, untrusted text.',
  },
  {
    key: 'ai',
    title: 'Language model',
    where: 'src/services/aiClient.js',
    detail: 'System instruction goes in the system role. Gemini or Claude, with a hard timeout.',
  },
  {
    key: 'validate',
    title: 'Schema validation',
    where: 'src/utils/schemas.js',
    detail: 'The reply must match a strict zod schema. Unknown keys are stripped.',
  },
  {
    key: 'fallback',
    title: 'Rule-based fallback',
    where: 'src/services/fallbackAdvice.js',
    detail:
      'If the model is missing, slow or invalid, rules build the same shape (English and Tamil).',
  },
]);

/**
 * Security controls and how the browser can verify each one live.
 * `verify.type` is "header" (read from a real response) or "probe" (send a hostile request
 * and expect a specific status). The Engineering page runs these against this very server.
 */
const SECURITY_CONTROLS = Object.freeze([
  {
    key: 'csp',
    label: 'Content-Security-Policy: scripts same-origin only',
    verify: { type: 'header', name: 'content-security-policy', contains: "script-src 'self'" },
  },
  {
    key: 'framing',
    label: 'Clickjacking blocked (frame-ancestors none)',
    verify: { type: 'header', name: 'content-security-policy', contains: "frame-ancestors 'none'" },
  },
  {
    key: 'nosniff',
    label: 'MIME sniffing disabled',
    verify: { type: 'header', name: 'x-content-type-options', equals: 'nosniff' },
  },
  {
    key: 'referrer',
    label: 'Referrer not leaked',
    verify: { type: 'header', name: 'referrer-policy', equals: 'no-referrer' },
  },
  {
    key: 'fingerprint',
    label: 'Framework fingerprint hidden',
    verify: { type: 'header', name: 'x-powered-by', absent: true },
  },
  {
    key: 'rate-limit',
    label: 'Rate limiting active',
    verify: { type: 'header', name: 'ratelimit-limit', present: true },
  },
  {
    key: 'validation',
    label: 'Strict input validation (bad enum rejected)',
    verify: {
      type: 'probe',
      method: 'POST',
      path: '/api/impact',
      body: { pm25: 50, profile: { commuteMode: 'teleport' } },
      expectStatus: 400,
    },
  },
  {
    key: 'unknown-keys',
    label: 'Unknown fields rejected (mass-assignment guard)',
    verify: {
      type: 'probe',
      method: 'POST',
      path: '/api/impact',
      body: { pm25: 50, isAdmin: true },
      expectStatus: 400,
    },
  },
  {
    key: 'body-limit',
    label: 'Oversized body refused (10 KB cap)',
    verify: {
      type: 'probe',
      method: 'POST',
      path: '/api/impact',
      body: { pm25: 50, filler: 'x'.repeat(11000) },
      expectStatus: 413,
    },
  },
  {
    key: 'error-shape',
    label: 'Unknown routes return safe JSON, no stack traces',
    verify: { type: 'probe', method: 'GET', path: '/api/does-not-exist', expectStatus: 404 },
  },
]);

/** Requirement-to-code map for the "problem statement alignment" criterion. */
const ALIGNMENT = Object.freeze([
  {
    requirement: 'GenAI-powered assistant',
    files: [
      'src/services/aiClient.js',
      'src/services/systemInstruction.js',
      'src/services/advice.js',
    ],
  },
  {
    requirement: 'Conversational GenAI chat grounded in live data',
    files: [
      'src/services/chat.js',
      'src/services/chatInstruction.js',
      'src/services/chatFallback.js',
      'public/js/chat.js',
    ],
  },
  {
    requirement: 'Daily routine planner and alerts, by lifestyle',
    files: ['src/services/planner.js', 'public/js/plannerView.js', 'public/js/alerts.js'],
  },
  {
    requirement: 'Low-emission daily routines',
    files: ['src/services/systemInstruction.js', 'src/services/planner.js'],
  },
  {
    requirement: 'Indoor air quality hacks',
    files: ['src/services/indoor.js', 'src/data/lifestyleContent.js', 'public/js/indoorView.js'],
  },
  {
    requirement: 'Sustainable alternatives and weekly challenge',
    files: [
      'src/services/sustainability.js',
      'src/data/lifestyleContent.js',
      'public/js/greenView.js',
    ],
  },
  {
    requirement: 'Location chosen once at the start and reflected in every module',
    files: [
      'public/js/gate.js',
      'public/js/cities.js',
      'public/js/main.js',
      'src/services/geocoding.js',
    ],
  },
  {
    requirement: 'Location-based suggestions for children, elderly and sensitive people',
    files: [
      'src/services/local.js',
      'public/js/localView.js',
      'public/js/placeSearch.js',
      'src/services/advice.js',
    ],
  },
  {
    requirement: 'Step-by-step plan: AirSense rule plan and AI plan side by side',
    files: ['public/js/wizard.js', 'src/services/fallbackAdvice.js', 'src/services/advice.js'],
  },
  {
    requirement: 'Tailored to location and lifestyle',
    files: ['src/services/environment.js', 'src/utils/schemas.js', 'src/services/windows.js'],
  },
  {
    requirement: 'Clearly explains direct impact of choices',
    files: ['src/utils/impact.js', 'public/js/ui.js'],
  },
  {
    requirement: 'Real-time data',
    files: ['src/services/environment.js', 'public/js/main.js'],
  },
]);

/** Read the report written by `npm run report`. */
function readQualityReport() {
  try {
    return JSON.parse(fs.readFileSync(QUALITY_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/** @returns {object} Everything the Engineering page needs, in one document. */
function buildDiagnostics() {
  const snapshot = telemetry.snapshot();
  const { provider } = config.ai;
  const model = provider === 'anthropic' ? config.ai.anthropicModel : config.ai.geminiModel;

  return {
    generatedAt: new Date().toISOString(),
    node: process.version,
    environment: config.env,
    ai: {
      provider,
      model,
      configured: aiClient.isConfigured(),
      timeoutMs: config.ai.timeoutMs,
      temperature: 0.4,
      outputContract:
        provider === 'anthropic'
          ? 'JSON-only instruction, parsed and validated'
          : 'responseMimeType application/json, parsed and validated',
      systemInstruction: {
        sha: INSTRUCTION_SHA,
        characters: SYSTEM_INSTRUCTION.length,
        lines: SYSTEM_INSTRUCTION.split('\n').length,
        sections: INSTRUCTION_SECTIONS,
      },
    },
    pipeline: PIPELINE,
    controls: SECURITY_CONTROLS,
    alignment: ALIGNMENT,
    runtime: {
      uptimeSec: snapshot.uptimeSec,
      totalRequests: snapshot.totalRequests,
      byRoute: snapshot.byRoute,
      caches: snapshot.caches,
      limits: {
        windowSec: config.rateLimit.windowMs / 1000,
        apiMax: config.rateLimit.max,
        adviceMax: config.rateLimit.adviceMax,
        bodyLimit: '10 KB',
        upstreamTimeoutMs: config.upstreamTimeoutMs,
      },
    },
    traces: snapshot.traces.map(
      ({ prompt: _prompt, rawOutput: _rawOutput, ...summary }) => summary,
    ),
    quality: readQualityReport(),
  };
}

module.exports = { buildDiagnostics, PIPELINE, SECURITY_CONTROLS, ALIGNMENT, QUALITY_FILE };
