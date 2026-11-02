'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireGroupMember } = require('../middleware/roleMiddleware');
const { groupParams } = require('../validation/groupSchemas');
const { suggestQuery, listGroupSettlementsQuery } = require('../validation/settlementSchemas');
const validate = require('../middleware/validationMiddleware').validate;
const balanceController = require('../controllers/balanceController');
const settlementController = require('../controllers/settlementController');

const router = express.Router({ mergeParams: true });

// `/suggested` is registered before `/` so the literal path is never shadowed.
router.get(
  '/suggested',
  requireAuth,
  validate({ params: groupParams, query: suggestQuery }),
  requireGroupMember,
  balanceController.getSuggested,
);

router.get(
  '/',
  requireAuth,
  validate({ params: groupParams, query: listGroupSettlementsQuery }),
  requireGroupMember,
  settlementController.listForGroup,
);

module.exports = router;
