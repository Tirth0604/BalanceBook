'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const notificationService = require('../services/notificationService');

/**
 * Notifications are always scoped to `req.userId`; there is no path by which one caller reads
 * or mutates another's inbox — the service filters every query by userId.
 */

const list = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const { items, meta } = await notificationService.listForUser(req.userId, query);
  return ApiResponse.paginated(res, items, meta);
});

const unreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.unreadCount(req.userId);
  return ApiResponse.send(res, { unread: count, count });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.userId, req.params.id);
  return ApiResponse.send(res, notification.toJSON());
});

const markAllRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllRead(req.userId);
  return ApiResponse.send(res, result);
});

const remove = asyncHandler(async (req, res) => {
  await notificationService.remove(req.userId, req.params.id);
  return ApiResponse.noContent(res);
});

module.exports = { list, unreadCount, markRead, markAllRead, remove };
