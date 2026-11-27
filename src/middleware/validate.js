'use strict';

const { AppError } = require('../utils/errors');

/**
 * Validate and replace a part of the request with the parsed (typed, defaulted) result.
 * Unknown keys are rejected by the schemas themselves where `.strict()` is used.
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body'|'query'} source
 * @returns {import('express').RequestHandler}
 */
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const detail = result.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || source}: ${issue.message}`)
        .join('; ');
      return next(new AppError(`Invalid request. ${detail}`, 400, 'VALIDATION_ERROR'));
    }
    req.valid = { ...(req.valid || {}), [source]: result.data };
    return next();
  };
}

module.exports = { validate };
