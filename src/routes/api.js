'use strict';

const express = require('express');
const aiClient = require('../services/aiClient');
const config = require('../config');
const { validate } = require('../middleware/validate');
const { adviceLimiter } = require('../middleware/security');
const { searchPlaces, reversePlace } = require('../services/geocoding');
const { getEnvironment } = require('../services/environment');
const { getAdvice } = require('../services/advice');
const { getChatReply } = require('../services/chat');
const { buildPlanner } = require('../services/planner');
const { buildIndoor } = require('../services/indoor');
const { buildLocal } = require('../services/local');
const { buildComparison } = require('../services/comparison');
const { buildSustainability } = require('../services/sustainability');
const { computeImpact } = require('../utils/impact');
const { buildDiagnostics } = require('../services/diagnostics');
const { telemetry } = require('../services/telemetry');
const { SYSTEM_INSTRUCTION, INSTRUCTION_SHA } = require('../services/systemInstruction');
const { AppError } = require('../utils/errors');
const {
  coordinatesQuery,
  geocodeQuery,
  impactBody,
  adviceBody,
  chatBody,
  compareBody,
  localQuery,
  plannerBody,
  lifestyleBody,
} = require('../utils/schemas');

const router = express.Router();

/** Wrap async handlers so rejections reach the central error handler. */
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', aiConfigured: aiClient.isConfigured(), provider: config.ai.provider });
});

router.get(
  '/geocode',
  validate(geocodeQuery, 'query'),
  wrap(async (req, res) => {
    const { q, country } = req.valid.query;
    const places = await searchPlaces(q, { country });
    res.json({ places });
  }),
);

router.get(
  '/reverse',
  validate(coordinatesQuery, 'query'),
  wrap(async (req, res) => {
    const { lat, lon } = req.valid.query;
    res.json({ place: await reversePlace(lat, lon) });
  }),
);

router.get(
  '/environment',
  validate(coordinatesQuery, 'query'),
  wrap(async (req, res) => {
    const { lat, lon } = req.valid.query;
    const environment = await getEnvironment(lat, lon);
    res.set('Cache-Control', 'public, max-age=60');
    res.json(environment);
  }),
);

router.post('/impact', validate(impactBody), (req, res) => {
  const { pm25, profile, choices } = req.valid.body;
  res.json({ impact: computeImpact({ profile, choices, pm25 }) });
});

router.post(
  '/advice',
  adviceLimiter,
  validate(adviceBody),
  wrap(async (req, res) => {
    const result = await getAdvice(req.valid.body);
    res.set('Cache-Control', 'no-store');
    res.json(result);
  }),
);

router.post(
  '/chat',
  adviceLimiter,
  validate(chatBody),
  wrap(async (req, res) => {
    const result = await getChatReply(req.valid.body);
    res.set('Cache-Control', 'no-store');
    res.json(result);
  }),
);

router.post(
  '/planner',
  validate(plannerBody),
  wrap(async (req, res) => {
    const { lat, lon, lang, lifestyle, prefs } = req.valid.body;
    const environment = await getEnvironment(lat, lon);
    res.set('Cache-Control', 'no-store');
    res.json({ planner: buildPlanner(environment, { lifestyle, prefs, lang }) });
  }),
);

router.post(
  '/compare',
  validate(compareBody),
  wrap(async (req, res) => {
    const { lat, lon, lang, profile } = req.valid.body;
    const environment = await getEnvironment(lat, lon);
    res.set('Cache-Control', 'no-store');
    res.json({ comparison: buildComparison(environment, { profile, lang }) });
  }),
);

router.get(
  '/local',
  validate(localQuery, 'query'),
  wrap(async (req, res) => {
    const { lat, lon, lang, place, groups } = req.valid.query;
    const environment = await getEnvironment(lat, lon);
    res.set('Cache-Control', 'no-store');
    res.json({ local: buildLocal(environment, { lang, groups, place }) });
  }),
);

router.get(
  '/indoor',
  validate(lifestyleBody, 'query'),
  wrap(async (req, res) => {
    const { lat, lon, lang } = req.valid.query;
    const environment = await getEnvironment(lat, lon);
    res.set('Cache-Control', 'no-store');
    res.json({ indoor: buildIndoor(environment, { lang }) });
  }),
);

router.get(
  '/sustainability',
  validate(lifestyleBody, 'query'),
  wrap(async (req, res) => {
    const { lat, lon, lang, lifestyle } = req.valid.query;
    const environment = await getEnvironment(lat, lon);
    res.set('Cache-Control', 'no-store');
    res.json({ sustainability: buildSustainability(environment, { lifestyle, lang }) });
  }),
);

router.get('/diagnostics', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(buildDiagnostics());
});

router.get('/diagnostics/traces/:id', (req, res, next) => {
  const trace = /^[0-9a-f]{8}$/.test(req.params.id) ? telemetry.getTrace(req.params.id) : null;
  if (!trace) return next(new AppError('Trace not found', 404, 'NOT_FOUND'));
  res.set('Cache-Control', 'no-store');
  return res.json({ trace });
});

router.get('/system-instruction', (_req, res) => {
  res.json({ sha: INSTRUCTION_SHA, text: SYSTEM_INSTRUCTION });
});

module.exports = router;
