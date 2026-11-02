'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const recurringService = require('../services/recurringExpenseService');

/**
 * A recurring rule is a template, never a charge. These handlers only create/pause/resume/
 * remove rules and read their generated history; materialisation of an occurrence is driven by
 * the scheduler, not by any of these endpoints, and it writes only visible Expense records.
 *
 * The router is mounted twice (group-scoped `/groups/:id/recurring` and top-level
 * `/recurring/:recurringId`), so `groupId` comes from `:id` when present and otherwise from
 * the body/query; `recurringId` always addresses the rule itself.
 */

const create = asyncHandler(async (req, res) => {
  const data = await recurringService.createRecurrence({
    actorId: req.userId,
    groupId: req.params.id,
    body: req.validatedBody || {},
  });
  return ApiResponse.created(res, data);
});

const list = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const { items, meta } = await recurringService.listRecurrences({
    actorId: req.userId,
    groupId: req.params.id || query.groupId,
    query,
  });
  return ApiResponse.paginated(res, items, meta);
});

const get = asyncHandler(async (req, res) => {
  const data = await recurringService.getRecurrence({ actorId: req.userId, recurringId: req.params.recurringId });
  return ApiResponse.send(res, data);
});

const update = asyncHandler(async (req, res) => {
  const data = await recurringService.updateRecurrence({
    actorId: req.userId,
    recurringId: req.params.recurringId,
    body: req.validatedBody || {},
  });
  return ApiResponse.send(res, data);
});

const remove = asyncHandler(async (req, res) => {
  const data = await recurringService.removeRecurrence({ actorId: req.userId, recurringId: req.params.recurringId });
  return ApiResponse.send(res, data);
});

const pause = asyncHandler(async (req, res) => {
  const { recurrence, skippedOccurrences } = await recurringService.pauseRecurrence({
    actorId: req.userId,
    recurringId: req.params.recurringId,
  });
  return ApiResponse.send(res, { recurrence, skippedOccurrences });
});

const resume = asyncHandler(async (req, res) => {
  const { recurrence, skippedOccurrences } = await recurringService.resumeRecurrence({
    actorId: req.userId,
    recurringId: req.params.recurringId,
  });
  return ApiResponse.send(res, { recurrence, skippedOccurrences });
});

const history = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const data = await recurringService.occurrenceHistory({ actorId: req.userId, recurringId: req.params.recurringId, query });
  return ApiResponse.send(res, data, { meta: data.meta });
});

module.exports = { create, list, get, update, remove, pause, resume, history };
