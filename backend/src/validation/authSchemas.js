'use strict';

const { z } = require('zod');

/**
 * Shared field primitives.
 *
 * Unknown body keys are stripped by zod's default (non-strict) object behaviour, and every
 * leaf is typed, so a Mongo operator payload such as `{ "email": { "$ne": null } }` fails the
 * string check instead of reaching a query. The explicit leading-`$` guard covers the one
 * case that would still be a syntactically valid string (`"$gt"`).
 */
function text({ min = 1, max = 200, required = true, allowOperator = false } = {}) {
  let schema = z.string().trim().max(max, `Must be at most ${max} characters`);
  if (required) schema = schema.min(min, `Must be at least ${min} characters`);
  if (!allowOperator) {
    schema = schema.refine((value) => !value.startsWith('$'), 'Must not start with "$"');
  }
  return required ? schema : schema.optional();
}

const email = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .email('Enter a valid email address')
  .refine((value) => !value.startsWith('$'), 'Email is not valid');

/**
 * 8+ characters with an upper-case, a lower-case and a digit. The 128 ceiling protects the
 * bcrypt cost-12 work factor from a deliberately huge input.
 */
const password = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lower-case letter')
  .regex(/[A-Z]/, 'Password must contain an upper-case letter')
  .regex(/[0-9]/, 'Password must contain a digit');

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code');

const objectId = (label = 'id') => z.string().trim().regex(/^[0-9a-f]{24}$/i, `Invalid ${label}`);

const token = z
  .string()
  .trim()
  .min(16, 'Token is invalid')
  .max(200, 'Token is invalid')
  .refine((value) => !value.startsWith('$'), 'Token is invalid');

/** Page/limit accept query strings; `utils/pagination.js` stays the canonical coercion. */
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: text({ max: 60, required: false }),
});

const register = z.object({
  name: text({ min: 2, max: 80 }),
  email,
  password,
  preferredCurrency: currency.optional(),
});

const login = z.object({
  email,
  // Login does not re-check strength: an old account may predate the current policy.
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
    .max(128),
});

const refresh = z.object({
  // Normal clients rely on the httpOnly cookie; the body copy is for non-browser callers.
  refreshToken: z.string().trim().min(16).max(200).optional(),
});

const forgotPassword = z.object({ email });

const resetPassword = z.object({ token, password });

const verifyEmail = z.object({ token });

module.exports = {
  register,
  login,
  refresh,
  forgotPassword,
  resetPassword,
  verifyEmail,
  field: { text, email, password, currency, objectId, token, pageQuery },
};
