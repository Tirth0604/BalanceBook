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

module.exports = router;
