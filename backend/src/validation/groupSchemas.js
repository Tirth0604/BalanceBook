'use strict';

const { z } = require('zod');
const { groupCategoryValues, GROUP_ROLE } = require('../utils/constants');
const { field } = require('./authSchemas');

const { text, email, currency, objectId, pageQuery } = field;

const role = z.enum([GROUP_ROLE.ADMIN, GROUP_ROLE.MEMBER]);

const createGroup = z.object({
  name: text({ min: 2, max: 80 }),
  description: text({ max: 500, required: false }),
  category: z.enum(groupCategoryValues).optional(),
  imageUrl: text({ max: 500, required: false }),
  baseCurrency: currency.optional(),
  members: z
    .array(email)
    .max(50, 'Invite at most 50 people at a time')
    .optional()
    // Dedupe here so a repeated address in one call cannot trip the unique-member check.
    .transform((list) => (list ? Array.from(new Set(list)) : undefined)),
});

const updateGroup = z.object({
  name: text({ min: 2, max: 80, required: false }),
  description: text({ max: 500, required: false }),
  category: z.enum(groupCategoryValues).optional(),
  imageUrl: text({ max: 500, required: false }),
  baseCurrency: currency.optional(),
  isArchived: z.boolean().optional(),
});

const triState = z
  .union([z.enum(['true', 'false', 'all']), z.boolean()])
  .optional()
  .transform((value) => {
    if (value === undefined) return 'false';
    if (typeof value === 'boolean') return String(value);
    return value;
  });

const listGroupsQuery = pageQuery.extend({
  archived: triState,
  category: z.enum(groupCategoryValues).optional(),
  search: text({ max: 60, required: false }),
});

const inviteSchema = z.object({
  emails: z
    .array(email)
    .min(1, 'Provide at least one email address')
    .max(50, 'Invite at most 50 people at a time')
    .transform((list) => Array.from(new Set(list))),
});

/** Join codes are generated from an unambiguous alphabet; anything else cannot match. */
const joinByCode = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,16}$/, 'Invitation code is not valid'),
});

const changeRole = z.object({ role });

const groupParams = z.object({ id: objectId('group id') });
const inviteParams = z.object({ id: objectId('group id'), inviteId: objectId('invitation id') });
const memberParams = z.object({ id: objectId('group id'), userId: objectId('user id') });

const listInvitesQuery = pageQuery.extend({
  status: z.enum(['pending', 'accepted', 'declined', 'all']).default('all'),
});

module.exports = {
  createGroup,
  updateGroup,
  listGroupsQuery,
  invite: inviteSchema,
  joinByCode,
  changeRole,
  groupParams,
  inviteParams,
  memberParams,
  listInvitesQuery,
  role,
};
