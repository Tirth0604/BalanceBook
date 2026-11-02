'use strict';

const { z } = require('zod');
const { field } = require('./authSchemas');

const { objectId, pageQuery } = field;

/**
 * Query strings arrive as text, so every leaf is coerced here and `utils/pagination.js`
 * stays the canonical range resolver. `all` is accepted so a client can say "no window"
 * explicitly instead of omitting the parameter.
 */
const RANGE_VALUES = ['7d', '30d', '90d', 'this_month', 'last_month', 'this_year', 'custom', 'all'];

const dateInput = z
  .string({ required_error: 'A date is required' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, 'Use YYYY-MM-DD or an ISO-8601 date-time')
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Date is not valid');

const optionalDate = dateInput.optional();

const analyticsBase = z.object({
  groupId: objectId('group id').optional(),
  range: z.enum(RANGE_VALUES).optional(),
  from: optionalDate,
  to: optionalDate,
});

/**
 * `?range=custom` is meaningless without both bounds. Applied per schema because a zod
 * refinement returns a wrapper, and a wrapper can no longer be `.extend`ed.
 */
function requireCustomBounds(schema) {
  return schema.refine((value) => value.range !== 'custom' || (value.from && value.to), {
    message: 'range=custom needs both from and to',
    path: ['range'],
  });
}

const analyticsQuery = requireCustomBounds(analyticsBase);

const trendQuery = requireCustomBounds(
  analyticsBase.extend({ granularity: z.enum(['day', 'week', 'month', 'year']).default('month') }),
);

const categoriesQuery = requireCustomBounds(
  analyticsBase.extend({ limit: z.coerce.number().int().min(1).max(50).optional() }),
);

const membersQuery = requireCustomBounds(
  analyticsBase.extend({ limit: z.coerce.number().int().min(1).max(100).optional() }),
);

const csvQuery = requireCustomBounds(
  analyticsBase.extend({ limit: z.coerce.number().int().min(1).max(10000).default(5000) }),
);

/** listForUser() speaks in strings ('true'), so booleans and 0/1 collapse to that here. */
const unreadFlag = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === true || value === 'true' || value === '1') return 'true';
    return 'false';
  });

const notificationQuery = pageQuery.extend({
  unread: unreadFlag,
  type: z.string().trim().max(40).optional(),
  groupId: objectId('group id').optional(),
});

const notificationParams = z.object({ id: objectId('notification id') });

const insightsQuery = z.object({
  scope: z.enum(['group', 'me']).default('group'),
  range: z.enum(RANGE_VALUES).optional(),
  from: optionalDate,
  to: optionalDate,
});

const groupParamOnly = z.object({ id: objectId('group id').optional() });

/** Routes whose whole purpose is one named group (reconciliation) must carry the id. */
const groupPathParams = z.object({ id: objectId('group id') });

module.exports = {
  RANGE_VALUES,
  dateInput,
  analyticsQuery,
  trendQuery,
  categoriesQuery,
  membersQuery,
  csvQuery,
  notificationQuery,
  notificationParams,
  insightsQuery,
  groupParamOnly,
  groupPathParams,
};
