'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const router = express.Router();

/**
 * Module manifest. Each functional module owns its router file; group-scoped routers are
 * mounted on a parameterised prefix and must be created with { mergeParams: true }.
 *
 * A missing router is fatal in production and only warned about while developing, so a
 * half-installed deploy can never silently answer 404 for a real feature.
 */
const MOUNTS = [
  ['/auth', './authRoutes', true],
  ['/users', './userRoutes', true],
  ['/groups', './groupRoutes', true],
  ['/groups/:id/balances', './balanceRoutes', true],
  ['/groups/:id/settlements', './groupSettlementRoutes', true],
  ['/groups/:id/insights', './insightsRoutes', false],
  ['/groups/:id/recurring', './recurringRoutes', false],
  ['/groups/:id/budgets', './budgetRoutes', false],
  ['/expenses', './expenseRoutes', true],
  ['/settlements', './settlementRoutes', true],
  ['/me', './meRoutes', false],
  ['/analytics', './analyticsRoutes', false],
  ['/notifications', './notificationRoutes', false],
  ['/recurring', './recurringRoutes', false],
  ['/budgets', './budgetRoutes', false],
  ['/meta', './metaRoutes', false],
];

const loaded = [];

for (const [mountPath, moduleId, required] of MOUNTS) {
  const file = path.resolve(__dirname, `${moduleId.replace('./', '')}.js`);
  if (!fs.existsSync(file)) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Router ${file} is missing but required in production`);
    }
    // eslint-disable-next-line no-console
    console.warn(`[routes] ${required ? 'required' : 'optional'} router not implemented yet: ${moduleId}`);
    continue;
  }
  const instance = require(moduleId);
  if (typeof instance !== 'function') {
    throw new Error(`${moduleId} must export an express Router`);
  }
  // Duplicate module ids (e.g. /recurring and /groups/:id/recurring) must be one Router
  // instance, otherwise express keeps two independent middleware stacks.
  const target = loaded.find((entry) => entry.moduleId === moduleId)?.router ?? instance;
  router.use(mountPath, target);
  loaded.push({ moduleId, router: target });
}

module.exports = router;
module.exports.loadedRoutes = loaded.map((entry) => entry.moduleId);
