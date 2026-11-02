'use strict';

const { z } = require('zod');
const { field } = require('./authSchemas');
const { dateInput } = require('./analyticsSchemas');

const { text, currency, objectId, pageQuery } = field;
const { categoryValues, FREQUENCIES, splitTypeValues } = require('../utils/constants');

/**
 * A recurring rule is a template for future ledger entries, so nothing here is trusted:
 * the frequency vocabulary, the interval and the horizon are all bounded, and the amount
 * is a decimal string like every other money input in the API.
 */
const amountString = z
  .string({ required_error: 'An amount is required' })
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a positive decimal number');

const participantTemplate = z.object({
  userId: objectId('participant id'),
  share: amountString.optional(),
  percentage: z.coerce.number().min(0).max(100).optional(),
});

const createRecurring = z
  .object({
    groupId: objectId('group id').optional(),
    title: text({ min: 1, max: 120 }),
    description: text({ max: 1000, required: false }),
    category: z.enum(categoryValues).optional(),
    amount: amountString,
    currency: currency.optional(),
    splitType: z.enum(splitTypeValues).default('equal'),
    paidBy: objectId('payer id').optional(),
    participants: z.array(participantTemplate).min(1).max(200).optional(),
    frequency: z.enum(FREQUENCIES),
    interval: z.coerce.number().int().min(1).max(365).default(1),
    startDate: dateInput,
    endDate: dateInput.optional(),
    maxOccurrences: z.coerce.number().int().min(1).max(1200).optional(),
    notes: text({ max: 500, required: false }),
  })
  .refine((value) => !value.endDate || new Date(value.endDate) >= new Date(value.startDate), {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

const updateRecurring = z
  .object({
    title: text({ min: 1, max: 120, required: false }),
    description: text({ max: 1000, required: false }),
    category: z.enum(categoryValues).optional(),
    amount: amountString.optional(),
    splitType: z.enum(splitTypeValues).optional(),
    participants: z.array(participantTemplate).min(1).max(200).optional(),
    interval: z.coerce.number().int().min(1).max(365).optional(),
    endDate: dateInput.optional(),
    maxOccurrences: z.coerce.number().int().min(1).max(1200).nullable().optional(),
    notes: text({ max: 500, required: false }),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to change' });

// Top-level mounts (`GET /recurring`) have no `:id`, so the group must come from the query.
const listRecurringQuery = pageQuery.extend({
  groupId: objectId('group id').optional(),
  active: z.enum(['true', 'false', 'all']).optional(),
  includeInactive: z.boolean().optional(),
});

// The router is mounted twice: group-scoped routes carry `:id`, top-level ones do not.
const recurringParams = z.object({
  id: objectId('group id').optional(),
  recurringId: objectId('recurring id'),
});

const createRecurringTopLevel = createRecurring.refine(
  (value) => Boolean(value.groupId),
  { message: 'groupId is required when creating outside a group route', path: ['groupId'] },
);

module.exports = {
  FREQUENCIES,
  amountString,
  participantTemplate,
  createRecurring,
  createRecurringTopLevel,
  updateRecurring,
  listRecurringQuery,
  recurringParams,
};
