'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const meController = require('../controllers/meController');

const router = express.Router();

router.get('/summary', requireAuth, meController.summary);

module.exports = router;
