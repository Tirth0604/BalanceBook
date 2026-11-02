'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const groupService = require('../services/groupService');

const bodyOf = (req) => req.validatedBody ?? req.body ?? {};
const queryOf = (req) => req.validatedQuery ?? req.query ?? {};
const paramsOf = (req) => req.validatedParams ?? req.params ?? {};

/** Group id arrives as `:id` here; the service proves membership before any read or write. */
const groupIdOf = (req) => paramsOf(req).id ?? req.groupId;

const create = asyncHandler(async (req, res) => {
  const group = await groupService.createGroup(req.userId, bodyOf(req));
  return ApiResponse.created(res, { group });
});

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await groupService.listGroups(req.userId, queryOf(req));
  return ApiResponse.paginated(res, items, meta);
});

const detail = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, { group: await groupService.getGroup(req.userId, groupIdOf(req)) });
});

const update = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, { group: await groupService.updateGroup(req.userId, groupIdOf(req), bodyOf(req)) });
});

const archive = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, await groupService.archiveGroup(req.userId, groupIdOf(req)));
});

const invite = asyncHandler(async (req, res) => {
  const result = await groupService.inviteByEmail(req.userId, groupIdOf(req), bodyOf(req).emails ?? []);
  return ApiResponse.created(res, result);
});

const acceptInvite = asyncHandler(async (req, res) => {
  const { id, inviteId } = paramsOf(req);
  return ApiResponse.send(res, { group: await groupService.acceptInvitation(req.userId, id, inviteId) });
});

const declineInvite = asyncHandler(async (req, res) => {
  const { id, inviteId } = paramsOf(req);
  return ApiResponse.send(res, await groupService.declineInvitation(req.userId, id, inviteId));
});

const join = asyncHandler(async (req, res) => {
  return ApiResponse.send(res, await groupService.joinByCode(req.userId, bodyOf(req).code));
});

const removeMember = asyncHandler(async (req, res) => {
  const { id, userId } = paramsOf(req);
  return ApiResponse.send(res, await groupService.removeMember(req.userId, id, userId));
});

const changeRole = asyncHandler(async (req, res) => {
  const { id, userId } = paramsOf(req);
  return ApiResponse.send(res, await groupService.changeMemberRole(req.userId, id, userId, bodyOf(req).role));
});

const listInvites = asyncHandler(async (req, res) => {
  const { items, meta } = await groupService.listInvites(req.userId, groupIdOf(req), queryOf(req));
  return ApiResponse.paginated(res, items, meta);
});

module.exports = {
  create,
  list,
  detail,
  update,
  archive,
  invite,
  acceptInvite,
  declineInvite,
  join,
  removeMember,
  changeRole,
  listInvites,
};
