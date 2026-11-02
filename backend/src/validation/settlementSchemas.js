'use strict';

const { z } = require('zod');
const { PAYMENT_METHODS, SETTLEMENT_STATUS } = require('../utils/constants');
const { field } = require('./authSchemas');

const { objectId, pageQuery } = field;

const settlementStatusValues = Object.values(SETTLEMENT_STATUS);

/**
 * Amounts travel as decimal strings (never client-computed minor units); the service
 * converts with `money.toMinor`. Up to two decimals matches every supported 2-decimal
 * currency, and any finer value is rejected here rather than silently rounded later.
 */
const decimalAmount = z
  .string()
  .trim()
  .regex(/^\d{1,15}(\.\d{1,2})?$/, 'Amount must be a positive decimal string')
  .refine((value) => Number(value) > 0, 'Amount must be greater than zero');

const recordSettlement = z.object({
  groupId: objectId('group id'),
  payerId: objectId('payer id'),
  receiverId: objectId('receiver id'),
  amount: decimalAmount,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code')
    .optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  note: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
});

const settlementParams = z.object({ id: objectId('settlement id') });

// A rejection without a reason is meaningless for the payer, so it is required here.
const rejectBody = z.object({
  reason: z
    .string({ required_error: 'A reason is required' })
    .trim()
    .min(1, 'A reason is required')
    .max(300, 'Reason must be at most 300 characters'),
});

const disputeBody = z.object({
  reason: z.string().trim().max(300).optional(),
});

const emptyBody = z.object({}).passthrough();

const suggestQuery = z.object({
  algorithm: z.enum(['greedy', 'minimum']).default('minimum'),
  maxSize: z.coerce.number().int().min(2).max(20).optional(),
});

const listGroupSettlementsQuery = z.object({
  status: z.enum(settlementStatusValues).optional(),
});

const listMySettlementsQuery = pageQuery.extend({
  direction: z.enum(['to_me', 'from_me']).optional(),
  status: z.enum(settlementStatusValues).optional(),
  groupId: objectId('group id').optional(),
});

const historyQuery = pageQuery.extend({
  groupId: objectId('group id').optional(),
});

module.exports = {
  recordSettlement,
  settlementParams,
  rejectBody,
  disputeBody,
  emptyBody,
  suggestQuery,
  listGroupSettlementsQuery,
  listMySettlementsQuery,
  historyQuery,
};
