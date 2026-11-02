'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const userService = require('../services/userService');

/** Validated payload first, raw request as the fallback (see validationMiddleware). */
const bodyOf = (req) => req.validatedBody ?? req.body ?? {};
const queryOf = (req) => req.validatedQuery ?? req.query ?? {};

const me = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, { user: await userService.getProfile(req.userId) });
});

const update = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, { user: await userService.updateProfile(req.userId, bodyOf(req)) });
});

/**
 * Multipart `file` bytes go to the storage driver; a client that already stored the image
 * can post the resulting `avatarUrl` instead.
 */
const avatar = asyncHandler(async (req, res) => {
  const payload = bodyOf(req);
  const user = await userService.uploadAvatar(req.userId, {
    file: req.file ?? null,
    avatarUrl: payload.avatarUrl ?? payload.url ?? payload.path,
  });
  return ApiResponse.send(res, { user });
});

const changePassword = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, { user: await userService.changePassword(req.userId, bodyOf(req), { req }) });
});

const removeAccount = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, await userService.deleteAccount(req.userId, bodyOf(req), { res }));
});

const search = asyncHandler(async (req, res) => {
  const { items, meta } = await userService.searchUsers(queryOf(req));
  return ApiResponse.paginated(res, items, meta);
});

module.exports = { me, update, avatar, changePassword, removeAccount, search };
