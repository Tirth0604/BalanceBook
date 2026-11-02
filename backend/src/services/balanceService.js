'use strict';

/**
 * Balance derivation for a group. There is no stored balance anywhere: every figure the
 * API returns is recomputed from the expense ledger plus completed settlements via the
 * pure engine in `src/algorithms`. The expenses module calls `computeGroupBalances` after
 * any write so an edited or deleted expense rebuilds the ledger correctly.
 */

const ApiError = require('../utils/ApiError');
const money = require('../utils/money');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const User = require('../models/User');
const {
  computeNetBalances,
  computePairwiseDebts,
  totalNet,
  toSolverInput,
} = require('../algorithms/balanceCalculator');
const { greedySettlement } = require('../algorithms/greedySettlement');
const { minimumSettlement } = require('../algorithms/minimumSettlement');
const config = require('../config/env');

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function toId(value) {
  return value == null ? null : String(value);
}

/** Map a raw expense document onto the shape `computeNetBalances` consumes. */
function expenseRow(expense) {
  return {
    id: toId(expense._id ?? expense.id),
    paidBy: toId(expense.paidBy),
    groupAmountMinor: expense.groupAmountMinor,
    participants: (expense.participants || []).map((participant) => ({
      userId: toId(participant.userId),
      shareMinor: participant.shareMinor,
    })),
    isDeleted: Boolean(expense.isDeleted),
  };
}

/** Settlements are passed whole; the engine itself keeps only completed ones. */
function settlementRow(settlement) {
  return {
    id: toId(settlement._id ?? settlement.id),
    payerId: toId(settlement.payerId),
    receiverId: toId(settlement.receiverId),
    amountMinor: settlement.amountMinor,
    status: settlement.status,
  };
}

function userRef(user) {
  if (!user) return { id: null, name: '', email: null, avatarUrl: null };
  return {
    id: toId(user._id ?? user.id),
    name: user.name ?? '',
    email: user.email ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}

/**
 * Loads the raw ledger for a group and folds it through the pure calculator. Everything
 * downstream (balances, pairwise views, settlement suggestions, invariant checks) reads
 * from this single snapshot so a request never mixes two different ledgers.
 */
async function buildBalances(groupId, { session = null } = {}) {
  const group = await withSession(Group.findById(groupId), session);
  if (!group) throw ApiError.notFound('Group not found');

  const [expenseDocs, settlementDocs] = await Promise.all([
    withSession(Expense.find({ groupId: group._id, isDeleted: false }).lean(), session),
    withSession(Settlement.find({ groupId: group._id }).lean(), session),
  ]);

  const memberIds = group.activeMemberIds();
  const expenses = expenseDocs.map(expenseRow);
  const settlements = settlementDocs.map(settlementRow);

  const balances = computeNetBalances({ memberIds, expenses, settlements });

  return { group, currency: group.baseCurrency, memberIds, expenses, settlements, balances };
}

/**
 * The graded invariant: a closed group ledger must net to exactly zero. Called after every
 * financial write; a non-zero sum is a data-integrity bug, so it surfaces as a 500 and the
 * surrounding transaction rolls back.
 */
function assertGroupInvariant(groupId, balances) {
  const sum = totalNet(balances);
  if (sum !== 0) {
    throw new ApiError(500, 'FINANCIAL_INVARIANT_VIOLATION', 'Group balances do not net to zero', {
      groupId: toId(groupId),
      totalNetMinor: sum,
    });
  }
  return sum;
}

/**
 * Per-counterparty "you owe / owed to you" view derived from the pairwise IOU graph. The
 * net per member equals that member's overall balance, so this only needs the debt edges;
 * `debtBetween(from, to)` answers "how much does `from` currently owe `to`", which is the
 * ceiling `recordSettlement` enforces.
 */
function pairwiseOwedTo({ balances, memberIds, debts = [] } = {}) {
  const matrix = new Map();
  const owedToMe = new Map();
  const iOwe = new Map();

  for (const debt of debts) {
    const from = toId(debt.from);
    const to = toId(debt.to);
    const key = `${from}->${to}`;
    matrix.set(key, (matrix.get(key) || 0) + debt.amountMinor);
    iOwe.set(from, (iOwe.get(from) || 0) + debt.amountMinor);
    owedToMe.set(to, (owedToMe.get(to) || 0) + debt.amountMinor);
  }

  const rows = (balances || []).map((balance) => ({
    userId: balance.userId,
    netMinor: balance.netMinor,
    owedToMeMinor: owedToMe.get(balance.userId) || 0,
    iOweMinor: iOwe.get(balance.userId) || 0,
  }));

  const debtBetween = (from, to) => matrix.get(`${toId(from)}->${toId(to)}`) || 0;

  return {
    memberIds: memberIds || (balances || []).map((balance) => balance.userId),
    rows,
    matrix: Object.fromEntries(matrix),
    debtBetween,
  };
}

async function loadUserRefs(ids, session) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const users = await withSession(User.find({ _id: { $in: unique } }).select('name email avatarUrl').lean(), session);
  const map = new Map();
  for (const user of users) map.set(toId(user._id), userRef(user));
  return map;
}

/**
 * Contract `Balance` rows for a group plus the settled-up summary. `viewerId` (optional)
 * marks which row is the caller; the expenses module passes only `{ session }`.
 */
async function computeGroupBalances(groupId, { session = null, viewerId = null } = {}) {
  const snapshot = await buildBalances(groupId, { session });
  assertGroupInvariant(snapshot.group._id, snapshot.balances);

  const viewer = toId(viewerId);
  const refs = await loadUserRefs(
    snapshot.balances.map((balance) => balance.userId),
    session,
  );

  const members = snapshot.balances.map((balance) => {
    const ref = refs.get(balance.userId) || { id: balance.userId, name: '', email: null, avatarUrl: null };
    return {
      user: ref,
      displayName: ref.name,
      netMinor: balance.netMinor,
      net: money.fromMinor(balance.netMinor, snapshot.currency),
      currency: snapshot.currency,
      paidMinor: balance.paidMinor,
      consumedMinor: balance.consumedMinor,
      owedToMeMinor: balance.netMinor > 0 ? balance.netMinor : 0,
      iOweMinor: balance.netMinor < 0 ? -balance.netMinor : 0,
      status: balance.status,
      isMe: balance.userId === viewer,
    };
  });

  const groupTotalMinor = snapshot.expenses.reduce((sum, expense) => sum + expense.groupAmountMinor, 0);

  return {
    groupId: toId(snapshot.group._id),
    currency: snapshot.currency,
    members,
    groupTotalMinor,
    isSettledUp: snapshot.balances.every((balance) => balance.netMinor === 0),
  };
}

/**
 * Optimised settlement plan for the group. `naiveTransactionCount` is the raw pairwise IOU
 * count (before optimisation) so the UI can show how many transfers the plan removes.
 */
async function suggestSettlements(groupId, { algorithm = 'minimum', maxSize, session = null } = {}) {
  const resolvedMaxSize =
    Number.isInteger(maxSize) && maxSize > 0 ? maxSize : config.SETTLEMENT_EXACT_MAX_SIZE;

  const snapshot = await buildBalances(groupId, { session });
  assertGroupInvariant(snapshot.group._id, snapshot.balances);

  const solverInput = toSolverInput(snapshot.balances);
  const naiveDebts = computePairwiseDebts({
    memberIds: snapshot.memberIds,
    expenses: snapshot.expenses,
    settlements: snapshot.settlements,
  });
  const naiveTransactionCount = naiveDebts.length;

  const runMinimum = () => minimumSettlement(solverInput, { maxSize: resolvedMaxSize });
  const plan = algorithm === 'greedy' ? greedySettlement(solverInput) : runMinimum();

  const refs = await loadUserRefs(
    plan.transactions.flatMap((transaction) => [transaction.fromId, transaction.toId]),
    session,
  );

  const transactions = plan.transactions.map((transaction) => ({
    from: refs.get(transaction.fromId) || { id: transaction.fromId, name: '', email: null, avatarUrl: null },
    to: refs.get(transaction.toId) || { id: transaction.toId, name: '', email: null, avatarUrl: null },
    amountMinor: transaction.amountMinor,
    amount: money.fromMinor(transaction.amountMinor, snapshot.currency),
  }));

  const reductionPercent =
    naiveTransactionCount > 0
      ? Math.round(((naiveTransactionCount - plan.transactionCount) / naiveTransactionCount) * 10000) / 100
      : 0;

  return {
    groupId: toId(snapshot.group._id),
    currency: snapshot.currency,
    algorithm: plan.algorithm,
    transactions,
    transactionCount: plan.transactionCount,
    naiveTransactionCount,
    reductionPercent,
    // The exact solver silently degrades to greedy past maxSize; surface which one ran.
    ...(plan.fallbackReason ? { fallbackReason: plan.fallbackReason } : {}),
  };
}

module.exports = {
  computeGroupBalances,
  assertGroupInvariant,
  pairwiseOwedTo,
  suggestSettlements,
  buildBalances,
  expenseRow,
  settlementRow,
  toId,
  withSession,
};
