'use strict';

const mongoose = require('mongoose');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const Group = require('../models/Group');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const Expense = require('../models/Expense');
const { GROUP_ROLE, MEMBER_STATUS } = require('../utils/constants');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { withTransaction } = require('../config/db');
const authService = require('./authService');

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MEMBER_FIELDS = 'name email avatarUrl';

let balanceService = null;
try {
  // Balances live in the financial module; membership rules must degrade gracefully if it
  // is not installed yet, and enforce the unsettled-balance guard when it is.
  // eslint-disable-next-line global-require
  balanceService = require('./balanceService');
} catch (error) {
  balanceService = null;
}

let notificationService = null;
try {
  // eslint-disable-next-line global-require
  notificationService = require('./notificationService');
} catch (error) {
  notificationService = null;
}

function sessionOptions(session) {
  return session ? { session } : {};
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toUserRef(user) {
  if (!user || !user._id) return null;
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
  };
}

/**
 * Group documents stay UNPOPULATED on purpose: the model's role helpers compare
 * `String(member.userId)`, which only matches while the field is still an ObjectId.
 * Rosters are therefore hydrated through `usersByIds` for the response only.
 */
function toMemberDto(member, users) {
  const user = users ? users.get(String(member.userId)) : null;
  return {
    // `user` is null for an emailed address that has not joined yet; `email` still names it.
    user: toUserRef(user),
    id: String(member.userId),
    email: user?.email ?? (member.invitedEmail ? String(member.invitedEmail).toLowerCase() : null),
    role: member.role,
    joinedAt: member.joinedAt,
    status: member.status,
  };
}

function toGroupDto(group, viewerId, { users, includeMembers = true } = {}) {
  const viewer = group.findMember(viewerId);
  return {
    id: String(group._id),
    name: group.name,
    description: group.description ?? '',
    category: group.category,
    imageUrl: group.imageUrl ?? null,
    baseCurrency: group.baseCurrency,
    createdBy: toUserRef(users ? users.get(String(group.createdBy)) : null),
    members: includeMembers ? group.members.map((member) => toMemberDto(member, users)) : undefined,
    memberCount: group.activeMembers().length,
    invitationCode: group.invitationCode,
    isArchived: Boolean(group.isArchived),
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    myRole: viewer ? viewer.role : null,
    myStatus: viewer ? viewer.status : null,
  };
}

async function usersByIds(ids) {
  const unique = Array.from(new Set(ids.filter(Boolean).map(String)));
  if (!unique.length) return new Map();
  const users = await User.find({ _id: { $in: unique } }).select('name email avatarUrl').lean();
  return new Map(users.map((user) => [String(user._id), user]));
}

async function decorate(group, viewerId, options = {}) {
  const ids = group.members.map((member) => member.userId).concat([group.createdBy]);
  const users = await usersByIds(ids);
  return toGroupDto(group, viewerId, { users, ...options });
}

async function decorateMany(groups, viewerId) {
  const ids = groups.flatMap((group) => group.members.map((member) => member.userId).concat([group.createdBy]));
  const users = await usersByIds(ids);
  return groups.map((group) => toGroupDto(group, viewerId, { users }));
}

async function loadGroup(groupId) {
  if (!mongoose.isValidObjectId(groupId)) throw ApiError.notFound('Group not found');
  const group = await Group.findById(groupId);
  if (!group) throw ApiError.notFound('Group not found');
  return group;
}

/**
 * Authorization boundary for every group route: the group is loaded and the caller proven
 * to be an ACTIVE member (admin when asked). `req.user` cannot be trusted for a role.
 */
async function loadGroupForMember(groupId, userId, { admin = false } = {}) {
  const group = await loadGroup(groupId);
  if (!group.isMember(userId)) throw ApiError.forbidden('You are not a member of this group');
  if (admin && !group.hasActiveAdmin(userId)) {
    throw ApiError.forbidden('This action requires group admin rights');
  }
  return group;
}

async function getActiveUser(userId) {
  const user = await User.findById(userId);
  if (!user || user.status !== 'active') throw ApiError.notFound('User not found');
  return user;
}

/**
 * @returns {Promise<number|null>} the member's net minor balance, or null when the balance
 * module is not installed, in which case removal is unrestricted.
 */
async function memberNetBalance(groupId, userId) {
  const compute = balanceService && (balanceService.computeGroupBalances || balanceService.getBalances);
  if (typeof compute !== 'function') return null;
  const result = await compute(groupId);
  const rows = Array.isArray(result) ? result : result?.balances ?? result?.items ?? [];
  const row = rows.find((item) => {
    const candidate = item?.userId ?? item?.user?._id ?? item?.user?.id ?? item?.user ?? item?.id;
    return String(candidate) === String(userId);
  });
  if (!row) return 0;
  return Number(row.netMinor ?? row.net ?? 0) || 0;
}

function invitationSeed(group, email, userId) {
  return {
    groupId: group._id,
    email,
    code: group.invitationCode,
    tokenHash: authService.hashToken(authService.randomToken()),
    status: 'pending',
    createdBy: userId,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  };
}

async function notifyInvitedUsers(group, invited, actor) {
  const notify = notificationService && notificationService.notify;
  if (typeof notify !== 'function') return;
  const userIds = invited.filter((item) => item.userId).map((item) => item.userId);
  if (!userIds.length) return;
  try {
    await notify({
      userIds,
      groupId: group._id,
      type: 'group_invitation',
      title: `${actor.name} invited you to ${group.name}`,
      body: `Open ${group.name} to accept and start sharing expenses.`,
      payload: { groupId: String(group._id), invitationCode: group.invitationCode },
    });
  } catch (error) {
    // A notification outage must never roll back a successful invitation.
    // eslint-disable-next-line no-console
    if (!config.isProduction) console.warn(`[groups] invitation notification failed: ${error.message}`);
  }
}

/**
 * Adds emails to the member list and mints invitation documents.
 * Buckets: `invited` (a real account was added), `already` (member or open invite exists),
 * `notFound` (no account yet - a placeholder member is still created so the address shows
 * up in the group and the invitation becomes claimable when they register).
 */
async function applyInvites({ group, emails, actor, session }) {
  const invited = [];
  const already = [];
  const notFound = [];

  const byUserId = new Map(group.members.map((member) => [String(member.userId), member]));
  const invitedEmails = new Set(
    group.members.filter((member) => member.invitedEmail).map((member) => String(member.invitedEmail).toLowerCase()),
  );
  const openInvites = await Invitation.find({
    groupId: group._id,
    email: { $in: emails },
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }).session(session ?? null);
  const openEmails = new Set(openInvites.map((invitation) => String(invitation.email).toLowerCase()));

  const inviteDocs = [];
  for (const email of emails) {
    const normalised = String(email).toLowerCase();
    const user = await User.findOne({ email: normalised }).session(session ?? null);
    const userId = user ? String(user._id) : null;
    const existingMember = userId ? byUserId.get(userId) : null;

    if (
      (existingMember && existingMember.status === MEMBER_STATUS.ACTIVE) ||
      invitedEmails.has(normalised) ||
      openEmails.has(normalised)
    ) {
      already.push({ email: normalised, userId, reason: 'already' });
      continue;
    }

    // A known user joins as an invited member keyed to their real id; an unknown address
    // gets a placeholder id so the roster can already show it (docs/02-database-schema.md).
    const memberUserId = userId ? new mongoose.Types.ObjectId(userId) : new mongoose.Types.ObjectId();
    if (existingMember) {
      existingMember.status = MEMBER_STATUS.INVITED;
      existingMember.invitedEmail = normalised;
      existingMember.invitedBy = actor._id;
    } else {
      group.members.push({
        userId: memberUserId,
        role: GROUP_ROLE.MEMBER,
        status: MEMBER_STATUS.INVITED,
        invitedEmail: normalised,
        invitedBy: actor._id,
      });
    }

    const invitation = invitationSeed(group, normalised, actor._id);
    inviteDocs.push(invitation);

    const record = { email: normalised, userId: userId ?? null };
    if (userId) invited.push(record);
    else notFound.push({ ...record, reason: 'no-account', placeholderCreated: true });
  }

  if (inviteDocs.length) {
    const inserted = await Invitation.insertMany(inviteDocs, { ...sessionOptions(session), ordered: true });
    const byEmail = new Map(inserted.map((invitation) => [String(invitation.email), invitation]));
    invited.forEach((item) => {
      item.inviteId = byEmail.get(item.email)?._id ? String(byEmail.get(item.email)._id) : null;
    });
    notFound.forEach((item) => {
      item.inviteId = byEmail.get(item.email)?._id ? String(byEmail.get(item.email)._id) : null;
    });
    await group.save(sessionOptions(session));
  }

  await notifyInvitedUsers(group, invited, actor);
  return { invited, already, notFound };
}

async function createGroup(userId, payload) {
  const creator = await getActiveUser(userId);
  const emails = Array.from(new Set((payload.members ?? []).map((email) => String(email).toLowerCase()))).filter(
    (email) => email !== creator.email,
  );

  const group = new Group({
    name: payload.name,
    description: payload.description ?? '',
    category: payload.category,
    imageUrl: payload.imageUrl ?? null,
    baseCurrency: payload.baseCurrency,
    createdBy: creator._id,
    members: [
      {
        userId: creator._id,
        role: GROUP_ROLE.ADMIN,
        status: MEMBER_STATUS.ACTIVE,
        joinedAt: new Date(),
      },
    ],
  });

  const created = await withTransaction(async ({ session }) => {
    await group.save(sessionOptions(session));
    if (emails.length) await applyInvites({ group, emails, actor: creator, session });
    return group;
  });

  // Reload after the transaction so the response reflects the persisted roster.
  return decorate(await loadGroup(created._id), creator._id);
}

async function listGroups(userId, query = {}) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultSort: '-createdAt' });
  const filter = { 'members.userId': userId };

  const archived = query.archived ?? 'false';
  if (archived !== 'all') filter.isArchived = archived === 'true';
  if (query.category) filter.category = query.category;
  if (query.search) filter.name = new RegExp(escapeRegex(query.search), 'i');

  const [groups, total] = await Promise.all([
    Group.find(filter).sort(sort).skip(skip).limit(limit),
    Group.countDocuments(filter),
  ]);

  return {
    items: await decorateMany(groups, userId),
    meta: buildMeta({ page, limit, total }),
  };
}

async function getGroup(userId, groupId) {
  const group = await loadGroupForMember(groupId, userId);
  return decorate(group, userId);
}

async function updateGroup(userId, groupId, payload) {
  const group = await loadGroupForMember(groupId, userId, { admin: true });

  if (payload.baseCurrency && payload.baseCurrency !== group.baseCurrency) {
    // The base currency is the denominator of every stored share, so it freezes at the
    // first expense (docs/02-database-schema.md).
    const expenseCount = await Expense.countDocuments({ groupId: group._id, isDeleted: false });
    if (expenseCount > 0) {
      throw ApiError.unprocessable('Base currency cannot change once the group has expenses');
    }
    group.baseCurrency = payload.baseCurrency;
  }

  if (payload.name !== undefined) group.name = payload.name;
  if (payload.description !== undefined) group.description = payload.description;
  if (payload.category !== undefined) group.category = payload.category;
  if (payload.imageUrl !== undefined) group.imageUrl = payload.imageUrl;
  if (payload.isArchived !== undefined) {
    group.isArchived = payload.isArchived;
    group.archivedAt = payload.isArchived ? new Date() : null;
  }

  await group.save();
  return decorate(group, userId);
}

async function archiveGroup(userId, groupId) {
  const group = await loadGroupForMember(groupId, userId, { admin: true });
  if (!group.isArchived) {
    group.isArchived = true;
    group.archivedAt = new Date();
    await group.save();
  }
  // Archive, not delete: the financial history stays queryable for every member.
  return { id: String(group._id), name: group.name, isArchived: true, archivedAt: group.archivedAt };
}

async function findInvitationForAcceptance({ groupId, inviteId, user, session }) {
  const invitation = await Invitation.findOne({ _id: inviteId, groupId }).session(session ?? null);
  if (!invitation) throw ApiError.notFound('Invitation not found');
  if (String(invitation.email).toLowerCase() !== String(user.email)) {
    throw ApiError.forbidden('This invitation was issued to a different email address');
  }
  if (invitation.status === 'accepted') return invitation;
  if (invitation.expiresAt.getTime() <= Date.now()) {
    if (invitation.status !== 'expired') {
      invitation.status = 'expired';
      await invitation.save(sessionOptions(session));
    }
    throw ApiError.badRequest('This invitation has expired');
  }
  return invitation;
}

/** Re-keys the placeholder member row to the joining account, keeping one row per user. */
function promoteMemberEntry(group, user) {
  const placeholder = group.members.find(
    (member) =>
      String(member.userId) !== String(user._id) &&
      member.status === MEMBER_STATUS.INVITED &&
      String(member.invitedEmail || '').toLowerCase() === String(user.email),
  );
  const own = group.findMember(user._id);

  if (own) {
    if (placeholder) group.members.pull(placeholder);
    own.status = MEMBER_STATUS.ACTIVE;
    own.joinedAt = own.joinedAt || new Date();
    own.respondedAt = new Date();
    return own;
  }

  if (placeholder) {
    placeholder.userId = user._id;
    placeholder.status = MEMBER_STATUS.ACTIVE;
    placeholder.role = placeholder.role || GROUP_ROLE.MEMBER;
    placeholder.joinedAt = new Date();
    placeholder.respondedAt = new Date();
    return placeholder;
  }

  const added = { userId: user._id, role: GROUP_ROLE.MEMBER, status: MEMBER_STATUS.ACTIVE, joinedAt: new Date() };
  group.members.push(added);
  return group.findMember(user._id);
}

async function acceptInvitation(userId, groupId, inviteId) {
  const user = await getActiveUser(userId);
  await withTransaction(async ({ session }) => {
    const invitation = await findInvitationForAcceptance({ groupId, inviteId, user, session });
    const group = await Group.findById(groupId).session(session ?? null);
    if (!group) throw ApiError.notFound('Group not found');

    if (!group.isMember(user._id)) {
      promoteMemberEntry(group, user);
      await group.save(sessionOptions(session));
    }

    if (invitation.status !== 'accepted') {
      invitation.status = 'accepted';
      invitation.acceptedAt = new Date();
      invitation.acceptedBy = user._id;
      await invitation.save(sessionOptions(session));
    }
  });

  const group = await loadGroup(groupId);
  if (!group.isMember(user._id)) throw ApiError.forbidden('You are not a member of this group');
  return decorate(group, user._id);
}

async function declineInvitation(userId, groupId, inviteId) {
  const user = await getActiveUser(userId);
  await withTransaction(async ({ session }) => {
    const invitation = await findInvitationForAcceptance({ groupId, inviteId, user, session });
    if (invitation.status === 'accepted') throw ApiError.conflict('You already joined this group');

    const group = await Group.findById(groupId).session(session ?? null);
    if (!group) throw ApiError.notFound('Group not found');

    const own = group.findMember(user._id);
    if (own && own.status === MEMBER_STATUS.ACTIVE) throw ApiError.conflict('You already joined this group');
    const placeholder = group.members.find(
      (entry) =>
        entry.status === MEMBER_STATUS.INVITED &&
        String(entry.invitedEmail || '').toLowerCase() === String(user.email),
    );
    const target = own ?? placeholder;
    if (target) {
      target.status = MEMBER_STATUS.DECLINED;
      target.respondedAt = new Date();
      await group.save(sessionOptions(session));
    }

    invitation.status = 'declined';
    invitation.declinedAt = new Date();
    await invitation.save(sessionOptions(session));
  });

  return { id: String(groupId), inviteId: String(inviteId), status: 'declined' };
}

async function joinByCode(userId, code) {
  const user = await getActiveUser(userId);
  const normalised = String(code).trim().toUpperCase();
  const group = await Group.findOne({ invitationCode: normalised });
  if (!group) throw ApiError.notFound('Invitation code is not valid');
  if (group.isArchived) throw ApiError.conflict('This group is archived');

  if (!group.isMember(user._id)) {
    promoteMemberEntry(group, user);
    await group.save();
  }
  return { group: await decorate(group, user._id) };
}

async function inviteByEmail(userId, groupId, emails) {
  const group = await loadGroupForMember(groupId, userId, { admin: true });
  const actor = await getActiveUser(userId);
  const buckets = await withTransaction(({ session }) =>
    applyInvites({ group, emails, actor, session }),
  );
  return buckets;
}

async function removeMember(userId, groupId, targetUserId) {
  const group = await loadGroupForMember(groupId, userId, { admin: true });
  const member = group.findMember(targetUserId);
  if (!member) throw ApiError.notFound('That user is not a member of this group');

  const net = await memberNetBalance(groupId, targetUserId);
  if (net !== null && net !== 0) {
    // Removing someone with an open balance would silently write off a debt.
    throw ApiError.conflict("Settle this member's balance before removing them", {
      userId: String(targetUserId),
      netMinor: net,
    });
  }

  const guard = group.canRemoveMember(targetUserId);
  if (!guard.allowed) {
    throw ApiError.conflict(
      guard.reason === 'LAST_ADMIN' ? 'A group needs at least one active admin' : 'That member cannot be removed',
      { reason: guard.reason },
    );
  }

  member.status = MEMBER_STATUS.REMOVED;
  member.respondedAt = new Date();
  await group.save();
  return { id: String(group._id), removedUserId: String(targetUserId) };
}

async function changeMemberRole(userId, groupId, targetUserId, role) {
  const group = await loadGroupForMember(groupId, userId, { admin: true });
  const member = group.findMember(targetUserId);
  if (!member) throw ApiError.notFound('That user is not a member of this group');
  if (member.status !== MEMBER_STATUS.ACTIVE) {
    throw ApiError.conflict('Only active members can change role');
  }

  // `canRemoveMember` encodes the last-active-admin rule; demotion is the same hazard.
  const guard = group.canRemoveMember(targetUserId);
  if (!guard.allowed && guard.reason === 'LAST_ADMIN') {
    throw ApiError.conflict('A group needs at least one active admin', { reason: guard.reason });
  }

  member.role = role;
  await group.save();
  return { id: String(group._id), userId: String(targetUserId), role };
}

async function listInvites(userId, groupId, query = {}) {
  const group = await loadGroupForMember(groupId, userId, { admin: true });
  const { page, limit, skip, sort } = parsePagination(query, { defaultSort: '-createdAt' });

  const filter = { groupId: group._id };
  if (query.status && query.status !== 'all') filter.status = query.status;

  const [invites, total] = await Promise.all([
    Invitation.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate({ path: 'createdBy', model: 'User', select: MEMBER_FIELDS }),
    Invitation.countDocuments(filter),
  ]);

  return {
    items: invites.map((invitation) => ({
      id: String(invitation._id),
      groupId: String(invitation.groupId),
      email: invitation.email,
      status: invitation.status,
      code: invitation.code,
      joinUrl: `${String(config.CLIENT_URL).replace(/\/$/, '')}/invitations?code=${invitation.code}`,
      invitedBy: toUserRef(invitation.createdBy),
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
    })),
    meta: buildMeta({ page, limit, total }),
  };
}

/**
 * Soft-deleting an account must not erase money history, so only the roster entries are
 * touched: expenses, settlements and audit rows keep pointing at the deleted user id.
 */
async function detachUserFromGroups(userId, { session } = {}) {
  const groups = await Group.find({ 'members.userId': userId }).session(session ?? null);
  for (const group of groups) {
    const member = group.findMember(userId);
    if (!member || member.status !== MEMBER_STATUS.ACTIVE) continue; // eslint-disable-line no-continue

    const successor = group.members
      .filter((entry) => String(entry.userId) !== String(userId) && entry.status === MEMBER_STATUS.ACTIVE)
      .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))[0];

    if (member.role === GROUP_ROLE.ADMIN && group.activeAdminCount() <= 1) {
      if (successor) successor.role = GROUP_ROLE.ADMIN;
      // Nobody left to run it: archive rather than abandon an admin-less group.
      else {
        group.isArchived = true;
        group.archivedAt = new Date();
      }
    }
    member.status = MEMBER_STATUS.REMOVED;
    await group.save(sessionOptions(session));
  }
  return groups.length;
}

module.exports = {
  createGroup,
  listGroups,
  getGroup,
  updateGroup,
  archiveGroup,
  inviteByEmail,
  acceptInvitation,
  declineInvitation,
  joinByCode,
  removeMember,
  changeMemberRole,
  listInvites,
  detachUserFromGroups,
  loadGroupForMember,
  toGroupDto,
  toUserRef,
};
