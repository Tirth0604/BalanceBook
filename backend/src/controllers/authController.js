'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const authService = require('../services/authService');

/**
 * `middleware/validationMiddleware` stores the parsed payload next to the raw request, so
 * controllers read the validated copy and fall back to the raw one when no schema ran.
 */
const bodyOf = (req) => req.validatedBody ?? req.body ?? {};

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(bodyOf(req), { req, res });
  return ApiResponse.created(res, result);
});

const login = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, await authService.login(bodyOf(req), { req, res }));
});

const refresh = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, await authService.refresh({ req, res }));
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout({ req, res });
  return ApiResponse.send(res, null);
});

const forgotPassword = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, await authService.forgotPassword(bodyOf(req)));
});

const resetPassword = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, await authService.resetPassword(bodyOf(req), { res }));
});

const verifyEmail = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, await authService.verifyEmail(bodyOf(req)));
});

const verifyOtp = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, await authService.verifyOtp(bodyOf(req), { req, res }));
});

const resendOtp = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, await authService.resendOtp(bodyOf(req)));
});

const me = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, { user: await authService.me(req.userId) });
});

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
};
