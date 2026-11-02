'use strict';

const express = require('express');

const { requireAuth } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const ApiError = require('../utils/ApiError');
const schemas = require('../validation/budgetSchemas');
const controller = require('../controllers/budgetController');

/**
 * Mounted twice by routes/index.js — /groups/:id/budgets and /budgets — on ONE router
 * instance, hence mergeParams: the group face needs `:id` for the upsert key while
 * `/budgets/:budgetId` addresses a plan directly and resolves its group from the document.
 */
const router = express.Router({ mergeParams: true });

/** A budget plan always belongs to one group: the path id, or the query/body, never a list. */
function requireGroupTarget(req, res, next) {
  const groupId =
    req.params.id || (req.validatedBody && req.validatedBody.groupId) || (req.validatedQuery && req.validatedQuery.groupId);
  if (groupId) {
    req.groupId = String(groupId);
    return next();
  }
  return next(ApiError.badRequest('A group is required: use /groups/:id/budgets or send groupId'));
}

router.get('/', requireAuth, validate({ query: schemas.listBudgetQuery }), requireGroupTarget, controller.list);

/**
 * PUT is the whole write surface: it upserts on (scope, category, periodKey) and answers with
 * the live figures (spentMinor, remainingMinor, percentUsed, thresholdHit, isOverBudget).
 */
router.put('/', requireAuth, validate({ body: schemas.upsertBudget }), requireGroupTarget, controller.upsert);

router.get('/:budgetId', requireAuth, validate({ params: schemas.budgetParams }), controller.get);
router.delete('/:budgetId', requireAuth, validate({ params: schemas.budgetParams }), controller.remove);

module.exports = router;
