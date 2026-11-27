'use strict';

const config = require('./config');
const logger = require('./utils/logger');
const { createApp } = require('./app');
const aiClient = require('./services/aiClient');

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info('AirSense AI is running', {
    port: config.port,
    aiProvider: config.ai.provider,
    aiConfigured: aiClient.isConfigured(),
  });
});

/** Stop accepting connections and exit cleanly on termination signals. */
const FORCE_EXIT_MS = 10000;

function shutdown(signal) {
  logger.info('Shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), FORCE_EXIT_MS).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
