'use strict';

const Group = require('../models/Group');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { GROUP_ROLE, MEMBER_STATUS } = require('../utils/constants');

/** Group ids arrive as `:id` on /groups/:id and as `:groupId` on nested routes. */
function groupIdFromRequest(req) {
  const candidate = req.params.groupId || req.params.id;
  if (!candidate) throw ApiError.badRequest('A group id is required');
  return candidate;
}

/**
 * Loads the group and proves the caller is an ACTIVE member. Runs before any financial
 * read or write: group membership is the authorization boundary in BalanceBook.
 */
const requireGroupMember = asyncHandler(async (req, res, next) => {
  if (!req.userId) throw ApiError.unauthorized();
  const group = await Group.findById(groupIdFromRequest(req));
  if (!group) throw ApiError.notFound('Group not found');
  if (!group.isMember(req.userId)) {
    throw ApiError.forbidden('You are not a member of this group');
  }
  req.group = group;
  req.groupId = String(group._id);
  req.groupMembership = group.findMember(req.userId);
  return next();
});

/** Admin-only guard. Use after requireGroupMember so the group is already loaded. */
function requireGroupRole(...roles) {
  const allowed = new Set(roles.flat());
  return asyncHandler(async (req, res, next) => {
    if (!req.group) throw ApiError.internal('requireGroupRole must run after requireGroupMember');
    if (!req.groupMembership || req.groupMembership.status !== MEMBER_STATUS.ACTIVE) {
      throw ApiError.forbidden('You are not an active member of this group');
    }
    if (!allowed.has(req.groupMembership.role)) {
      throw ApiError.forbidden('This action requires group admin rights');
    }
    return next();
  });
}

const requireGroupAdmin = requireGroupRole(GROUP_ROLE.ADMIN);

/**
 * Same check for routes whose group is only knowable from the document
 * (e.g. PATCH /expenses/:id) — pass a loader that returns { groupId, ... }.
 */
function requireMembershipOf(getGroupId) {
  return asyncHandler(async (req, res, next) => {
    if (!req.userId) throw ApiError.unauthorized();
    const groupId = await getGroupId(req);
    if (!groupId) throw ApiError.notFound();
    const group = await Group.findById(groupId);
    if (!group) throw ApiError.notFound('Group not found');
    if (!group.isMember(req.userId)) throw ApiError.forbidden('You are not a member of this group');
    req.group = group;
    req.groupId = String(group._id);
    req.groupMembership = group.findMember(req.userId);
    return next();
  });
}

module.exports = {
  requireGroupMember,
  requireGroupRole,
  requireGroupAdmin,
  requireMembershipOf,
  groupIdFromRequest,
};
