'use strict';

const express = require('express');

const { requireAuth } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const schemas = require('../validation/analyticsSchemas');
const controller = require('../controllers/notificationController');

/** Mounted by src/routes/index.js at /notifications. */
const router = express.Router();

/**
 * Every handler passes `req.userId` into the service, which filters each query by it, so a
 * caller can neither read nor mutate another user's inbox — there is no "as user" parameter.
 */
router.get('/', requireAuth, validate({ query: schemas.notificationQuery }), controller.list);
router.get('/unread-count', requireAuth, controller.unreadCount);
router.post('/read-all', requireAuth, controller.markAllRead);
router.patch('/:id/read', requireAuth, validate({ params: schemas.notificationParams }), controller.markRead);
router.delete('/:id', requireAuth, validate({ params: schemas.notificationParams }), controller.remove);

module.exports = router;
