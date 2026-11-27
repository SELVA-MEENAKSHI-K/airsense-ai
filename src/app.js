'use strict';

const path = require('path');
const express = require('express');
const compression = require('compression');
const config = require('./config');
const apiRoutes = require('./routes/api');
const { helmetMiddleware, corsMiddleware, apiLimiter } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { metrics } = require('./middleware/metrics');

/**
 * Build the Express application (separate from listen() so tests can import it).
 * @returns {import('express').Express}
 */
function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

  app.use(helmetMiddleware);
  app.use(compression());
  app.use(corsMiddleware);
  app.use(express.json({ limit: '10kb' }));

  app.use('/api', metrics(), apiLimiter, apiRoutes);
  app.use('/api', notFound);

  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      maxAge: config.env === 'production' ? '1h' : 0,
      index: 'index.html',
    }),
  );

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
