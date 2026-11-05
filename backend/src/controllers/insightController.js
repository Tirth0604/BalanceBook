'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const insightsService = require('../services/insightsService');

/**
 * Rule-based insights. For `/groups/:id/insights` the group is the scope and membership has
 * already been proven by `requireGroupMember`; the service re-checks scope through
 * analyticsService so a member can never surface another group's numbers.
 */

const forGroup = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const data = await insightsService.groupInsights({ userId: req.userId, groupId: req.groupId || req.params.id, query });
  return ApiResponse.send(res, data);
});

/**
 * Personal cross-group insights (`scope=me`), driven by the reconciled dashboard rollup.
 * There is no group in this path and no membership to prove: `personalInsights` passes
 * `groupId: null`, so analyticsService resolves the scope from the caller's own active
 * memberships only — one user can never reach another user's ledger through this route.
 */
const forMe = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const data = await insightsService.personalInsights({ userId: req.userId, query });
  return ApiResponse.send(res, data);
});

module.exports = { forGroup, forMe };
