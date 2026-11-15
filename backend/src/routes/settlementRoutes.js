'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  recordSettlement,
  settlementParams,
  rejectBody,
  disputeBody,
  emptyBody,
  listMySettlementsQuery,
  historyQuery,
  createRazorpayOrder,
  verifyRazorpayPayment,
} = require('../validation/settlementSchemas');
const validate = require('../middleware/validationMiddleware').validate;
const settlementController = require('../controllers/settlementController');

const router = express.Router();

router.post('/', requireAuth, validate({ body: recordSettlement }), settlementController.record);

router.post(
  '/razorpay/create-order',
  requireAuth,
  validate({ body: createRazorpayOrder }),
  settlementController.createRazorpayOrder,
);

router.post(
  '/razorpay/verify',
  requireAuth,
  validate({ body: verifyRazorpayPayment }),
  settlementController.verifyRazorpayPayment,
);

router.post('/razorpay/webhook', settlementController.razorpayWebhook);

router.get('/', requireAuth, validate({ query: listMySettlementsQuery }), settlementController.listForMe);
// Static `/history` must precede any `/:id` style match to avoid being captured by it.
router.get('/history', requireAuth, validate({ query: historyQuery }), settlementController.history);

router.post(
  '/:id/confirm',
  requireAuth,
  validate({ params: settlementParams, body: emptyBody }),
  settlementController.confirm,
);
router.post(
  '/:id/reject',
  requireAuth,
  validate({ params: settlementParams, body: rejectBody }),
  settlementController.reject,
);
router.post(
  '/:id/dispute',
  requireAuth,
  validate({ params: settlementParams, body: disputeBody }),
  settlementController.dispute,
);
router.post(
  '/:id/cancel',
  requireAuth,
  validate({ params: settlementParams, body: emptyBody }),
  settlementController.cancel,
);

module.exports = router;
