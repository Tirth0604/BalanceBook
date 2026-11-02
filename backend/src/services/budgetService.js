'use strict';

/**
 * Budgets store a limit and nothing else: "spent" is always re-aggregated from the live
 * ledger, so an edited or deleted expense can never leave a stale number behind.
 *
 * Threshold alerts are claimed with an atomic `$addToSet` before the notification is
 * written, so a busy client that polls the progress endpoint cannot produce ten copies of
 * the same "you hit 90%" alert — one alert per threshold per budget period.
 */

const mongoose = require('mongoose');

const Budget = require('../models/Budget');
const Expense = require('../models/Expense');
const Group = require('../models/Group');
const notificationService = require('./notificationService');

const ApiError = require('../utils/ApiError');
const money = require('../utils/money');
const { categoryLabel } = require('../utils/constants');

// `BUDGET_SCOPES` in constants is a flat array of values, not a keyed object, so the scope
// tokens are pinned here to avoid a silent `undefined` comparison that would make a category
// budget fall through to whole-group spend.
const SCOPE_GROUP_TOTAL = 'group_total';
const SCOPE_CATEGORY = 'category';

function toId(value) {
  return value == null ? null : String(value);
}

function oid(value) {
  if (!mongoose.isValidObjectId(String(value))) throw ApiError.badRequest(`Invalid id: ${value}`);
  return new mongoose.Types.ObjectId(String(value));
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Budgets are a group-level control, so writes need an active admin; reads need a member. */
async function loadAuthorisedGroup(groupId, actorId, { adminRequired = false } = {}) {
  if (!groupId) throw ApiError.badRequest('A groupId is required');
  const group = await Group.findById(oid(groupId)).lean();
  if (!group) throw ApiError.notFound('Group not found');
  const membership = (group.members || []).find(
    (member) => toId(member.userId) === toId(actorId) && member.status === 'active',
  );
  if (!membership) throw ApiError.forbidden('You are not a member of this group');
  if (adminRequired && membership.role !== 'admin') {
    throw ApiError.forbidden('This action requires group admin rights');
  }
  return group;
}

/** UTC month key `YYYY-MM` for the month containing `date`. */
function periodKeyFor(date) {
  const value = new Date(date);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

function windowForPeriod(budget, now = new Date()) {
  if (budget.period === 'monthly') {
    const key = budget.periodKey || periodKeyFor(now);
    const [year, month] = key.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    return { periodKey: key, expenseDate: { $gte: start, $lt: new Date(Date.UTC(year, month, 1)) } };
  }
  const start = budget.startDate ?? new Date(0);
  const expenseDate = { $gte: start };
  if (budget.endDate) expenseDate.$lte = budget.endDate;
  return { periodKey: null, expenseDate };
}

/** Live spend for a budget: non-deleted expenses in the window (and category, if scoped). */
async function spentFor(budget, now = new Date()) {
  const { periodKey, expenseDate } = windowForPeriod(budget, now);
  const range = {};
  if (expenseDate.$gte) range.$gte = expenseDate.$gte;
  if (expenseDate.$gt) range.$gt = expenseDate.$gt;
  if (expenseDate.$lte) range.$lte = expenseDate.$lte;
  if (expenseDate.$lt) range.$lt = expenseDate.$lt;

  const match = {
    groupId: oid(budget.groupId),
    isDeleted: false,
    ...(Object.keys(range).length ? { expenseDate: range } : {}),
    ...(budget.scope === SCOPE_CATEGORY && budget.category ? { category: budget.category } : {}),
  };

  const [row] = await Expense.aggregate([
    { $match: match },
    { $group: { _id: null, spentMinor: { $sum: '$groupAmountMinor' }, expenseCount: { $sum: 1 } } },
  ]);

  return {
    spentMinor: row?.spentMinor ?? 0,
    expenseCount: row?.expenseCount ?? 0,
    periodKey,
    window: {
      from: range.$gte ? new Date(range.$gte).toISOString() : null,
      to: range.$lte ? new Date(range.$lte).toISOString() : range.$lt ? new Date(range.$lt).toISOString() : null,
    },
  };
}

function highestCrossedThreshold(thresholds, percentUsed) {
  const crossed = (thresholds || []).filter((threshold) => percentUsed >= threshold);
  return crossed.length ? Math.max(...crossed) : null;
}

function budgetLabel(budget) {
  if (budget.label) return budget.label;
  return budget.scope === SCOPE_CATEGORY ? `${categoryLabel(budget.category)} budget` : 'Group budget';
}

/** The DTO the API returns: stored limit plus everything derived from the live ledger. */
function toBudgetDto(budget, spent, extra = {}) {
  const percentUsed = budget.limitMinor > 0 ? round2((spent.spentMinor / budget.limitMinor) * 100) : 0;
  const thresholdHit = highestCrossedThreshold(budget.alertThresholds, percentUsed);
  return {
    id: toId(budget._id),
    groupId: toId(budget.groupId),
    scope: budget.scope,
    category: budget.category ?? null,
    categoryLabel: budget.category ? categoryLabel(budget.category) : null,
    label: budget.label || '',
    title: budgetLabel(budget),
    limitMinor: budget.limitMinor,
    limit: money.fromMinor(budget.limitMinor, budget.currency),
    display: money.format(budget.limitMinor, budget.currency),
    currency: budget.currency,
    period: budget.period,
    periodKey: spent.periodKey ?? budget.periodKey ?? null,
    startDate: budget.startDate ? new Date(budget.startDate).toISOString() : null,
    endDate: budget.endDate ? new Date(budget.endDate).toISOString() : null,
    alertThresholds: [...(budget.alertThresholds || [])].sort((a, b) => a - b),
    notifiedThresholds: [...(budget.notifiedThresholds || [])].sort((a, b) => a - b),
    isActive: budget.isActive,
    spentMinor: spent.spentMinor,
    spent: money.fromMinor(spent.spentMinor, budget.currency),
    spentDisplay: money.format(spent.spentMinor, budget.currency),
    remainingMinor: budget.limitMinor - spent.spentMinor,
    remaining: money.fromMinor(budget.limitMinor - spent.spentMinor, budget.currency),
    percentUsed,
    thresholdHit,
    isOverBudget: spent.spentMinor > budget.limitMinor,
    expenseCount: spent.expenseCount,
    window: spent.window,
    createdBy: budget.createdBy ? toId(budget.createdBy) : null,
    createdAt: budget.createdAt ? new Date(budget.createdAt).toISOString() : null,
    updatedAt: budget.updatedAt ? new Date(budget.updatedAt).toISOString() : null,
    ...extra,
  };
}

/**
 * Fire the alerts for thresholds crossed for the first time in this period. The claim is a
 * conditional update, so only one caller can win each threshold and duplicates need a bug.
 */
async function fireThresholdAlerts(budget, percentUsed, thresholdHit, spentMinor) {
  if (thresholdHit == null) return [];
  const crossed = [...(budget.alertThresholds || [])]
    .filter((threshold) => percentUsed >= threshold && threshold <= thresholdHit)
    .sort((a, b) => a - b);

  const fired = [];
  for (const threshold of crossed) {
    const claimed = await Budget.findOneAndUpdate(
      { _id: budget._id, notifiedThresholds: { $ne: threshold } },
      { $addToSet: { notifiedThresholds: threshold } },
      { new: true },
    );
    if (!claimed) continue;
    budget.notifiedThresholds = [...new Set([...(budget.notifiedThresholds || []), threshold])];

    const crossedMinor = Math.round((budget.limitMinor * threshold) / 100);
    await notificationService.notify({
      groupId: toId(budget.groupId),
      includeGroupMembers: true,
      type: 'budget_threshold',
      title: `Budget alert: ${budgetLabel(budget)} at ${threshold}%`,
      body: `${money.format(crossedMinor, budget.currency)} of ${money.format(
        budget.limitMinor,
        budget.currency,
      )} is now spent (${percentUsed}%). Nothing has been charged — this is a heads-up, not a payment.`,
      payload: {
        budgetId: toId(budget._id),
        groupId: toId(budget.groupId),
        threshold,
        percentUsed,
        spentMinor,
        limitMinor: budget.limitMinor,
      },
    });
    fired.push(threshold);
  }
  return fired;
}

async function evaluate(budget, { now = new Date(), alert = true } = {}) {
  const spent = await spentFor(budget, now);
  const percentUsed = budget.limitMinor > 0 ? round2((spent.spentMinor / budget.limitMinor) * 100) : 0;
  const thresholdHit = highestCrossedThreshold(budget.alertThresholds, percentUsed);
  const alertedThresholds = alert ? await fireThresholdAlerts(budget, percentUsed, thresholdHit, spent.spentMinor) : [];
  return toBudgetDto(budget, spent, { alertedThresholds });
}

async function upsertBudget({ actorId, groupId, body = {}, now = new Date() }) {
  const group = await loadAuthorisedGroup(groupId, actorId, { adminRequired: true });

  const scope = body.scope ?? SCOPE_GROUP_TOTAL;
  const category = scope === SCOPE_CATEGORY ? body.category ?? null : null;
  if (scope === SCOPE_CATEGORY && !category) {
    throw ApiError.unprocessable('A category budget must name its category', [
      { path: 'category', message: 'category is required when scope is "category"' },
    ]);
  }
  const period = body.period ?? 'monthly';
  const periodKey = period === 'monthly' ? body.periodKey ?? periodKeyFor(now) : null;
  if (periodKey && !/^\d{4}-\d{2}$/.test(periodKey)) {
    throw ApiError.unprocessable('periodKey must look like 2026-11', [
      { path: 'periodKey', message: 'periodKey must be YYYY-MM', code: 'custom' },
    ]);
  }

  const currency = String(body.currency || group.baseCurrency || 'INR').toUpperCase();
  const limitMinor = body.limitMinor != null ? body.limitMinor : money.toMinor(body.limit ?? body.amount, currency);
  if (!Number.isInteger(limitMinor) || limitMinor <= 0) {
    throw ApiError.unprocessable('Budget limit must be a positive amount', [
      { path: 'limit', message: 'Budget limit must be greater than zero' },
    ]);
  }

  const alertThresholds = [...new Set((body.alertThresholds ?? [75, 90, 100]).map(Number))]
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 1000)
    .sort((a, b) => a - b);

  const key = {
    groupId: group._id,
    scope,
    category: category ?? null,
    periodKey: periodKey ?? null,
  };
  const update = {
    $set: {
      limitMinor,
      currency,
      period,
      alertThresholds,
      label: body.label ?? '',
      startDate: body.startDate ? new Date(body.startDate) : new Date(now),
      endDate: body.endDate ? new Date(body.endDate) : null,
      isActive: body.isActive ?? true,
    },
    // Alerts are per threshold per period, so a re-issued PUT must not reset the claim list
    // unless the caller moved into a different period (a different document entirely).
    $setOnInsert: { createdBy: oid(actorId), notifiedThresholds: [] },
  };

  const existing = await Budget.findOne(key).select('_id').lean();
  const budget = await Budget.findOneAndUpdate(key, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  });
  if (!budget) throw ApiError.internal('Budget could not be saved');

  const evaluated = await evaluate(budget, { now });
  return { budget: evaluated, created: !existing };
}

async function listBudgets({ actorId, groupId, query = {}, now = new Date() }) {
  await loadAuthorisedGroup(groupId, actorId);
  const filter = { groupId: oid(groupId) };
  // A soft-deleted plan disappears unless the caller explicitly asks for everything.
  if (query.includeInactive !== true && query.includeInactive !== 'true') filter.isActive = true;
  if (query.scope) filter.scope = query.scope;
  if (query.category) filter.category = query.category;

  const budgets = await Budget.find(filter).sort({ scope: 1, category: 1, periodKey: -1 }).lean();
  const rows = await Promise.all(budgets.map((budget) => evaluate(budget, { now })));
  const summary = rows.reduce(
    (acc, row) => {
      acc.overBudgetCount += row.isOverBudget ? 1 : 0;
      acc.atThresholdCount += row.thresholdHit != null && !row.isOverBudget ? 1 : 0;
      acc.limitMinor += row.limitMinor;
      acc.spentMinor += row.spentMinor;
      return acc;
    },
    { overBudgetCount: 0, atThresholdCount: 0, limitMinor: 0, spentMinor: 0 },
  );
  return {
    groupId: toId(groupId),
    currency: groupCurrency(rows),
    count: rows.length,
    summary,
    budgets: rows,
  };
}

function groupCurrency(rows) {
  const currencies = [...new Set(rows.map((row) => row.currency))];
  return currencies.length === 1 ? currencies[0] : null;
}

async function getBudget({ actorId, budgetId, now = new Date() }) {
  const budget = await Budget.findById(oid(budgetId));
  if (!budget) throw ApiError.notFound('Budget not found');
  await loadAuthorisedGroup(toId(budget.groupId), actorId);
  return evaluate(budget, { now });
}

async function deleteBudget({ actorId, budgetId }) {
  const budget = await Budget.findById(oid(budgetId));
  if (!budget) throw ApiError.notFound('Budget not found');
  await loadAuthorisedGroup(toId(budget.groupId), actorId, { adminRequired: true });
  // Soft delete: history and any alert already sent stay auditable, but the plan stops
  // appearing in lists and can no longer fire alerts.
  budget.isActive = false;
  await budget.save();
  const spent = await spentFor(budget);
  return toBudgetDto(budget, spent, { deleted: true });
}

module.exports = {
  upsertBudget,
  listBudgets,
  getBudget,
  deleteBudget,
  evaluate,
  spentFor,
  windowForPeriod,
  periodKeyFor,
  highestCrossedThreshold,
  loadAuthorisedGroup,
};
