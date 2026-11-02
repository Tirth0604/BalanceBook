'use strict';

const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { buildMeta } = require('../utils/pagination');
const authService = require('./authService');
const groupService = require('./groupService');

const MAX_SEARCH_RESULTS = 10;

let storageService = null;
try {
  // Optional collaborator: the storage driver decides where avatar bytes land.
  // eslint-disable-next-line global-require
  storageService = require('./storageService');
} catch (error) {
  storageService = null;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getActiveUser(userId) {
  const user = await User.findById(userId);
  if (!user || user.status !== 'active') throw ApiError.notFound('User not found');
  return user;
}

/**
 * Only a path we served ourselves or an http(s) URL is accepted: a stored `javascript:` or
 * `data:` URI would turn the avatar into a script when the SPA renders it.
 */
function normalizeAvatarUrl(value) {
  const raw = String(value ?? '').trim();
  if (raw.startsWith('/') || /^https?:\/\//i.test(raw)) return raw.slice(0, 500);
  throw ApiError.badRequest('avatarUrl must be a site-relative path or an http(s) URL');
}

async function getProfile(userId) {
  return authService.toPublicUser(await getActiveUser(userId));
}

async function updateProfile(userId, payload) {
  const user = await getActiveUser(userId);

  if (payload.name !== undefined) user.name = payload.name;
  if (payload.phone !== undefined) user.phone = payload.phone || null;
  if (payload.preferredCurrency !== undefined) user.preferredCurrency = payload.preferredCurrency;
  if (payload.notificationPreferences !== undefined) {
    // Patch semantics: an untouched switch keeps its current value.
    const current = user.notificationPreferences?.toObject?.() ?? {};
    user.notificationPreferences = { ...current, ...payload.notificationPreferences };
  }

  await user.save();
  return authService.toPublicUser(user);
}

async function changePassword(userId, payload, { req } = {}) {
  const user = await User.findById(userId).select('+password');
  if (!user || user.status !== 'active') throw ApiError.notFound('User not found');

  const matches = await user.comparePassword(String(payload.currentPassword));
  if (!matches) throw ApiError.unauthorized('Current password is not correct');
  if (payload.currentPassword === payload.newPassword) {
    throw ApiError.badRequest('New password must differ from the current password', { path: 'newPassword' });
  }
  if (!authService.PASSWORD_POLICY.test(String(payload.newPassword))) {
    throw ApiError.badRequest('Password must be at least 8 characters with upper, lower and digit', {
      path: 'newPassword',
    });
  }

  user.password = payload.newPassword;
  await user.save();

  // Credential change: every other device is logged out, the caller's session survives.
  await authService.revokeOtherSessions(user._id, authService.readRefreshToken(req));

  return authService.toPublicUser(user);
}

async function uploadAvatar(userId, { file, avatarUrl } = {}) {
  const user = await getActiveUser(userId);
  let url = null;

  if (file && file.buffer && file.buffer.length) {
    const save = storageService && storageService.save;
    if (typeof save !== 'function') {
      throw new ApiError(400, 'UPLOAD_INVALID', 'No storage driver is configured for avatar uploads');
    }
    const stored = await save({
      buffer: file.buffer,
      mimeType: file.mimetype,
      fileName: file.originalname,
      safeName: file.safeName,
      kind: 'avatars',
    });
    url = stored.url;
  } else if (avatarUrl) {
    url = normalizeAvatarUrl(avatarUrl);
  } else {
    throw ApiError.badRequest('Attach the image in the "file" field or send an avatarUrl', { path: 'file' });
  }

  user.avatarUrl = url;
  await user.save();
  return authService.toPublicUser(user);
}

async function searchUsers(query = {}) {
  const term = String(query.q ?? '').trim();
  if (!term) return [];
  const limit = Math.min(MAX_SEARCH_RESULTS, Math.max(1, Number(query.limit) || MAX_SEARCH_RESULTS));

  // Exact email match or a name prefix: this feeds the invite picker, so no user dump.
  const users = await User.find({
    status: 'active',
    $or: [
      { email: new RegExp(`^${escapeRegex(term)}$`, 'i') },
      { name: new RegExp(`^${escapeRegex(term)}`, 'i') },
    ],
  })
    .select('name email avatarUrl')
    .limit(limit)
    .sort({ name: 1 });

  return {
    items: users.map(groupService.toUserRef),
    meta: buildMeta({ page: 1, limit, total: users.length }),
  };
}

/**
 * Soft delete: the row is kept so expenses and settlements stay attributable, the roster is
 * tidied up, and every refresh token dies with the account.
 */
async function deleteAccount(userId, payload, { res } = {}) {
  if (payload?.confirm !== 'DELETE') throw ApiError.badRequest('Type DELETE to confirm this action');

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  user.status = 'deleted';
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  user.emailVerificationTokenHash = null;
  user.emailVerificationExpiresAt = null;
  await user.save();

  await RefreshToken.deleteMany({ userId: user._id });
  await groupService.detachUserFromGroups(user._id);
  authService.clearRefreshCookie(res);

  return { id: String(user._id), status: 'deleted' };
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  uploadAvatar,
  searchUsers,
  deleteAccount,
  normalizeAvatarUrl,
  MAX_SEARCH_RESULTS,
};
