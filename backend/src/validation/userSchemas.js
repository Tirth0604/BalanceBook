'use strict';

const { z } = require('zod');
const { field } = require('./authSchemas');

const { text, currency, password } = field;

/** Mirrors `User.notificationPreferences`; unknown keys are stripped, not persisted. */
const notificationPreferences = z.object({
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
  expenseAdded: z.boolean().optional(),
  expenseUpdated: z.boolean().optional(),
  settlementRequested: z.boolean().optional(),
  settlementConfirmed: z.boolean().optional(),
  budgetAlerts: z.boolean().optional(),
});

const updateProfile = z.object({
  name: text({ min: 2, max: 80, required: false }),
  phone: text({ max: 20, required: false }),
  preferredCurrency: currency.optional(),
  notificationPreferences: notificationPreferences.optional(),
});

const changePassword = z.object({
  currentPassword: z.string({ required_error: 'Current password is required' }).min(1).max(128),
  newPassword: password,
});

/**
 * Avatar hand-off: with a storage driver configured the multipart file is stored by
 * `storageService`; this body carries the already-saved relative path for clients that
 * upload out-of-band.
 */
const avatar = z.object({
  avatarUrl: text({ max: 500, required: false }),
  url: text({ max: 500, required: false }),
  path: text({ max: 500, required: false }),
});

const deleteAccount = z.object({
  confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm this action' }) }),
});

/** Invite-name lookup: `q` is matched against the full email or a name prefix. */
const searchQuery = z.object({
  q: text({ min: 1, max: 80 }),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

module.exports = {
  updateProfile,
  changePassword,
  avatar,
  deleteAccount,
  searchQuery,
  notificationPreferences,
};
