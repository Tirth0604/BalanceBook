'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Access tokens are 15-minute JWTs. The payload shape is fixed here because the socket
 * handshake, the refresh flow and the tests all read it: { sub, type: 'access' }.
 */
function signAccessToken(user, extra = {}) {
  return jwt.sign({ sub: String(user._id), type: 'access', ...extra }, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL,
    algorithm: 'HS256',
  });
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, config.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  if (payload.type !== 'access') throw ApiError.unauthorized('Not an access token');
  return payload;
}

function readBearer(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

async function loadUser(token) {
  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Session is no longer valid');
  return { user, payload };
}

const requireAuth = asyncHandler(async (req, res, next) => {
  const token = readBearer(req);
  if (!token) throw ApiError.unauthorized('Authentication required');
  const { user, payload } = await loadUser(token);
  req.user = user;
  req.userId = String(user._id);
  req.tokenPayload = payload;
  return next();
});

/** Attaches req.user when a token is present, but never rejects — used on the landing page. */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = readBearer(req);
  if (token) {
    try {
      const { user } = await loadUser(token);
      req.user = user;
      req.userId = String(user._id);
    } catch {
      // An invalid token on a public route is simply treated as anonymous.
    }
  }
  return next();
});

module.exports = { requireAuth, optionalAuth, signAccessToken, verifyAccessToken, loadUser, readBearer };
