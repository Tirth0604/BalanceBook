'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const budgetService = require('../services/budgetService');

/**
 * Budgets are group-scoped: create/update (PUT) and list require a group in the path and an
 * active admin (write) or member (read); delete works from the top level and resolves the
 * group from the budget document. All authorization is enforced inside the service.
 */

const upsert = asyncHandler(async (req, res) => {
  const groupId = req.groupId || req.params.id || (req.validatedBody && req.validatedBody.groupId);
  const { budget, created } = await budgetService.upsertBudget({ actorId: req.userId, groupId, body: req.validatedBody || {} });
  return created ? ApiResponse.created(res, budget) : ApiResponse.send(res, budget);
});

const list = asyncHandler(async (req, res) => {
  const groupId = req.groupId || req.params.id || (req.validatedQuery && req.validatedQuery.groupId);
  const data = await budgetService.listBudgets({ actorId: req.userId, groupId, query: req.validatedQuery || req.query });
  return ApiResponse.send(res, data);
});

const get = asyncHandler(async (req, res) => {
  const data = await budgetService.getBudget({ actorId: req.userId, budgetId: req.params.budgetId || req.params.id });
  return ApiResponse.send(res, data);
});

const remove = asyncHandler(async (req, res) => {
  const data = await budgetService.deleteBudget({ actorId: req.userId, budgetId: req.params.budgetId || req.params.id });
  return ApiResponse.send(res, data);
});

module.exports = { upsert, list, get, remove };
