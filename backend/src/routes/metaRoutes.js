'use strict';

const express = require('express');

const { requireAuth } = require('../middleware/authMiddleware');
const controller = require('../controllers/expenseController');

/** Vocabulary endpoints so the UI never hard-codes categories or split types. */
const router = express.Router();

router.get('/categories', requireAuth, controller.categories);
router.get('/split-types', requireAuth, controller.splitTypes);

module.exports = router;
