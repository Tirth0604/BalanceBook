'use strict';

const express = require('express');
const config = require('../config/env');
const razorpayService = require('../services/razorpayService');
const { requireAuth } = require('../middleware/authMiddleware');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');

const router = express.Router();

/**
 * Returns Razorpay public Key ID for client initialization.
 */
router.get('/key', (req, res) => {
  return ApiResponse.send(res, { keyId: config.RAZORPAY_KEY_ID });
});

/**
 * Direct Razorpay order creation endpoint.
 */
router.post('/order', requireAuth, async (req, res, next) => {
  try {
    const { amount, amountMinor, currency = 'INR', receipt, notes = {} } = req.body;
    const finalAmountMinor = amountMinor ? Number(amountMinor) : Math.round(Number(amount) * 100);

    if (!finalAmountMinor || finalAmountMinor <= 0) {
      throw ApiError.badRequest('Amount must be greater than zero');
    }

    const order = await razorpayService.createOrder({
      amountMinor: finalAmountMinor,
      currency,
      receipt,
      notes: { ...notes, userId: String(req.userId) },
    });

    return ApiResponse.send(res, order);
  } catch (err) {
    next(err);
  }
});

/**
 * Direct payment verification endpoint.
 */
router.post('/verify', requireAuth, (req, res, next) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw ApiError.badRequest('Missing Razorpay payment details');
    }

    const isValid = razorpayService.verifyPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!isValid) {
      throw ApiError.badRequest('Invalid payment signature');
    }

    return ApiResponse.send(res, {
      success: true,
      verified: true,
      paymentId: razorpayPaymentId,
      orderId: razorpayOrderId,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
