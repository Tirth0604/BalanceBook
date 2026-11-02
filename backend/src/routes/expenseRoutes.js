'use strict';

const express = require('express');

const { requireAuth } = require('../middleware/authMiddleware');
const { requireGroupMember } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { uploadReceipt } = require('../middleware/uploadMiddleware');
const controller = require('../controllers/expenseController');
const schemas = require('../validation/expenseSchemas');

/** Mounted by src/routes/index.js at /expenses — cross-group reads and per-expense writes. */
const router = express.Router();

router.get('/', requireAuth, validate({ query: schemas.listExpensesQuery }), controller.listExpenses);
router.get('/:id', requireAuth, validate({ params: schemas.expenseParams }), controller.getExpense);
router.patch(
  '/:id',
  requireAuth,
  validate({ params: schemas.expenseParams, body: schemas.updateExpense }),
  controller.updateExpense,
);
router.delete(
  '/:id',
  requireAuth,
  validate({ params: schemas.expenseParams, body: schemas.deleteExpense }),
  controller.deleteExpense,
);
router.get('/:id/audit', requireAuth, validate({ params: schemas.expenseParams }), controller.getAuditTrail);
router.post(
  '/:id/receipt',
  requireAuth,
  validate({ params: schemas.expenseParams }),
  uploadReceipt,
  controller.attachReceipt,
);
router.delete(
  '/:id/receipt',
  requireAuth,
  validate({ params: schemas.expenseParams }),
  controller.removeReceipt,
);

/**
 * Create stays under the group path per docs/03: POST /groups/:groupId/expenses.
 * routes/index.js (lead-owned) mounts this with router.use('/groups', expenseRoutes.groupScoped)
 * or an equivalent '/groups/:groupId/expenses' mount; mergeParams keeps :groupId visible.
 */
const groupScoped = express.Router({ mergeParams: true });

groupScoped.post(
  '/:groupId/expenses',
  requireAuth,
  validate({ params: schemas.groupExpenseParams }),
  requireGroupMember,
  validate({ body: schemas.createExpense }),
  controller.createExpense,
);

module.exports = router;
module.exports.groupScoped = groupScoped;
