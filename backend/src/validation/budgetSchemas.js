'use strict';

const { z } = require('zod');
const { field } = require('./authSchemas');
const { dateInput } = require('./analyticsSchemas');
const { categoryValues, BUDGET_SCOPES } = require('../utils/constants');

const { text, currency, objectId, pageQuery } = field;

const amountString = z
  .string({ required_error: 'An amount is required' })
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a positive decimal number');

const periodKey = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, 'periodKey must look like 2026-11');

/**
 * `PUT /groups/:id/budgets` is an upsert keyed on (scope, category, periodKey), so the body
 * has to identify the plan as well as set its limit. A monthly budget without a period is
 * allowed: the service stamps the current month, which is what "this month's budget" means.
 */
const upsertBudget = z
  .object({
    scope: z.enum(BUDGET_SCOPES).default(BUDGET_SCOPES.GROUP_TOTAL),
    category: z.enum(categoryValues).optional(),
    label: text({ max: 80, required: false }),
    limit: amountString,
    currency: currency.optional(),
    period: z.enum(['overall', 'monthly']).default('monthly'),
    periodKey: periodKey.optional(),
    startDate: dateInput.optional(),
    endDate: dateInput.optional(),
    alertThresholds: z
      .array(z.coerce.number().int().min(1).max(1000))
      .max(10, 'At most 10 alert thresholds')
      .optional(),
    isActive: z.boolean().optional(),
    groupId: objectId('group id').optional(),
  })
  .refine((value) => value.scope !== BUDGET_SCOPES.CATEGORY || Boolean(value.category), {
    message: 'A category budget must name its category',
    path: ['category'],
  })
  .refine((value) => !value.endDate || !value.startDate || new Date(value.endDate) >= new Date(value.startDate), {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

// Top-level mounts (`GET /budgets`) have no `:id`, so the group must come from the query.
const listBudgetQuery = pageQuery.extend({
  groupId: objectId('group id').optional(),
  scope: z.enum(BUDGET_SCOPES).optional(),
  category: z.enum(categoryValues).optional(),
  includeInactive: z.boolean().optional(),
});

// Mounted twice (group-scoped and top level), so `:id` may legitimately be absent.
const budgetParams = z.object({
  id: objectId('group id').optional(),
  budgetId: objectId('budget id'),
});

module.exports = { upsertBudget, listBudgetQuery, budgetParams, amountString, periodKey };
