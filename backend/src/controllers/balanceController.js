'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const balanceService = require('../services/balanceService');

/**
 * `GET /groups/:id/balances` — the balance list is the payload and the group summary
 * (total + settled-up) travels in `meta`, matching the contract.
 */
const getBalances = asyncHandler(async (req, res) => {
  const result = await balanceService.computeGroupBalances(req.groupId, { viewerId: req.userId });
  return ApiResponse.send(res, result.members, {
    meta: { groupTotalMinor: result.groupTotalMinor, isSettledUp: result.isSettledUp },
  });
});

/** `GET /groups/:id/settlements/suggested` — optimised plan for the group ledger. */
const getSuggested = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const suggested = await balanceService.suggestSettlements(req.groupId, {
    algorithm: query.algorithm,
    maxSize: query.maxSize,
  });
  return ApiResponse.send(res, suggested);
});

module.exports = { getBalances, getSuggested };
