'use strict';

const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

/** @type {import('express').RequestHandler} */
function notFound(_req, _res, next) {
  next(new AppError('Route not found', 404, 'NOT_FOUND'));
}

/**
 * Central error handler. Only AppError messages reach the client;
 * everything else becomes a generic 500 so internals never leak.
 * @type {import('express').ErrorRequestHandler}
 */
function errorHandler(err, _req, res, _next) {
  if (err && err.type === 'entity.parse.failed') {
    err = new AppError('Request body must be valid JSON', 400, 'BAD_JSON');
  } else if (err && err.type === 'entity.too.large') {
    err = new AppError('Request body is too large', 413, 'PAYLOAD_TOO_LARGE');
  }

  if (err instanceof AppError) {
    if (err.status >= 500) logger.warn('Request failed', { code: err.code, status: err.status });
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }

  logger.error('Unhandled error', { name: err && err.name });
  return res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' } });
}

module.exports = { notFound, errorHandler };
