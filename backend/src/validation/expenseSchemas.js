'use strict';

const { z } = require('zod');
const { categoryValues, splitTypeValues } = require('../utils/constants');
const { field } = require('./authSchemas');

const { text, currency, objectId, pageQuery } = field;

/**
 * Amounts travel as decimal strings (or plain numbers); the money engine is the
 * authority on per-currency precision, so the schema only rejects obvious junk here.
 */
const amountValue = z
  .union([z.string().trim(), z.number()])
  .transform((value) => String(value))
  .refine((value) => /^-?\d{1,14}(\.\d{1,4})?$/.test(value), 'Amount must be a plain decimal number');

const percentageValue = z
  .union([z.string().trim(), z.number()])
  .transform((value) => String(value))
  .refine((value) => /^\d{1,3}(\.\d{1,4})?$/.test(value), 'Percentage must be a number with at most 2 decimals');

const participantInput = z.object({
  userId: objectId('participant userId'),
  share: amountValue.optional(),
  percentage: percentageValue.optional(),
});

const participantsInput = z
  .array(participantInput)
  .min(1, 'An expense needs at least one participant')
  .max(50, 'An expense can have at most 50 participants');

const expenseDateValue = z
  .union([z.string().trim(), z.date()])
  .optional()
  .refine((value) => value === undefined || !Number.isNaN(new Date(value).getTime()), 'expenseDate is not a valid date');

const createExpense = z.object({
  title: text({ min: 1, max: 120 }),
  description: text({ max: 1000, required: false }),
  category: z.enum(categoryValues).optional(),
  tags: z.array(text({ max: 40 })).max(10, 'At most 10 tags').optional(),
  amount: amountValue,
  currency: currency.optional(),
  exchangeRate: z.coerce.number().positive().finite().optional(),
  expenseDate: expenseDateValue,
  paidBy: objectId('paidBy'),
  splitType: z.enum(splitTypeValues),
  participants: participantsInput,
  notes: text({ max: 500, required: false }),
});

/**
 * PATCH is a full re-split: when any financial field changes, the server recomputes every
 * share from the merged (body over stored) inputs, so every field here is optional.
 */
const updateExpense = z.object({
  title: text({ min: 1, max: 120, required: false }),
  description: text({ max: 1000, required: false }),
  category: z.enum(categoryValues).optional(),
  tags: z.array(text({ max: 40 })).max(10, 'At most 10 tags').optional(),
  amount: amountValue.optional(),
  currency: currency.optional(),
  exchangeRate: z.coerce.number().positive().finite().optional(),
  expenseDate: expenseDateValue,
  paidBy: objectId('paidBy').optional(),
  splitType: z.enum(splitTypeValues).optional(),
  participants: participantsInput.optional(),
  notes: text({ max: 500, required: false }),
});

const deleteExpense = z.object({ reason: text({ max: 300, required: false }) }).optional().default({});

const expenseParams = z.object({ id: objectId('expense id') });
const groupExpenseParams = z.object({ groupId: objectId('group id') });

const listExpensesQuery = pageQuery.extend({
  search: text({ max: 120, required: false }),
  category: z.enum(categoryValues).optional(),
  groupId: objectId('group id').optional(),
  paidBy: objectId('user id').optional(),
  tag: text({ max: 40, required: false }),
  from: text({ max: 40, required: false }),
  to: text({ max: 40, required: false }),
  range: z
    .enum(['all', '7d', '30d', '90d', 'this_month', 'last_month', 'this_year', 'custom'])
    .optional(),
  minAmount: amountValue.optional(),
  maxAmount: amountValue.optional(),
});

module.exports = {
  createExpense,
  updateExpense,
  deleteExpense,
  expenseParams,
  groupExpenseParams,
  listExpensesQuery,
  amountValue,
  percentageValue,
  participantInput,
};
