'use strict';

const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');

/** Centralised error mapping: every failure leaves through the same envelope. */

function toApiError(error) {
  if (error instanceof ApiError) return error;

  // Money / split / settlement invariants raised by the pure engine.
  if (error?.name === 'MoneyError' || error?.code === 'BALANCES_NOT_BALANCED' || error?.code === 'SETTLEMENT_INVALID') {
    const status = error?.code === 'BALANCES_NOT_BALANCED' ? 500 : 422;
    return new ApiError(status, status === 500 ? 'FINANCIAL_INVARIANT_VIOLATION' : 'VALIDATION_ERROR', error.message, error.details);
  }

  if (error?.type === 'EntityVerificationFailed' || error?.name === 'ValidationError') {
    const details = Object.values(error.errors || {}).map((item) => ({
      path: item.path,
      message: item.message,
      value: item.value,
    }));
    return new ApiError(422, 'VALIDATION_ERROR', error.message, details);
  }

  if (error?.name === 'CastError') {
    return new ApiError(400, 'VALIDATION_ERROR', `Invalid value for ${error.path}`);
  }

  if (error?.code === 11000) {
    const field = Object.keys(error.keyValue || { field: 'value' })[0];
    const duplicate = field === 'email' ? 'That email is already registered' : `Duplicate value for ${field}`;
    return new ApiError(409, 'CONFLICT', duplicate, { field });
  }

  if (error?.codeName === 'MongoServerError' && /Too many clauses|invalid pipeline/i.test(error.message || '')) {
    return ApiError.internal('Analytics query could not be executed');
  }

  if (error?.code === 'LIMIT_FILE_SIZE') {
    return new ApiError(413, 'UPLOAD_INVALID', 'That file is larger than the allowed size');
  }
  if (error?.code === 'LIMIT_UNEXPECTED_FILE') {
    return ApiError.badRequest(`Unexpected upload field: ${error.field}`);
  }

  if (error?.message === 'not found') return ApiError.notFound();

  return ApiError.internal(error?.message || 'Something went wrong');
}

// eslint-disable-next-line no-unused-vars
function errorMiddleware(error, req, res, next) {
  const apiError = toApiError(error);

  if (apiError.statusCode >= 500) {
    // Never leak a stack or a raw driver error to the client; log it server-side instead.
    req.log?.error?.({ err: error }, 'request failed');
    // eslint-disable-next-line no-console
    if (process.env.NODE_ENV !== 'test') console.error(error);
  }

  const body = {
    success: false,
    error: {
      code: apiError.code,
      message: apiError.statusCode >= 500 ? 'Something went wrong on our side' : apiError.message,
    },
  };
  if (apiError.details) body.error.details = apiError.details;
  if (apiError.statusCode >= 500 && process.env.NODE_ENV === 'development') {
    body.error.message = apiError.message;
  }
  return res.status(apiError.statusCode).json(body);
}

function notFoundMiddleware(req, res) {
  return res
    .status(404)
    .json({ success: false, error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` } });
}

module.exports = { errorMiddleware, notFoundMiddleware, toApiError, isObjectId: (value) => mongoose.isValidObjectId(value) };
