'use strict';

const config = require('../config');

const silent = config.env === 'test';

/**
 * Tiny structured logger. Callers must never pass secrets or full request bodies.
 * @param {'info'|'warn'|'error'} level
 * @param {string} message
 * @param {object} [meta]
 */
function log(level, message, meta) {
  if (silent) return;
  const line = { level, time: new Date().toISOString(), message, ...meta };
  console[level === 'info' ? 'log' : level](JSON.stringify(line));
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};
