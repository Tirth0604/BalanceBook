'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireGroupMember } = require('../middleware/roleMiddleware');
const { groupParams } = require('../validation/groupSchemas');
const validate = require('../middleware/validationMiddleware').validate;
const balanceController = require('../controllers/balanceController');

const router = express.Router({ mergeParams: true });

router.get('/', requireAuth, validate({ params: groupParams }), requireGroupMember, balanceController.getBalances);

module.exports = router;
