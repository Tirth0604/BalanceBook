'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Credential endpoints are throttled per the contract (docs/03-api-contract.md):
 * login 10 per 15 min per IP+email, register 5 per hour per IP.
 */

function limited(message) {
  return function handleLimited(req, res) {
    const error = new ApiError(429, 'RATE_LIMITED', message);
    return res.status(error.statusCode).json({
      success: false,
      error: { code: error.code, message: error.message },
    });
  };
}

/**
 * The whole integration suite talks to one process from 127.0.0.1, so the per-IP budget
 * would be exhausted by unrelated tests. Set RATE_LIMIT_TEST=1 to exercise the real limits.
 */
function skipDuringSuite() {
  return config.isTest && process.env.RATE_LIMIT_TEST !== '1';
}

function emailHint(req) {
  const raw = req.body?.email ?? req.body?.username;
  return String(raw || '')
    .trim()
    .toLowerCase();
}

const loginLimiter = rateLimit({
  name: 'login',
  limit: 10,
  windowMs: 15 * 60 * 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipDuringSuite,
  // Email is part of the key so a shared office IP does not lock out every tenant,
  // while an attacker hammering one mailbox still stops after 10 tries.
  keyGenerator: (req) => `${req.ip || 'unknown-ip'}:${emailHint(req)}`,
  handler: limited('Too many sign-in attempts. Please try again in a few minutes.'),
});

const registerLimiter = rateLimit({
  name: 'register',
  limit: 5,
  windowMs: 60 * 60 * 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipDuringSuite,
  keyGenerator: (req) => String(req.ip || 'unknown-ip'),
  handler: limited('Too many accounts created from this address. Please try again later.'),
});

const resetPasswordLimiter = rateLimit({
  name: 'password-reset',
  limit: config.isDevelopment ? 100 : 5,
  windowMs: config.isDevelopment ? 60 * 1000 : 60 * 60 * 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipDuringSuite,
  keyGenerator: (req) => String(req.ip || 'unknown-ip'),
  handler: limited('Too many password reset requests. Please try again later.'),
});

module.exports = { loginLimiter, registerLimiter, resetPasswordLimiter };
