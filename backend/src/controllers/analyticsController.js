'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const analyticsService = require('../services/analyticsService');

/**
 * Thin HTTP layer over analyticsService. The scope/authorization decision lives in the
 * service (resolveScope), so these handlers never trust a client-supplied group list.
 */

const overview = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const data = await analyticsService.overview({ userId: req.userId, query });
  return ApiResponse.send(res, data);
});

const categories = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const data = await analyticsService.categories({ userId: req.userId, query });
  return ApiResponse.send(res, data);
});

const members = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const data = await analyticsService.members({ userId: req.userId, query });
  return ApiResponse.send(res, data);
});

const trend = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const data = await analyticsService.trend({ userId: req.userId, query });
  return ApiResponse.send(res, data);
});

/** Cross-group dashboard rollup; every figure reconciles with the derived balances. */
const dashboard = asyncHandler(async (req, res) => {
  const data = await analyticsService.dashboard({ userId: req.userId });
  return ApiResponse.send(res, data);
});

/** Single-group reconciliation report (aggregation vs derived balances). Names one group. */
const reconcile = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const groupId = req.validatedParams?.id || req.params.id || query.groupId;
  const data = await analyticsService.groupReconciliation({ userId: req.userId, groupId, query });
  return ApiResponse.send(res, data);
});

/**
 * CSV download. This is the one endpoint that does NOT use the JSON envelope: it streams a
 * text/csv body with the RFC filename, exactly like a spreadsheet export should.
 */
const exportCsv = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const { csv, filename, rowCount } = await analyticsService.exportCsv({ userId: req.userId, query });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
  res.setHeader('X-Row-Count', String(rowCount));
  return res.status(200).send(csv);
});

module.exports = { overview, categories, members, trend, dashboard, reconcile, exportCsv };
