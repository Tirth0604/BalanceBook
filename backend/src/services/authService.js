'use strict';

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_PATH = `${config.API_PREFIX}/auth`;
const REFRESH_TTL_MS = ttlToMs(config.JWT_REFRESH_TTL);
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Compared when no user matches the email, so an unknown address costs the same as a wrong
 * password and the response cannot be used to enumerate registered accounts.
 */
const DUMMY_PASSWORD_HASH = '$2a$12$woO/bvS2xYotsAgwA6.4L.oZZRAx/oZ/rPx.YIw5Y90BzpTH8K.iu';

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,128}$/;

const DEFAULT_NOTIFICATION_PREFERENCES = {
  inApp: true,
  email: false,
  expenseAdded: true,
  expenseUpdated: true,
  settlementRequested: true,
  settlementConfirmed: true,
  budgetAlerts: true,
};

/** Mails that could not be dispatched: the delivery log tests and local runs read. */
const outbox = [];

let emailService = null;
try {
  // Delivery is an optional collaborator: auth flows must keep working without it.
  // eslint-disable-next-line global-require
  emailService = require('./emailService');
} catch (error) {
  emailService = null;
}

function ttlToMs(value) {
  const match = /^(\d+)([smhd])?$/.exec(String(value).trim());
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const units = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return Number(match[1]) * (units[match[2] || 's'] || 1000);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** Generate a cryptographically random 6-digit OTP string. */
function generateOtp() {
  // Use random bytes to avoid modulo bias; keep only 6 decimal digits.
  const val = crypto.randomInt(0, 1_000_000);
  return String(val).padStart(6, '0');
}

function clientLink(path, token) {
  const base = String(config.CLIENT_URL).replace(/\/$/, '');
  return `${base}/${path}?token=${encodeURIComponent(token)}`;
}

function capture(message) {
  outbox.push({ ...message, sentAt: new Date() });
  if (outbox.length > 500) outbox.shift();
}

/**
 * Delivery is best-effort by design: a misconfigured or missing SMTP host must not turn a
 * password reset into a 500, because the reset link is already persisted and usable.
 */
async function deliverMail(message) {
  const send = emailService && (emailService.send || emailService.sendEmail || emailService.sendMail);
  if (typeof send !== 'function') {
    capture(message);
    return { delivered: false, captured: true };
  }
  try {
    await send.call(emailService, message);
  } catch (error) {
    if (!config.isProduction) {
      // eslint-disable-next-line no-console
      console.warn(`[auth] email delivery failed: ${error.message}`);
    }
  }
  // Outside production the link is kept locally so developers (and the test suite) can
  // follow a verification or reset mail without a real mailbox.
  if (!config.isProduction) capture(message);
  return { delivered: true, captured: !config.isProduction };
}

function toPublicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    preferredCurrency: user.preferredCurrency,
    isEmailVerified: Boolean(user.isEmailVerified),
    notificationPreferences: user.notificationPreferences
      ? user.notificationPreferences.toObject?.() ?? { ...DEFAULT_NOTIFICATION_PREFERENCES }
      : { ...DEFAULT_NOTIFICATION_PREFERENCES },
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

/**
 * Claim shape is fixed by `middleware/authMiddleware`: `{ sub, type: 'access' }` over HS256.
 * `userId` is duplicated for consumers that read the pragmatic claim name.
 */
function signAccessToken(user) {
  const userId = String(user._id);
  return jwt.sign({ sub: userId, userId, type: 'access' }, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL,
    algorithm: 'HS256',
  });
}

function cookieOptions() {
  const options = {
    httpOnly: true,
    sameSite: 'strict',
    secure: Boolean(config.COOKIE_SECURE),
    path: COOKIE_PATH,
    maxAge: REFRESH_TTL_MS,
  };
  if (config.COOKIE_DOMAIN) options.domain = config.COOKIE_DOMAIN;
  return options;
}

function setRefreshCookie(res, token) {
  if (res && typeof res.cookie === 'function') res.cookie(REFRESH_COOKIE, token, cookieOptions());
}

function clearRefreshCookie(res) {
  if (res && typeof res.clearCookie === 'function') {
    const { maxAge, ...clearing } = cookieOptions();
    res.clearCookie(REFRESH_COOKIE, clearing);
  }
}

/** Cookie first: browsers send it automatically and the body copy is for API clients. */
function readRefreshToken(req) {
  const fromCookie = req?.cookies?.[REFRESH_COOKIE];
  const fromBody = req?.body?.refreshToken;
  const bearer = /^Bearer\s+(.+)$/i.exec(String(req?.headers?.authorization || ''));
  return fromCookie || fromBody || (bearer ? bearer[1] : null);
}

function requestMeta(req) {
  return {
    userAgent: String(req?.headers['user-agent'] || '').slice(0, 300),
    ip: req?.ip ? String(req.ip) : '',
  };
}

async function saveRefreshToken(user, token, familyId, meta) {
  return RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(token),
    familyId,
    userAgent: meta.userAgent,
    ip: meta.ip,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
}

async function revokeFamily(familyId) {
  return RefreshToken.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

/** Revoke every session of a user except the chain the caller is presenting right now. */
async function revokeOtherSessions(userId, currentToken) {
  const keep = currentToken ? await RefreshToken.findOne({ tokenHash: hashToken(currentToken) }) : null;
  const filter = { userId, revokedAt: null };
  if (keep) filter.familyId = { $ne: keep.familyId };
  return RefreshToken.updateMany(filter, { $set: { revokedAt: new Date() } });
}

async function startSession(user, req, res) {
  const token = randomToken();
  await saveRefreshToken(user, token, crypto.randomUUID(), requestMeta(req));
  setRefreshCookie(res, token);
  return signAccessToken(user);
}

async function register(payload, { req, res } = {}) {
  const email = String(payload.email).toLowerCase().trim();
  // The edge validator holds the same rules; re-checking here protects every caller of the
  // service (seeds, scripts, future transports) that bypasses HTTP validation.
  if (!PASSWORD_POLICY.test(String(payload.password))) {
    throw ApiError.badRequest('Password must be at least 8 characters with upper, lower and digit', {
      path: 'password',
    });
  }

  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('That email is already registered', { field: 'email' });

  // The plaintext never leaves this function: the model's pre-save hook bcrypts it.
  const user = await User.create({
    name: payload.name,
    email,
    password: payload.password,
    preferredCurrency: payload.preferredCurrency,
  });

  // Generate a 6-digit OTP and an email verification token.
  const otp = generateOtp();
  const verificationToken = randomToken();
  user.otpHash = hashToken(otp);
  user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  user.emailVerificationTokenHash = hashToken(verificationToken);
  user.emailVerificationExpiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
  await user.save();

  const verifyUrl = clientLink('verify-email', verificationToken);
  const otpTpl = emailService?.templates ? emailService.templates().otpVerification(otp) : null;
  await deliverMail({
    to: email,
    subject: otpTpl?.subject || 'Confirm your BalanceBook email',
    text: otpTpl?.text || `Welcome to BalanceBook!\n\nYour verification code is: ${otp}\n\n(Expires in 10 minutes)\n\nOr verify directly via link: ${verifyUrl}`,
    html: otpTpl?.html,
    kind: 'verify-email',
    token: verificationToken,
    url: verifyUrl,
    otp,
  });

  const accessToken = await startSession(user, req, res);
  return {
    user: toPublicUser(user),
    accessToken,
    requiresOtpVerification: !user.isEmailVerified,
  };
}

async function login(payload, { req, res } = {}) {
  const email = String(payload.email).toLowerCase().trim();
  const user = await User.findOne({ email }).select('+password');
  const password = String(payload.password ?? '');
  const passwordMatches = user
    ? await user.comparePassword(password)
    : await bcrypt.compare(password, DUMMY_PASSWORD_HASH);

  if (!user || !passwordMatches) throw ApiError.unauthorized('Invalid email or password');
  // A deleted or deactivated account holds valid credentials but gets no session: 401 keeps
  // the account state out of the response, exactly like a wrong password does.
  if (user.status !== 'active') throw ApiError.unauthorized('This account cannot sign in');

  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = await startSession(user, req, res);
  return { user: toPublicUser(user), accessToken };
}

async function refresh({ req, res } = {}) {
  const token = readRefreshToken(req);
  if (!token) throw ApiError.unauthorized('Refresh token is missing');

  const record = await RefreshToken.findOne({ tokenHash: hashToken(token) });
  if (!record) {
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Refresh token is not valid');
  }

  if (record.revokedAt) {
    // Reuse detection: a digest that was already rotated out came back, so the chain is
    // compromised. Killing the whole family turns a stolen token into a forced re-login.
    await revokeFamily(record.familyId);
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await revokeFamily(record.familyId);
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  const user = await User.findById(record.userId);
  if (!user || user.status !== 'active') {
    await revokeFamily(record.familyId);
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  record.revokedAt = new Date();
  await record.save();

  const nextToken = randomToken();
  await saveRefreshToken(user, nextToken, record.familyId, requestMeta(req));
  setRefreshCookie(res, nextToken);

  return { accessToken: signAccessToken(user), user: toPublicUser(user) };
}

async function logout({ req, res } = {}) {
  const token = readRefreshToken(req);
  if (token) {
    const record = await RefreshToken.findOne({ tokenHash: hashToken(token) });
    if (record) await revokeFamily(record.familyId);
  }
  clearRefreshCookie(res);
  return null;
}

async function forgotPassword(payload) {
  const email = String(payload.email).toLowerCase().trim();
  const user = await User.findOne({ email });
  if (user && user.status === 'active') {
    const token = randomToken();
    user.passwordResetTokenHash = hashToken(token);
    user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();

    const resetUrl = clientLink('reset-password', token);
    const template = emailService?.templates ? emailService.templates().resetPassword(token) : null;
    await deliverMail({
      to: email,
      subject: template?.subject || 'Reset your BalanceBook password',
      text: template?.text || `Use this link within 15 minutes to reset your password: ${resetUrl}`,
      html: template?.html,
      kind: 'password-reset',
      token,
      url: resetUrl,
      expiresAt: user.passwordResetExpiresAt,
    });
    console.info(`[auth] password reset email dispatched for ${email}`);
    // Echoing the link is a development convenience only; production returns an opaque ack.
    if (config.isDevelopment) return { resetUrl, expiresAt: user.passwordResetExpiresAt };
  } else {
    console.warn(`[auth] password reset requested for unknown or inactive email: ${email}`);
  }
  // Same ack for an unknown address: reset requests must not confirm which emails exist.
  return { sent: true };
}

async function resetPassword(payload, { res } = {}) {
  const user = await User.findOne({
    passwordResetTokenHash: hashToken(payload.token),
    passwordResetExpiresAt: { $gt: new Date() },
  });
  if (!user) throw ApiError.badRequest('Reset link is invalid or has expired');
  if (!PASSWORD_POLICY.test(String(payload.password))) {
    throw ApiError.badRequest('Password must be at least 8 characters with upper, lower and digit', {
      path: 'password',
    });
  }

  user.password = payload.password;
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  await user.save();

  // A password reset is a credential change: every already-issued session is dropped.
  await RefreshToken.deleteMany({ userId: user._id });
  clearRefreshCookie(res);

  return { user: toPublicUser(user) };
}

async function verifyEmail(payload) {
  const user = await User.findOne({
    emailVerificationTokenHash: hashToken(payload.token),
    emailVerificationExpiresAt: { $gt: new Date() },
  });
  if (!user) throw ApiError.badRequest('Verification link is invalid or has expired');

  user.isEmailVerified = true;
  user.emailVerificationTokenHash = null;
  user.emailVerificationExpiresAt = null;
  await user.save();
  return { user: toPublicUser(user) };
}

async function me(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return toPublicUser(user);
}

/**
 * Verify a 6-digit OTP sent during registration.
 * On success the user's email is marked verified and the OTP fields are cleared.
 */
async function verifyOtp(payload, { req, res } = {}) {
  const { otp, email } = payload;

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+otpHash +otpExpiresAt');

  if (!user) throw ApiError.badRequest('Invalid or expired verification code');

  if (!user.otpHash || !user.otpExpiresAt || user.otpExpiresAt.getTime() <= Date.now()) {
    throw ApiError.badRequest('Verification code has expired. Please request a new one.');
  }

  if (user.otpHash !== hashToken(String(otp).trim())) {
    throw ApiError.badRequest('Incorrect verification code. Please try again.');
  }

  user.isEmailVerified = true;
  user.otpHash = null;
  user.otpExpiresAt = null;
  user.emailVerificationTokenHash = null;
  user.emailVerificationExpiresAt = null;
  await user.save();

  const accessToken = await startSession(user, req, res);
  return { user: toPublicUser(user), accessToken };
}

/**
 * Resend a fresh OTP to the user's email.
 * Refuses if the previous OTP is still fresh (< 60 s old).
 */
async function resendOtp(payload) {
  const email = String(payload.email).toLowerCase().trim();
  const user = await User.findOne({ email }).select('+otpHash +otpExpiresAt');

  // Don't reveal whether the email exists.
  if (!user) return { sent: true };

  if (user.isEmailVerified) throw ApiError.badRequest('Email is already verified');

  // Throttle: reject resend if the previous OTP was issued less than 60 seconds ago.
  const cooldownMs = (config.isDevelopment || config.isTest) ? 0 : 60 * 1000;
  if (user.otpExpiresAt && user.otpExpiresAt.getTime() - OTP_TTL_MS + cooldownMs > Date.now()) {
    throw ApiError.tooManyRequests('Please wait a moment before requesting another code.');
  }

  const otp = generateOtp();
  const verificationToken = randomToken();
  user.otpHash = hashToken(otp);
  user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  user.emailVerificationTokenHash = hashToken(verificationToken);
  user.emailVerificationExpiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
  await user.save();

  const verifyUrl = clientLink('verify-email', verificationToken);
  const otpTpl = emailService?.templates ? emailService.templates().otpVerification(otp) : null;
  await deliverMail({
    to: email,
    subject: otpTpl?.subject || 'Your new BalanceBook verification code',
    text: otpTpl?.text || `Your new email verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nOr click: ${verifyUrl}`,
    html: otpTpl?.html,
    kind: 'verify-email',
    token: verificationToken,
    url: verifyUrl,
    otp,
  });

  return { sent: true };
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  verifyOtp,
  resendOtp,
  me,
  toPublicUser,
  signAccessToken,
  hashToken,
  randomToken,
  revokeFamily,
  revokeOtherSessions,
  readRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  PASSWORD_POLICY,
  REFRESH_COOKIE,
  COOKIE_PATH,
  RESET_TOKEN_TTL_MS,
  outbox,
};
