'use strict';

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Strict Content-Security-Policy: scripts and connections stay same-origin.
 * Only Google Fonts is allowed for typography.
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ['https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginEmbedderPolicy: false,
});

/** Same-origin by default; a single explicit origin may be allowed through CORS_ORIGIN. */
const corsMiddleware = config.corsOrigin
  ? cors({ origin: config.corsOrigin, methods: ['GET', 'POST'], maxAge: 600 })
  : (_req, _res, next) => next();

const limitMessage = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again.' },
};

/** General limiter for all API routes. */
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage,
});

/** Tighter limiter for the AI endpoint, which is the expensive one. */
const adviceLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.adviceMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage,
});

module.exports = { helmetMiddleware, corsMiddleware, apiLimiter, adviceLimiter };
