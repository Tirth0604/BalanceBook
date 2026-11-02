'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const settlementService = require('../services/settlementService');

/** `GET /me/summary` — cross-group owed / owed-to-me / net plus pending confirmations. */
const summary = asyncHandler(async (req, res) => {
  const data = await settlementService.mySummary(req.userId, { currency: req.user.preferredCurrency });
  return ApiResponse.send(res, data);
});

module.exports = { summary };
