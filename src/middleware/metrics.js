'use strict';

const { telemetry } = require('../services/telemetry');

/**
 * Record latency and status for every API request, labelled by route pattern
 * (for example "GET /api/environment") so metrics never contain query values.
 * @param {{recordRequest: Function}} [sink]
 * @returns {import('express').RequestHandler}
 */
function metrics(sink = telemetry) {
  return (req, res, next) => {
    const begun = process.hrtime.bigint();
    res.on('finish', () => {
      const route = req.route ? `${req.baseUrl}${req.route.path}` : '(unmatched)';
      sink.recordRequest({
        route,
        method: req.method,
        status: res.statusCode,
        ms: Number(process.hrtime.bigint() - begun) / 1e6,
      });
    });
    next();
  };
}

module.exports = { metrics };
