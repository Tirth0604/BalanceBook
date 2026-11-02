'use strict';

const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');

/**
 * Validates (and normalises) a request part against a zod schema.
 * Unknown keys are stripped by zod's default object behaviour, so a client cannot inject
 * extra fields into a mongoose update.
 */
function validatePart(schema, value, label) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = (result.error instanceof ZodError ? result.error.issues : []).map((issue) => ({
      path: issue.path.join('.') || label,
      message: issue.message,
      code: issue.code,
    }));
    throw ApiError.unprocessable(details[0]?.message || `Invalid ${label}`, details);
  }
  return result.data;
}

/** validate({ body: schema }) or validate(bodySchema) for the common case. */
function validate(spec) {
  const schemas = typeof spec === 'function' || (spec && spec.parse) ? { body: spec } : spec;
  return (req, res, next) => {
    try {
      if (schemas.body) req.validatedBody = validatePart(schemas.body, req.body ?? {}, 'body');
      if (schemas.query) req.validatedQuery = validatePart(schemas.query, req.query ?? {}, 'query');
      if (schemas.params) req.validatedParams = validatePart(schemas.params, req.params ?? {}, 'params');
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { validate, validatePart };
