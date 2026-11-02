'use strict';

const express = require('express');

const { requireAuth } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const schemas = require('../validation/analyticsSchemas');
const controller = require('../controllers/analyticsController');

/** Mounted by src/routes/index.js at /analytics. */
const router = express.Router();

/**
 * The scope (`?groupId`) is validated but never trusted: analyticsService.resolveScope proves
 * active membership from the group document and answers 403, and without it the scope becomes
 * the caller's own active groups.
 */
router.get('/overview', requireAuth, validate({ query: schemas.analyticsQuery }), controller.overview);
router.get('/categories', requireAuth, validate({ query: schemas.categoriesQuery }), controller.categories);
router.get('/members', requireAuth, validate({ query: schemas.membersQuery }), controller.members);
router.get('/trend', requireAuth, validate({ query: schemas.trendQuery }), controller.trend);
router.get('/dashboard', requireAuth, controller.dashboard);

// Reconciliation names exactly one group, so the id is a path parameter here.
router.get(
  '/reconcile/:id',
  requireAuth,
  validate({ params: schemas.groupPathParams, query: schemas.analyticsQuery }),
  controller.reconcile,
);

/**
 * Declared before any parameterised route so `export.csv` can never be swallowed by one, and
 * it is the only endpoint that answers with a file instead of the JSON envelope.
 */
router.get('/export.csv', requireAuth, validate({ query: schemas.csvQuery }), controller.exportCsv);

module.exports = router;
