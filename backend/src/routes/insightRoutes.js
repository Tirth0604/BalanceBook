'use strict';

const express = require('express');

const { requireAuth } = require('../middleware/authMiddleware');
const { requireGroupMember } = require('../middleware/roleMiddleware');
const validate = require('../middleware/validationMiddleware').validate;
const { groupParams } = require('../validation/groupSchemas');
const { insightsQuery } = require('../validation/analyticsSchemas');
const controller = require('../controllers/insightController');

// Mounted group-scoped on /groups/:id/insights.
const router = express.Router({ mergeParams: true });

router.get(
  '/',
  requireAuth,
  validate({ params: groupParams, query: insightsQuery }),
  requireGroupMember,
  controller.forGroup,
);

/**
 * The second face of the same engine: the caller's own account, no group in the path.
 * Mounted by routes/index.js on /insights, so GET /api/v1/insights. `requireAuth` is the
 * only gate because there is no group to belong to — `personalInsights` scopes every
 * aggregation to the groups the caller is an active member of, so a token cannot ask for
 * someone else's numbers and there is no membership check to bypass.
 *
 * The group router above is `mergeParams` and validates a required `:id`, so this has to be
 * its own Router instance: mounting the same instance twice would make /insights inherit
 * the group path params and 400.
 */
const personal = express.Router();

personal.get('/', requireAuth, validate({ query: insightsQuery }), controller.forMe);

module.exports = router;
module.exports.personal = personal;
