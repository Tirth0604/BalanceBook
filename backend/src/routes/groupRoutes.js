'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireGroupMember, requireGroupRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { GROUP_ROLE } = require('../utils/constants');
const schemas = require('../validation/groupSchemas');
const controller = require('../controllers/groupController');

const router = express.Router();

// Membership is proven twice on purpose: here in middleware and again inside the service,
// so a route can never be mounted without the check.
router.use(requireAuth);

const adminOnly = requireGroupRole(GROUP_ROLE.ADMIN);
const validateGroupParams = validate({ params: schemas.groupParams });

router.post('/', validate({ body: schemas.createGroup }), controller.create);
router.get('/', validate({ query: schemas.listGroupsQuery }), controller.list);
// Registered before '/:id' so the literal path is never read as an id.
router.post('/join', validate({ body: schemas.joinByCode }), controller.join);

router.get('/:id', validateGroupParams, requireGroupMember, controller.detail);
router.patch('/:id', validate({ params: schemas.groupParams, body: schemas.updateGroup }), requireGroupMember, adminOnly, controller.update);
router.delete('/:id', validateGroupParams, requireGroupMember, adminOnly, controller.archive);

router.post(
  '/:id/invites',
  validate({ params: schemas.groupParams, body: schemas.invite }),
  requireGroupMember,
  adminOnly,
  controller.invite,
);
router.get(
  '/:id/invites',
  validate({ params: schemas.groupParams, query: schemas.listInvitesQuery }),
  requireGroupMember,
  adminOnly,
  controller.listInvites,
);

// The invitee is not a member yet, so these check the invitation (and its email) instead.
router.post(
  '/:id/invites/:inviteId/accept',
  validate({ params: schemas.inviteParams }),
  controller.acceptInvite,
);
router.post(
  '/:id/invites/:inviteId/decline',
  validate({ params: schemas.inviteParams }),
  controller.declineInvite,
);

router.post(
  '/:id/members/:userId/remove',
  validate({ params: schemas.memberParams }),
  requireGroupMember,
  adminOnly,
  controller.removeMember,
);
router.post(
  '/:id/members/:userId/role',
  validate({ params: schemas.memberParams, body: schemas.changeRole }),
  requireGroupMember,
  adminOnly,
  controller.changeRole,
);

module.exports = router;
