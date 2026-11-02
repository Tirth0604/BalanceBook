'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const settlementService = require('../services/settlementService');

/** Idempotency may arrive in the body or the `X-Idempotency-Key` header. */
function readIdempotencyKey(req, body) {
  return req.headers['x-idempotency-key'] || body.idempotencyKey || null;
}

const record = asyncHandler(async (req, res) => {
  const body = req.validatedBody;
  const { settlement, created, replayed } = await settlementService.recordSettlement(body, {
    viewerId: req.userId,
    idempotencyKey: readIdempotencyKey(req, body),
  });
  const dto = settlementService.toSettlementDto(settlement, req.userId);

  // A replayed idempotency key returns the original settlement with 200, not a new 201.
  if (replayed || !created) return ApiResponse.send(res, dto);
  return ApiResponse.created(res, dto);
});

const confirm = asyncHandler(async (req, res) => {
  const dto = await settlementService.confirmSettlement(req.params.id, req.userId);
  return ApiResponse.send(res, dto);
});

const reject = asyncHandler(async (req, res) => {
  const body = req.validatedBody || {};
  const dto = await settlementService.rejectSettlement(req.params.id, req.userId, { reason: body.reason });
  return ApiResponse.send(res, dto);
});

const dispute = asyncHandler(async (req, res) => {
  const body = req.validatedBody || {};
  const dto = await settlementService.disputeSettlement(req.params.id, req.userId, { reason: body.reason });
  return ApiResponse.send(res, dto);
});

const cancel = asyncHandler(async (req, res) => {
  const dto = await settlementService.cancelSettlement(req.params.id, req.userId);
  return ApiResponse.send(res, dto);
});

/** `GET /groups/:id/settlements` — membership already proven by the route guard. */
const listForGroup = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const items = await settlementService.listSettlements(req.groupId, { status: query.status, viewerId: req.userId });
  return ApiResponse.send(res, items);
});

/** `GET /settlements` — every settlement the caller is on either side of. */
const listForMe = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const { items, meta } = await settlementService.listForUser(req.userId, query);
  return ApiResponse.paginated(res, items, meta);
});

const history = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const groups = await settlementService.history(req.userId, { groupId: query.groupId });
  return ApiResponse.send(res, groups);
});

module.exports = { record, confirm, reject, dispute, cancel, listForGroup, listForMe, history };
