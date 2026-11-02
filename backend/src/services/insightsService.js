'use strict';

/**
 * Smart insights, with no intelligence in them.
 *
 * Every insight is produced by a rule over an aggregation that this module actually ran;
 * the numbers in the copy are the numbers in `metric`, and a rule that lacks data (no
 * previous period, one-member group, no budgets) stays silent instead of inventing a "0%
 * change". Nothing here calls a model, so the whole engine is deterministic and unit-testable.
 *
 * Severity vocabulary is fixed by the API contract: info | positive | warning.
 */

const mongoose = require('mongoose');

const Expense = require('../models/Expense');
const User = require('../models/User');
const Budget = require('../models/Budget');
const analyticsService = require('./analyticsService');
const budgetService = require('./budgetService');

const ApiError = require('../utils/ApiError');
const money = require('../utils/money');
const { categoryLabel } = require('../utils/constants');

const DAY_MS = 24 * 60 * 60 * 1000;
const CATEGORY_DELTA_THRESHOLD_PERCENT = 20;
const TREND_THRESHOLD_PERCENT = 15;
const DEBT_AGE_DAYS = 30;
const MAX_CATEGORY_DELTA_INSIGHTS = 3;
const SEVERITY_RANK = { warning: 0, info: 1, positive: 2 };

function toId(value) {
  return value == null ? null : String(value);
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function percentChange(current, previous) {
  if (!previous) return null;
  return round2(((current - previous) / previous) * 100);
}

function daysBetween(from, to) {
  if (!from) return null;
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
}

/** A mixed-currency scope has no single unit, so amounts are printed bare instead. */
function grouped(minor, currency) {
  if (!currency) return String(minor);
  return money.format(minor, currency);
}

function insight({ id, type, severity, title, body, metric, window }) {
  // Rank 0 is a valid severity, so membership must be tested explicitly.
  if (!Object.hasOwn(SEVERITY_RANK, severity)) throw ApiError.internal(`Unknown insight severity: ${severity}`);
  return { id, type, severity, title, body, metric, window };
}

/** Money the group spent, folded per category, is the raw material of most rules. */
function categoryByName(rows = []) {
  return new Map((rows || []).map((row) => [row.category, row]));
}

/* ------------------------------------------------------------------ rules */

function ruleSpendTrend(facts) {
  const previous = facts.previous;
  if (!previous || !previous.spentMinor) return [];
  const change = percentChange(facts.current.spentMinor, previous.spentMinor);
  if (change == null || Math.abs(change) < TREND_THRESHOLD_PERCENT) return [];
  const up = change > 0;
  return [
    insight({
      id: 'spend_trend:total',
      type: 'spend_trend',
      severity: up ? 'warning' : 'positive',
      title: up ? `Spend is up ${change}% on the previous period` : `Spend is down ${Math.abs(change)}% on the previous period`,
      body: `${grouped(facts.current.spentMinor, facts.scope.currency)} was recorded in this window against ${grouped(
        previous.spentMinor,
        facts.scope.currency,
      )} in the one before it.`,
      metric: {
        currentMinor: facts.current.spentMinor,
        previousMinor: previous.spentMinor,
        changePercent: change,
        differenceMinor: facts.current.spentMinor - previous.spentMinor,
      },
      window: facts.window,
    }),
  ];
}

function ruleCategoryDeltas(facts) {
  const previousCategories = categoryByName(facts.previous?.categories);
  if (!previousCategories.size) return [];

  const deltas = [];
  for (const row of facts.current.categories) {
    const before = previousCategories.get(row.category);
    if (!before || !before.totalMinor) continue;
    const change = percentChange(row.totalMinor, before.totalMinor);
    if (change == null || Math.abs(change) < CATEGORY_DELTA_THRESHOLD_PERCENT) continue;
    deltas.push({ row, before, change });
  }

  deltas.sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.row.category.localeCompare(b.row.category));

  return deltas.slice(0, MAX_CATEGORY_DELTA_INSIGHTS).map(({ row, before, change }) => {
    const up = change > 0;
    return insight({
      id: `category_change:${row.category}`,
      type: 'category_change',
      severity: up ? 'warning' : 'positive',
      title: `${row.label} ${up ? 'rose' : 'fell'} ${Math.abs(change)}%`,
      body: `${grouped(row.totalMinor, facts.scope.currency)} this period vs ${grouped(
        before.totalMinor,
        facts.scope.currency,
      )} the previous one (${up ? '+' : ''}${change}%).`,
      metric: {
        category: row.category,
        currentMinor: row.totalMinor,
        previousMinor: before.totalMinor,
        changePercent: change,
        shareOfSpendPercent: row.percentOfSpend,
      },
      window: facts.window,
    });
  });
}

function ruleTopCategory(facts) {
  const top = facts.current.categories[0];
  if (!top || !facts.current.spentMinor) return [];
  // A single-category window says nothing a pie chart does not already say.
  if (facts.current.categories.length < 2 && top.percentOfSpend === 100) return [];
  return [
    insight({
      id: `top_category:${top.category}`,
      type: 'top_category',
      severity: 'info',
      title: `${top.label} is your biggest line`,
      body: `${grouped(top.totalMinor, facts.scope.currency)} — ${top.percentOfSpend}% of everything recorded in this window, across ${
        top.expenseCount
      } expense${top.expenseCount === 1 ? '' : 's'}.`,
      metric: {
        category: top.category,
        totalMinor: top.totalMinor,
        percentOfSpend: top.percentOfSpend,
        expenseCount: top.expenseCount,
      },
      window: facts.window,
    }),
  ];
}

function ruleContributionShare(facts) {
  if (!facts.current.spentMinor) return [];
  const funded = facts.current.fundedPercent;
  const name = facts.current.viewerName || 'You';
  const severity = funded >= 60 ? 'warning' : funded >= 40 ? 'positive' : 'info';
  return [
    insight({
      id: 'contribution_share:me',
      type: 'contribution_share',
      severity,
      title: `${name} fund ${funded}% of this ${facts.scope.isSingleGroup ? 'group' : 'scope'}`,
      body: `${grouped(facts.current.paidMinor, facts.scope.currency)} paid out vs ${grouped(
        facts.current.consumedMinor,
        facts.scope.currency,
      )} consumed, so the net position is ${grouped(Math.abs(facts.current.netMinor), facts.scope.currency)} ${
        facts.current.netMinor >= 0 ? 'owed to you' : 'you still owe'
      }.`,
      metric: {
        paidMinor: facts.current.paidMinor,
        consumedMinor: facts.current.consumedMinor,
        netMinor: facts.current.netMinor,
        fundedPercent: funded,
        spentMinor: facts.current.spentMinor,
      },
      window: facts.window,
    }),
  ];
}

function ruleSpendVsGroupAverage(facts) {
  const members = facts.current.members || [];
  if (members.length < 2) return [];
  const totalConsumed = members.reduce((sum, member) => sum + member.consumedMinor, 0);
  if (!totalConsumed) return [];
  const averageMinor = Math.round(totalConsumed / members.length);
  const me = members.find((member) => member.userId === facts.current.viewerId);
  if (!me || !averageMinor) return [];

  const change = percentChange(me.consumedMinor, averageMinor);
  if (change == null || Math.abs(change) < 10) return [];
  const above = change > 0;
  return [
    insight({
      id: 'group_average:consumed',
      type: 'spend_vs_group_average',
      severity: above ? 'warning' : 'positive',
      title: above
        ? `You consume ${change}% more than the group average`
        : `You consume ${Math.abs(change)}% less than the group average`,
      body: `Your share of the ledger is ${grouped(me.consumedMinor, facts.scope.currency)} against an average of ${grouped(
        averageMinor,
        facts.scope.currency,
      )} across ${members.length} active members.`,
      metric: {
        consumedMinor: me.consumedMinor,
        averageConsumedMinor: averageMinor,
        differenceMinor: me.consumedMinor - averageMinor,
        memberCount: members.length,
        changePercent: change,
      },
      window: facts.window,
    }),
  ];
}

function ruleMostActiveMember(facts) {
  const members = [...(facts.current.members || [])].sort(
    (a, b) => b.expenseCount - a.expenseCount || a.userId.localeCompare(b.userId),
  );
  const top = members[0];
  if (!top || top.expenseCount < 2) return [];
  const totalMoves = members.reduce((sum, member) => sum + member.expenseCount, 0);
  return [
    insight({
      id: `most_active_member:${top.userId}`,
      type: 'most_active_member',
      severity: 'info',
      title: `${top.name || 'A member'} touches the most expenses`,
      body: `${top.name || 'They'} appear on ${top.expenseCount} of ${totalMoves} ledger lines in this window and have paid ${grouped(
        top.paidMinor,
        facts.scope.currency,
      )}.`,
      metric: {
        userId: top.userId,
        expenseCount: top.expenseCount,
        totalExpenseLines: totalMoves,
        paidMinor: top.paidMinor,
        sharePercent: top.sharePercent,
      },
      window: facts.window,
    }),
  ];
}

function ruleDebtAging(facts) {
  const rows = (facts.aging || []).filter((row) => row.netMinor < 0);
  const outstandingMinor = rows.reduce((sum, row) => sum + -row.netMinor, 0);
  if (!outstandingMinor) return [];

  const oldest = rows
    .map((row) => ({ ...row, ageDays: daysBetween(row.oldestExpenseDate, facts.now) }))
    .filter((row) => row.ageDays != null)
    .sort((a, b) => b.ageDays - a.ageDays || a.userId.localeCompare(b.userId))[0];
  if (!oldest || oldest.ageDays < DEBT_AGE_DAYS) return [];

  const who = oldest.userId === facts.current.viewerId ? 'You' : oldest.name || 'A member';
  return [
    insight({
      id: `debt_aging:${oldest.userId}`,
      type: 'debt_aging',
      severity: 'warning',
      title: `${grouped(outstandingMinor, facts.scope.currency)} is still unsettled`,
      body: `${who} last shared an expense ${oldest.ageDays} days ago (${new Date(oldest.oldestExpenseDate)
        .toISOString()
        .slice(0, 10)}) and still owes ${grouped(-oldest.netMinor, facts.scope.currency)} overall.`,
      metric: {
        userId: oldest.userId,
        owesMinor: -oldest.netMinor,
        outstandingMinor,
        ageDays: oldest.ageDays,
        oldestExpenseDate: new Date(oldest.oldestExpenseDate).toISOString(),
        debtorCount: rows.length,
      },
      window: { preset: 'all', from: null, to: null },
    }),
  ];
}

function rulePendingSettlements(facts) {
  const pending = facts.pendingSettlements || { count: 0, amountMinor: 0 };
  if (!pending.count) return [];
  return [
    insight({
      id: 'settlement_pending:count',
      type: 'settlement_pending',
      severity: 'info',
      title: `${pending.count} settlement${pending.count === 1 ? '' : 's'} waiting on someone`,
      body: `${grouped(
        pending.amountMinor,
        facts.scope.currency,
      )} is proposed but not confirmed yet. Nothing moves until the receiver confirms.`,
      metric: { count: pending.count, amountMinor: pending.amountMinor },
      window: { preset: 'all', from: null, to: null },
    }),
  ];
}

function ruleBudgetPressure(facts) {
  const pressure = (facts.budgets || []).filter((budget) => budget.percentUsed >= 75 || budget.isOverBudget);
  if (!pressure.length) return [];
  const worst = [...pressure].sort((a, b) => b.percentUsed - a.percentUsed || a.id.localeCompare(b.id))[0];
  const over = worst.isOverBudget;
  return [
    insight({
      id: `budget_pressure:${worst.id}`,
      type: 'budget_pressure',
      severity: over || worst.percentUsed >= 90 ? 'warning' : 'info',
      title: over ? `${worst.title} is over budget` : `${worst.title} has used ${worst.percentUsed}% of its budget`,
      body: `${grouped(worst.spentMinor, worst.currency)} of ${grouped(worst.limitMinor, worst.currency)} spent${
        worst.periodKey ? ` in ${worst.periodKey}` : ''
      }. ${over ? 'Adjust the limit or slow the spend down.' : 'A quiet warning, not a charge.'}`,
      metric: {
        budgetId: worst.id,
        percentUsed: worst.percentUsed,
        spentMinor: worst.spentMinor,
        limitMinor: worst.limitMinor,
        remainingMinor: worst.remainingMinor,
        thresholdHit: worst.thresholdHit,
        pressuredCount: pressure.length,
      },
      window: { preset: worst.periodKey ? 'this_month' : 'overall', from: null, to: null },
    }),
  ];
}

function ruleGroupLeader(facts) {
  const rows = facts.groupTotals || [];
  // Mixing currencies in one "which group cost most" claim would be meaningless.
  if (rows.length < 2 || !facts.scope.currency) return [];
  const top = [...rows].sort((a, b) => b.spentMinor - a.spentMinor || a.groupId.localeCompare(b.groupId))[0];
  const myMinor = facts.current.spentMinor;
  if (!myMinor) return [];
  return [
    insight({
      id: `group_leader:${top.groupId}`,
      type: 'group_leader',
      severity: 'info',
      title: `${top.groupName} is where the money went`,
      body: `${grouped(top.spentMinor, facts.scope.currency)} of the ${grouped(
        myMinor,
        facts.scope.currency,
      )} across your ${rows.length} groups in this window came from that group (${round2((top.spentMinor / myMinor) * 100)}%).`,
      metric: {
        groupId: top.groupId,
        spentMinor: top.spentMinor,
        totalMinor: myMinor,
        sharePercent: round2((top.spentMinor / myMinor) * 100),
        groupCount: rows.length,
      },
      window: facts.window,
    }),
  ];
}

const RULES = [
  ruleBudgetPressure,
  ruleDebtAging,
  ruleSpendTrend,
  ruleCategoryDeltas,
  ruleTopCategory,
  ruleContributionShare,
  ruleSpendVsGroupAverage,
  ruleMostActiveMember,
  rulePendingSettlements,
  ruleGroupLeader,
];

/** Pure: facts in, insights out. Sorted so the same facts always render the same list. */
function applyRules(facts) {
  const collected = [];
  for (const rule of RULES) {
    collected.push(...rule(facts));
  }
  collected.sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    return a.id.localeCompare(b.id);
  });
  return collected;
}

/* ------------------------------------------------------------------ fact loading */

/** Oldest participation date per member — the aging input, straight from the ledger. */
async function oldestParticipationByMember({ groupIds }) {
  if (!groupIds.length) return new Map();
  const rows = await Expense.aggregate([
    { $match: { groupId: { $in: groupIds }, isDeleted: false } },
    { $unwind: '$participants' },
    { $group: { _id: '$participants.userId', oldestExpenseDate: { $min: '$expenseDate' } } },
  ]);
  return new Map(rows.map((row) => [toId(row._id), row.oldestExpenseDate]));
}

async function budgetsFor(scope) {
  if (scope.groupIds.length !== 1) return [];
  const budgets = await Budget.find({ groupId: scope.groupIds[0], isActive: true }).lean();
  const now = scope.now ?? new Date();
  // alert: false — reading insights must never consume a threshold's one-shot alert claim.
  return Promise.all(budgets.map((budget) => budgetService.evaluate(budget, { now, alert: false })));
}

/** Per-group spend for the cross-group leader rule; one small aggregate per group. */
async function sumForGroup(group, expenseDate) {
  const rows = await analyticsService.spendByCurrency({
    groupIds: [analyticsService.oid(group.id)],
    expenseDate,
  });
  return rows.reduce((sum, row) => sum + row.totalMinor, 0);
}

/**
 * @param {object} input
 * @param {string|null} input.groupId  when null the scope is every active group of the caller
 */
async function collectFacts({ userId, groupId = null, query = {}, now = new Date() }) {
  const scope = await analyticsService.resolveScope({ userId, groupId });
  const { expenseDate, window } = analyticsService.windowFor(query, now);
  const previousExpenseDate = analyticsService.previousWindowFor(expenseDate, now);

  const [categories, members, position, pending, oldestByMember] = await Promise.all([
    analyticsService.categoryBreakdown({ ...scope, expenseDate }),
    analyticsService.memberBreakdown({ ...scope, expenseDate }),
    analyticsService.viewerPosition({ ...scope, expenseDate, viewerId: scope.viewerId }),
    analyticsService.pendingSettlements(scope),
    oldestParticipationByMember(scope),
  ]);

  const budgets = await budgetsFor({ ...scope, now });

  let previous = null;
  if (previousExpenseDate) {
    const [previousCategories, previousPosition] = await Promise.all([
      analyticsService.categoryBreakdown({ ...scope, expenseDate: previousExpenseDate }),
      analyticsService.viewerPosition({ ...scope, expenseDate: previousExpenseDate, viewerId: scope.viewerId }),
    ]);
    previous = {
      spentMinor: previousPosition.spentMinor,
      paidMinor: previousPosition.paidMinor,
      consumedMinor: previousPosition.consumedMinor,
      categories: previousCategories,
      window: {
        preset: 'previous',
        from: previousExpenseDate.$gte.toISOString(),
        to: previousExpenseDate.$lt.toISOString(),
      },
    };
  }

  const viewer = await User.findById(analyticsService.oid(scope.viewerId)).select('name').lean();
  const viewerName = viewer?.name ?? null;

  const groupTotals = scope.isSingleGroup
    ? []
    : await Promise.all(
        scope.groups.map(async (group) => ({
          groupId: group.id,
          groupName: group.name,
          currency: group.baseCurrency,
          spentMinor: await sumForGroup(group, expenseDate),
        })),
      );

  const aging = members.map((member) => ({
    userId: member.user.id,
    name: member.user.name,
    netMinor: member.netMinor,
    oldestExpenseDate: oldestByMember.get(member.user.id) ?? null,
  }));

  return {
    scope: { ...scope, now },
    window,
    current: {
      spentMinor: position.spentMinor,
      expenseCount: position.expenseCount,
      paidMinor: position.paidMinor,
      consumedMinor: position.consumedMinor,
      netMinor: position.netMinor,
      fundedPercent: position.fundedPercent,
      viewerId: scope.viewerId,
      viewerName,
      categories,
      members: members.map((member) => ({
        userId: member.user.id,
        name: member.user.name,
        paidMinor: member.paidMinor,
        consumedMinor: member.consumedMinor,
        netMinor: member.netMinor,
        expenseCount: member.expenseCount,
        sharePercent: member.sharePercent,
      })),
    },
    previous,
    pendingSettlements: pending,
    budgets,
    aging,
    groupTotals,
    now,
  };
}

async function getInsights({ userId, groupId = null, query = {}, now = new Date() }) {
  if (groupId && !mongoose.isValidObjectId(String(groupId))) throw ApiError.badRequest('Invalid group id');
  // `?scope=me` opts out of the group in the path: the caller's own active groups become the
  // scope, so the same rules answer the cross-group question.
  const requestedGroupId = query && query.scope === 'me' ? null : groupId;
  const facts = await collectFacts({ userId, groupId: requestedGroupId, query, now });
  const insights = applyRules(facts);

  return {
    scope: {
      groupId: facts.scope.isSingleGroup ? facts.scope.groups[0].id : null,
      groupName: facts.scope.isSingleGroup ? facts.scope.groups[0].name : null,
      mode: facts.scope.isSingleGroup ? 'group' : 'me',
      groupCount: facts.scope.groups.length,
      currency: facts.scope.currency,
      currencies: facts.scope.currencies,
    },
    window: facts.window,
    count: insights.length,
    generatedAt: now.toISOString(),
    insights,
    // Every claim above is reproducible: these are the aggregation rows the rules consumed.
    evidence: {
      spentMinor: facts.current.spentMinor,
      paidMinor: facts.current.paidMinor,
      consumedMinor: facts.current.consumedMinor,
      netMinor: facts.current.netMinor,
      previousSpentMinor: facts.previous ? facts.previous.spentMinor : null,
      categories: facts.current.categories.map((row) => ({
        category: row.category,
        label: categoryLabel(row.category),
        totalMinor: row.totalMinor,
        percentOfSpend: row.percentOfSpend,
      })),
      members: facts.current.members.map((member) => ({
        userId: member.userId,
        name: member.name,
        paidMinor: member.paidMinor,
        consumedMinor: member.consumedMinor,
        netMinor: member.netMinor,
      })),
      budgetCount: facts.budgets.length,
      pendingSettlementCount: facts.pendingSettlements.count,
    },
  };
}

/**
 * Names the HTTP layer uses: one group, or the caller's whole account. Both are the same
 * engine; only the scope differs.
 */
const groupInsights = ({ userId, groupId, query = {}, now = new Date() }) =>
  getInsights({ userId, groupId, query, now });

const personalInsights = ({ userId, query = {}, now = new Date() }) =>
  getInsights({ userId, groupId: null, query, now });

module.exports = {
  applyRules,
  collectFacts,
  getInsights,
  groupInsights,
  personalInsights,
  insight,
  percentChange,
  daysBetween,
  oldestParticipationByMember,
  RULES,
  CATEGORY_DELTA_THRESHOLD_PERCENT,
  TREND_THRESHOLD_PERCENT,
  DEBT_AGE_DAYS,
};
