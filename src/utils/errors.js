'use strict';

/**
 * An error that is safe to describe to API clients.
 * Anything that is not an AppError is reported as a generic 500.
 */
class AppError extends Error {
  /**
   * @param {string} message Human readable message (safe to expose).
   * @param {number} [status=500] HTTP status code.
   * @param {string} [code='INTERNAL_ERROR'] Stable machine readable code.
   */
  constructor(message, status = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

module.exports = { AppError };
