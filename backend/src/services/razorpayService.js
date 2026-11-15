'use strict';

const crypto = require('crypto');
const Razorpay = require('razorpay');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

let razorpayClientInstance = null;

function getRazorpayClient() {
  if (!razorpayClientInstance) {
    if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
      throw ApiError.internal('Razorpay credentials are not configured');
    }
    razorpayClientInstance = new Razorpay({
      key_id: config.RAZORPAY_KEY_ID,
      key_secret: config.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayClientInstance;
}

/**
 * Creates a Razorpay order.
 * Note: Razorpay accepts `amount` in minor units (paise for INR).
 *
 * @param {object} params
 * @param {number} params.amountMinor - Integer minor units
 * @param {string} [params.currency='INR'] - Currency code
 * @param {string} [params.receipt] - Receipt string (e.g. receipt_settlement_id)
 * @param {object} [params.notes] - Key-value metadata
 * @returns {Promise<object>} Razorpay order
 */
async function createOrder({ amountMinor, currency = 'INR', receipt, notes = {} }) {
  if (!amountMinor || amountMinor <= 0) {
    throw ApiError.badRequest('Amount must be greater than zero');
  }

  const client = getRazorpayClient();
  const options = {
    amount: Math.round(amountMinor),
    currency: (currency || 'INR').toUpperCase(),
    receipt: receipt || `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    notes: {
      ...notes,
      platform: 'BalanceBook',
    },
  };

  try {
    const order = await client.orders.create(options);
    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status,
      keyId: config.RAZORPAY_KEY_ID,
    };
  } catch (err) {
    console.error('[razorpay] order creation failed:', err.message);
    throw ApiError.badRequest(err.error?.description || err.message || 'Failed to create Razorpay order');
  }
}

/**
 * Verifies the Razorpay payment signature HMAC SHA-256.
 *
 * @param {object} params
 * @param {string} params.razorpayOrderId
 * @param {string} params.razorpayPaymentId
 * @param {string} params.razorpaySignature
 * @returns {boolean}
 */
function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return false;
  }

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const signatureBuffer = Buffer.from(razorpaySignature, 'utf8');

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

/**
 * Verifies webhook signature against raw request payload.
 *
 * @param {string|Buffer} rawBody
 * @param {string} signature
 * @param {string} [secret]
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signature, secret = config.RAZORPAY_WEBHOOK_SECRET) {
  if (!signature || !secret) return false;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const signatureBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

/**
 * Fetches payment details from Razorpay.
 *
 * @param {string} paymentId
 * @returns {Promise<object>}
 */
async function fetchPayment(paymentId) {
  const client = getRazorpayClient();
  try {
    return await client.payments.fetch(paymentId);
  } catch (err) {
    console.error('[razorpay] fetch payment failed:', err.message);
    throw ApiError.badRequest(err.error?.description || err.message || 'Failed to fetch Razorpay payment');
  }
}

module.exports = {
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPayment,
  getRazorpayClient,
};
