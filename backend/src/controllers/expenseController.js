'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const expenseService = require('../services/expenseService');
const { EXPENSE_CATEGORIES, SPLIT_TYPES } = require('../utils/constants');

/**
 * Thin HTTP layer: everything financial happens inside expenseService so the recurring
 * scheduler and tests can call the exact same code path.
 */

const createExpense = asyncHandler(async (req, res) => {
  const groupId = (req.group && req.group._id) || req.params.groupId;
  const body = req.validatedBody || {};
  const expense = await expenseService.createExpense({ groupId, actorId: req.userId, body });
  return ApiResponse.created(res, expense);
});

const listExpenses = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const { items, meta } = await expenseService.listExpenses({ actorId: req.userId, query });
  return ApiResponse.paginated(res, { items }, meta);
});

const getExpense = asyncHandler(async (req, res) => {
  const expense = await expenseService.getExpense({ expenseId: req.params.id, actorId: req.userId });
  return ApiResponse.send(res, expense);
});

const updateExpense = asyncHandler(async (req, res) => {
  const expense = await expenseService.updateExpense({
    expenseId: req.params.id,
    actorId: req.userId,
    body: req.validatedBody || {},
  });
  return ApiResponse.send(res, expense);
});

const deleteExpense = asyncHandler(async (req, res) => {
  const reason = (req.validatedBody && req.validatedBody.reason) || undefined;
  const result = await expenseService.deleteExpense({ expenseId: req.params.id, actorId: req.userId, reason });
  return ApiResponse.send(res, result);
});

const attachReceipt = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No receipt file received in the "receipt" field');
  const expense = await expenseService.attachReceipt({
    expenseId: req.params.id,
    actorId: req.userId,
    file: req.file,
  });
  return ApiResponse.send(res, { expense });
});

const removeReceipt = asyncHandler(async (req, res) => {
  const expense = await expenseService.removeReceipt({ expenseId: req.params.id, actorId: req.userId });
  return ApiResponse.send(res, { expense });
});

const getAuditTrail = asyncHandler(async (req, res) => {
  const entries = await expenseService.getAuditTrail({ expenseId: req.params.id, actorId: req.userId });
  return ApiResponse.send(res, entries);
});

const categories = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, {
    categories: EXPENSE_CATEGORIES.map(({ value, label, icon }) => ({ value, label, icon })),
  });
});

const splitTypes = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, {
    splitTypes: SPLIT_TYPES.map(({ value, label, hint }) => ({ value, label, hint })),
  });
});

module.exports = {
  createExpense,
  listExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
  attachReceipt,
  removeReceipt,
  getAuditTrail,
  categories,
  splitTypes,
};
