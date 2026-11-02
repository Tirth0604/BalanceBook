'use strict';

const express = require('express');

const { requireAuth } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const ApiError = require('../utils/ApiError');
const schemas = require('../validation/recurringSchemas');
const controller = require('../controllers/recurringController');

/**
 * This router is mounted twice by routes/index.js — group-scoped (/groups/:id/recurring) and
 * top-level (/recurring) — on ONE instance, so mergeParams is what makes `:id` visible on the
 * group face while the item routes (`:recurringId`) work identically on both.
 */
const router = express.Router({ mergeParams: true });

/**
 * A rule needs exactly one group. On the group face it comes from the path; on the top level
 * the body must name it, otherwise the request would create a rule for an unknown group.
 */
function requireGroupTarget(req, res, next) {
  if (req.params.id || (req.validatedBody && req.validatedBody.groupId)) return next();
  return next(ApiError.unprocessable('groupId is required when creating a rule outside a group route', [
    { path: 'groupId', message: 'Post to /groups/:id/recurring or send groupId in the body' },
  ]));
}

router.get('/', requireAuth, validate({ query: schemas.listRecurringQuery }), controller.list);
router.post(
  '/',
  requireAuth,
  validate({ body: schemas.createRecurring }),
  requireGroupTarget,
  controller.create,
);

router.get('/:recurringId', requireAuth, validate({ params: schemas.recurringParams }), controller.get);
router.patch(
  '/:recurringId',
  requireAuth,
  validate({ params: schemas.recurringParams, body: schemas.updateRecurring }),
  controller.update,
);
router.delete('/:recurringId', requireAuth, validate({ params: schemas.recurringParams }), controller.remove);

// Pause / resume never retroactively bill: the missed dates are reported, not generated.
router.post('/:recurringId/pause', requireAuth, validate({ params: schemas.recurringParams }), controller.pause);
router.post('/:recurringId/resume', requireAuth, validate({ params: schemas.recurringParams }), controller.resume);
router.get(
  '/:recurringId/history',
  requireAuth,
  validate({ params: schemas.recurringParams, query: schemas.listRecurringQuery }),
  controller.history,
);

module.exports = router;
