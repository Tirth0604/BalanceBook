'use strict';

/**
 * Analytics over the ledger. Every number the API reports here comes out of a MongoDB
 * aggregation: the collections are never pulled into Node and summed in a loop, because a
 * group can hold years of expenses and the answer must stay a single round trip.
 *
 * The scope rule is the security boundary: a caller may name one group (and must be an
 * active member of it) or name none, in which case the scope is the caller's own active
 * groups, derived from the group documents themselves. A client-supplied list of group ids
 * is never trusted.
 */

const mongoose = require('mongoose');

const Expense = require('../models/Expense');
const Group = require('../models/Group');
const Settlement = require('../models/Settlement');
const User = require('../models/User');

const ApiError = require('../utils/ApiError');
const money = require('../utils/money');
const { resolveRange } = require('../utils/pagination');
const { SETTLEMENT_STATUS, categoryLabel } = require('../utils/constants');

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHLY_SERIES_POINTS = 12;
const RECENT_ACTIVITY_LIMIT = 8;
const USER_FIELDS = 'name email avatarUrl';

/** Anything a member still has to confirm or resolve counts as pending work. */
const PENDING_SETTLEMENT_STATUSES = [
  SETTLEMENT_STATUS.PENDING,
  SETTLEMENT_STATUS.AWAITING_CONFIRMATION,
  SETTLEMENT_STATUS.DISPUTED,
];

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

/** Percent of a total, guarded so an empty window yields 0 rather than NaN. */
function percentOf(partMinor, totalMinor) {
  if (!totalMinor) return 0;
  return round2((partMinor / totalMinor) * 100);
}

function moneyText(minor, currencyCode) {
  if (!currencyCode) return null;
  return money.fromMinor(minor, currencyCode);
}

function displayText(minor, currencyCode) {
  if (!currencyCode) return null;
  return money.format(minor, currencyCode);
}

/**
 * Resolve what the caller is allowed to read.
 * @returns {{groupIds, groups, viewerId, currency, currencies, isSingleGroup}}
 */
async function resolveScope({ userId, groupId = null } = {}) {
  const viewerId = toId(userId);
  if (!viewerId) throw ApiError.unauthorized();

  if (groupId) {
    const group = await Group.findById(oid(groupId)).select('name baseCurrency members').lean();
    if (!group) throw ApiError.notFound('Group not found');
    const membership = (group.members || []).find(
      (member) => toId(member.userId) === viewerId && member.status === 'active',
    );
    if (!membership) throw ApiError.forbidden('You are not a member of this group');
    return {
      viewerId,
      groupIds: [group._id],
      groups: [{ id: toId(group._id), name: group.name, baseCurrency: group.baseCurrency }],
      ...currencyFor([group]),
      isSingleGroup: true,
    };
  }

  // $elemMatch keeps userId and status on the same array element.
  const groups = await Group.find({ members: { $elemMatch: { userId: oid(viewerId), status: 'active' } } })
    .select('name baseCurrency')
    .lean();

  return {
    viewerId,
    groupIds: groups.map((group) => group._id),
    groups: groups.map((group) => ({ id: toId(group._id), name: group.name, baseCurrency: group.baseCurrency })),
    ...currencyFor(groups),
    isSingleGroup: false,
  };
}

/**
 * Cross-group scopes can mix base currencies. Reporting one currency for that sum would be
 * a lie, so `currency` becomes null and the per-currency breakdown is always returned too.
 */
function currencyFor(groups) {
  const currencies = [...new Set(groups.map((group) => String(group.baseCurrency || 'INR').toUpperCase()))];
  return {
    currency: currencies.length <= 1 ? currencies[0] ?? 'INR' : null,
    currencies,
    mixedCurrency: currencies.length > 1,
  };
}

/** `?range` / `?from` / `?to` -> the mongo window plus a description for the response. */
function windowFor(query = {}, now = new Date()) {
  const range = resolveRange(query, now) ?? {};
  const expenseDate = range.expenseDate ?? {};
  const from = expenseDate.$gte ?? null;
  const to = expenseDate.$lte ?? expenseDate.$lt ?? null;
  return {
    expenseDate,
    window: {
      preset: query.range ?? (query.from || query.to ? 'custom' : 'all'),
      from: from ? new Date(from).toISOString() : null,
      to: to ? new Date(to).toISOString() : null,
    },
  };
}

function matchFor({ groupIds, expenseDate = {}, extra = {} }) {
  if (!groupIds.length) return null;
  const match = { groupId: { $in: groupIds }, isDeleted: false, ...extra };
  const range = {};
  for (const operator of ['$gt', '$gte', '$lt', '$lte']) {
    if (expenseDate[operator]) range[operator] = expenseDate[operator];
  }
  // An empty object would be an equality match on `{}` and silently filter everything out.
  if (Object.keys(range).length) match.expenseDate = range;
  return match;
}

/**
 * The window that sits immediately before the current one, for month-over-month style
 * comparisons. Returns null when the current window has no computable length (open-ended
 * `all`), because then there is no honest "previous period" to name.
 */
function previousWindowFor(expenseDate, now = new Date()) {
  const start = expenseDate.$gte;
  if (!start) return null;
  const end = expenseDate.$lte ?? expenseDate.$lt ?? now;
  const span = Math.max(1, new Date(end).getTime() - new Date(start).getTime());
  return { $gte: new Date(new Date(start).getTime() - span), $lt: new Date(start) };
}

/** Sum of a numeric expression over every participant of an expense, in the pipeline. */
function sumShareForViewer(viewerOid) {
  return {
    $reduce: {
      input: '$participants',
      initialValue: 0,
      in: {
        $add: ['$$value', { $cond: [{ $eq: ['$$this.userId', viewerOid] }, '$$this.shareMinor', 0] }],
      },
    },
  };
}

async function userRefs(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const users = await User.find({ _id: { $in: unique.map(oid) } }).select(USER_FIELDS).lean();
  const map = new Map();
  for (const user of users) {
    map.set(toId(user._id), { id: toId(user._id), name: user.name ?? '', email: user.email ?? null, avatarUrl: user.avatarUrl ?? null });
  }
  return map;
}

function emptyRef(id) {
  return { id: toId(id), name: '', email: null, avatarUrl: null };
}

/* ------------------------------------------------------------------ aggregations */

/**
 * Category totals for the scope. Deleted expenses are excluded by `matchFor`, so a soft
 * delete can never keep inflating a pie chart.
 */
async function categoryBreakdown({ groupIds, expenseDate, viewerId, currency = null }) {
  const match = matchFor({ groupIds, expenseDate });
  if (!match) return [];
  const viewerOid = viewerId ? oid(viewerId) : null;
  const rows = await Expense.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$category',
        totalMinor: { $sum: '$groupAmountMinor' },
        expenseCount: { $sum: 1 },
        myPaidMinor: viewerOid
          ? { $sum: { $cond: [{ $eq: ['$paidBy', viewerOid] }, '$groupAmountMinor', 0] } }
          : { $sum: 0 },
        myConsumedMinor: viewerOid ? { $sum: sumShareForViewer(viewerOid) } : { $sum: 0 },
      },
    },
    { $sort: { totalMinor: -1, _id: 1 } },
  ]);

  const grandTotal = rows.reduce((sum, row) => sum + row.totalMinor, 0);
  return rows.map((row) => ({
    category: row._id,
    label: categoryLabel(row._id),
    totalMinor: row.totalMinor,
    amount: moneyText(row.totalMinor, currency),
    percentOfSpend: percentOf(row.totalMinor, grandTotal),
    expenseCount: row.expenseCount,
    myPaidMinor: row.myPaidMinor ?? 0,
    myConsumedMinor: row.myConsumedMinor ?? 0,
  }));
}

/** Per-member paid / consumed. `netMinor` follows the documented derivation. */
async function memberBreakdown({ groupIds, expenseDate, currency = null }) {
  const match = matchFor({ groupIds, expenseDate });
  if (!match) return [];

  const [rows, settledOut, settledIn] = await Promise.all([
    Expense.aggregate([
      { $match: match },
      {
        $project: {
          moves: {
            $concatArrays: [
              {
                $map: {
                  input: '$participants',
                  as: 'participant',
                  in: { userId: '$$participant.userId', kind: 'consumed', minor: '$$participant.shareMinor' },
                },
              },
              [{ userId: '$paidBy', kind: 'paid', minor: '$groupAmountMinor' }],
            ],
          },
          expenseId: '$_id',
        },
      },
      { $unwind: '$moves' },
      {
        $group: {
          _id: '$moves.userId',
          paidMinor: { $sum: { $cond: [{ $eq: ['$moves.kind', 'paid'] }, '$moves.minor', 0] } },
          consumedMinor: { $sum: { $cond: [{ $eq: ['$moves.kind', 'consumed'] }, '$moves.minor', 0] } },
          // Distinct, otherwise the payer of a 4-person expense counts it five times.
          expenseIds: { $addToSet: '$expenseId' },
        },
      },
      { $sort: { paidMinor: -1, _id: 1 } },
    ]),
    Settlement.aggregate([
      { $match: { groupId: { $in: groupIds }, status: SETTLEMENT_STATUS.COMPLETED } },
      { $group: { _id: '$payerId', minor: { $sum: '$amountMinor' } } },
    ]),
    Settlement.aggregate([
      { $match: { groupId: { $in: groupIds }, status: SETTLEMENT_STATUS.COMPLETED } },
      { $group: { _id: '$receiverId', minor: { $sum: '$amountMinor' } } },
    ]),
  ]);

  const outByUser = new Map(settledOut.map((row) => [toId(row._id), row.minor]));
  const inByUser = new Map(settledIn.map((row) => [toId(row._id), row.minor]));
  const totalPaid = rows.reduce((sum, row) => sum + row.paidMinor, 0);
  const refs = await userRefs(rows.map((row) => row._id));

  return rows.map((row) => {
    const id = toId(row._id);
    const settledOutMinor = outByUser.get(id) ?? 0;
    const settledInMinor = inByUser.get(id) ?? 0;
    const netMinor = row.paidMinor - row.consumedMinor - settledInMinor + settledOutMinor;
    return {
      user: refs.get(id) ?? emptyRef(id),
      paidMinor: row.paidMinor,
      consumedMinor: row.consumedMinor,
      settledOutMinor,
      settledInMinor,
      netMinor,
      expenseCount: (row.expenseIds || []).length,
      sharePercent: percentOf(row.paidMinor, totalPaid),
      status: netMinor > 0 ? 'creditor' : netMinor < 0 ? 'debtor' : 'settled',
    };
  });
}

/**
 * Time buckets. `$dateTrunc` is not available on every supported server, so the key is
 * built from `$dateToString` (UTC) and Monday-aligned weeks use date arithmetic instead.
 */
function bucketExpression(granularity) {
  if (granularity === 'year') return { $dateToString: { format: '%Y', date: '$expenseDate', timezone: 'UTC' } };
  if (granularity === 'month') return { $dateToString: { format: '%Y-%m', date: '$expenseDate', timezone: 'UTC' } };
  if (granularity === 'week') {
    const daysSinceMonday = { $subtract: [{ $isoDayOfWeek: '$expenseDate' }, 1] };
    const monday = { $subtract: ['$expenseDate', { $multiply: [DAY_MS, daysSinceMonday] }] };
    return { $dateToString: { format: '%Y-%m-%d', date: monday, timezone: 'UTC' } };
  }
  return { $dateToString: { format: '%Y-%m-%d', date: '$expenseDate', timezone: 'UTC' } };
}

async function trendSeries({ groupIds, expenseDate, granularity = 'month', viewerId = null }) {
  const match = matchFor({ groupIds, expenseDate });
  if (!match) return [];
  const viewerOid = viewerId ? oid(viewerId) : null;
  const rows = await Expense.aggregate([
    { $match: match },
    {
      $group: {
        _id: bucketExpression(granularity),
        totalMinor: { $sum: '$groupAmountMinor' },
        expenseCount: { $sum: 1 },
        paidByMeMinor: viewerOid
          ? { $sum: { $cond: [{ $eq: ['$paidBy', viewerOid] }, '$groupAmountMinor', 0] } }
          : { $sum: 0 },
        consumedByMeMinor: viewerOid ? { $sum: sumShareForViewer(viewerOid) } : { $sum: 0 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((row) => ({
    period: row._id,
    totalMinor: row.totalMinor,
    expenseCount: row.expenseCount,
    paidByMeMinor: row.paidByMeMinor ?? 0,
    consumedByMeMinor: row.consumedByMeMinor ?? 0,
  }));
}

/** Paid / consumed / net for one member across the scope — "your money" tiles. */
async function viewerPosition({ groupIds, expenseDate, viewerId }) {
  const match = matchFor({ groupIds, expenseDate });
  if (!match) {
    return { paidMinor: 0, consumedMinor: 0, netMinor: 0, fundedPercent: 0, spentMinor: 0 };
  }
  const viewerOid = oid(viewerId);

  const [ledgerRow, settledOutRow, settledInRow] = await Promise.all([
    Expense.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          paidMinor: {
            $sum: { $cond: [{ $eq: ['$paidBy', viewerOid] }, '$groupAmountMinor', 0] },
          },
          consumedMinor: { $sum: sumShareForViewer(viewerOid) },
          spentMinor: { $sum: '$groupAmountMinor' },
          expenseCount: { $sum: 1 },
        },
      },
    ]),
    Settlement.aggregate([
      { $match: { groupId: { $in: groupIds }, status: SETTLEMENT_STATUS.COMPLETED, payerId: viewerOid } },
      { $group: { _id: null, minor: { $sum: '$amountMinor' } } },
    ]),
    Settlement.aggregate([
      { $match: { groupId: { $in: groupIds }, status: SETTLEMENT_STATUS.COMPLETED, receiverId: viewerOid } },
      { $group: { _id: null, minor: { $sum: '$amountMinor' } } },
    ]),
  ]);

  const ledger = ledgerRow[0] ?? { paidMinor: 0, consumedMinor: 0, spentMinor: 0, expenseCount: 0 };
  const settledOutMinor = settledOutRow[0]?.minor ?? 0;
  const settledInMinor = settledInRow[0]?.minor ?? 0;

  // What the caller put in vs what they actually consumed are different questions, so both
  // are reported: paying for a group dinner you did not attend still counts as consumed.
  return {
    paidMinor: ledger.paidMinor,
    consumedMinor: ledger.consumedMinor,
    settledOutMinor,
    settledInMinor,
    netMinor: ledger.paidMinor - ledger.consumedMinor - settledInMinor + settledOutMinor,
    fundedPercent: percentOf(ledger.paidMinor, ledger.spentMinor),
    spentMinor: ledger.spentMinor,
    expenseCount: ledger.expenseCount,
  };
}

/** Spend folded by currency, so a mixed-currency scope still adds up truthfully. */
async function spendByCurrency({ groupIds, expenseDate }) {
  const match = matchFor({ groupIds, expenseDate });
  if (!match) return [];
  const rows = await Expense.aggregate([
    { $match: match },
    { $group: { _id: '$currency', totalMinor: { $sum: '$groupAmountMinor' }, expenseCount: { $sum: 1 } } },
    { $sort: { totalMinor: -1 } },
  ]);
  return rows.map((row) => ({ currency: row._id, totalMinor: row.totalMinor, expenseCount: row.expenseCount }));
}

async function pendingSettlements({ groupIds, expenseDate }) {
  if (!groupIds.length) return { count: 0, amountMinor: 0 };
  const match = { groupId: { $in: groupIds }, status: { $in: PENDING_SETTLEMENT_STATUSES } };
  // A settlement is a promise about money, not an expense dated in the window: it is always
  // reported whole, otherwise "pending" would silently shrink as the user filters dates.
  void expenseDate;
  const [count, amountRow] = await Promise.all([
    Settlement.countDocuments(match),
    Settlement.aggregate([
      { $match: match },
      { $group: { _id: null, amountMinor: { $sum: '$amountMinor' } } },
    ]),
  ]);
  return { count, amountMinor: amountRow[0]?.amountMinor ?? 0 };
}

async function settlementActivity({ groupIds, viewerId = null }) {
  if (!groupIds.length) {
    return { completedCount: 0, completedMinor: 0, pendingCount: 0, pendingMinor: 0, byMonth: [] };
  }
  const viewerOid = viewerId ? oid(viewerId) : null;

  const [completedRows, pending] = await Promise.all([
    Settlement.aggregate([
      { $match: { groupId: { $in: groupIds }, status: SETTLEMENT_STATUS.COMPLETED } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$confirmedAt', timezone: 'UTC' } },
          completedMinor: { $sum: '$amountMinor' },
          completedCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    pendingSettlements({ groupIds }),
  ]);

  // `confirmedAt` can be null on a legacy completed row; bucket those under an empty key
  // rather than dropping their amount, so the totals never under-report settled money.
  const completedMinor = completedRows.reduce((sum, row) => sum + row.completedMinor, 0);

  void viewerOid;
  return {
    completedCount: completedRows.reduce((sum, row) => sum + row.completedCount, 0),
    completedMinor,
    pendingCount: pending.count,
    pendingMinor: pending.amountMinor,
    byMonth: completedRows.map((row) => ({
      period: row._id ?? null,
      completedMinor: row.completedMinor,
      completedCount: row.completedCount,
    })),
  };
}

async function recentActivity({ groupIds, expenseDate, viewerId, limit = RECENT_ACTIVITY_LIMIT }) {
  const match = matchFor({ groupIds, expenseDate });
  if (!match) return [];
  const [expenses, groups] = await Promise.all([
    Expense.find(match)
      .sort({ expenseDate: -1, createdAt: -1 })
      .limit(limit)
      .select('groupId title category totalMinor currency groupAmountMinor paidBy participants expenseDate')
      .lean(),
    Group.find({ _id: { $in: groupIds } }).select('name baseCurrency').lean(),
  ]);

  const ids = new Set();
  for (const expense of expenses) {
    ids.add(toId(expense.paidBy));
    for (const participant of expense.participants || []) ids.add(toId(participant.userId));
  }
  const refs = await userRefs([...ids]);
  const groupNameById = new Map(groups.map((group) => [toId(group._id), group.name]));

  return expenses.map((expense) => {
    const viewerOidStr = toId(viewerId);
    const myShare = (expense.participants || []).reduce(
      (sum, participant) => (toId(participant.userId) === viewerOidStr ? sum + participant.shareMinor : sum),
      0,
    );
    return {
      id: toId(expense._id),
      groupId: toId(expense.groupId),
      groupName: groupNameById.get(toId(expense.groupId)) ?? null,
      title: expense.title,
      category: expense.category,
      categoryLabel: categoryLabel(expense.category),
      totalMinor: expense.totalMinor,
      groupAmountMinor: expense.groupAmountMinor,
      currency: String(expense.currency || 'INR').toUpperCase(),
      paidBy: refs.get(toId(expense.paidBy)) ?? emptyRef(expense.paidBy),
      myShareMinor: myShare,
      expenseDate: new Date(expense.expenseDate).toISOString(),
    };
  });
}

/** Flat rows for the CSV export: one line per expense in the scope. */
async function exportRows({ groupIds, expenseDate, viewerId, limit = 5000 }) {
  const match = matchFor({ groupIds, expenseDate });
  if (!match) return [];
  const [expenses, groups] = await Promise.all([
    Expense.find(match)
      .sort({ expenseDate: -1, createdAt: -1 })
      .limit(limit)
      .select('groupId title description category paidBy participants totalMinor currency groupAmountMinor expenseDate')
      .lean(),
    Group.find({ _id: { $in: groupIds } }).select('name baseCurrency').lean(),
  ]);

  const groupNameById = new Map(groups.map((group) => [toId(group._id), group.name]));
  const groupCurrencyById = new Map(groups.map((group) => [toId(group._id), String(group.baseCurrency || 'INR').toUpperCase()]));

  const ids = new Set([toId(viewerId)]);
  for (const expense of expenses) {
    ids.add(toId(expense.paidBy));
    for (const participant of expense.participants || []) ids.add(toId(participant.userId));
  }
  const refs = await userRefs([...ids]);
  const viewerOidStr = toId(viewerId);

  return expenses.map((expense) => {
    const currency = String(expense.currency || 'INR').toUpperCase();
    const groupCurrency = groupCurrencyById.get(toId(expense.groupId)) ?? currency;
    const participants = (expense.participants || [])
      .map((participant) => {
        const ref = refs.get(toId(participant.userId)) ?? emptyRef(participant.userId);
        return `${ref.name || toId(participant.userId)} ${money.fromMinor(participant.shareMinor, currency)}`;
      })
      .join('; ');
    const myShareMinor = (expense.participants || []).reduce(
      (sum, participant) => (toId(participant.userId) === viewerOidStr ? sum + participant.shareMinor : sum),
      0,
    );
    return {
      date: new Date(expense.expenseDate).toISOString().slice(0, 10),
      group: groupNameById.get(toId(expense.groupId)) ?? '',
      title: expense.title,
      category: categoryLabel(expense.category),
      paidBy: (refs.get(toId(expense.paidBy)) ?? emptyRef(expense.paidBy)).name,
      amount: money.fromMinor(expense.totalMinor, currency),
      currency,
      groupAmount: money.fromMinor(expense.groupAmountMinor, groupCurrency),
      groupCurrency,
      myShare: money.fromMinor(myShareMinor, currency),
      participants,
      expenseId: toId(expense._id),
    };
  });
}

/* ------------------------------------------------------------------ CSV */

const CSV_HEADERS = [
  'date',
  'group',
  'title',
  'category',
  'paidBy',
  'amount',
  'currency',
  'groupAmount',
  'groupCurrency',
  'myShare',
  'participants',
  'expenseId',
];

/**
 * Spreadsheet formula injection: a cell that starts with = + - @ (or a tab/CR) is executed
 * when the CSV is opened, so it is neutralised with a leading apostrophe. Quotes, commas and
 * newlines are escaped the RFC-4180 way.
 */
function csvCell(value) {
  if (value == null) return '';
  let text = String(value);
  const startsFormula = /^[=+\-@\t\r]/.test(text);
  if (startsFormula) text = `'${text}`;
  if (!startsFormula && !/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows, headers = CSV_HEADERS) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(headers.map((header) => csvCell(row[header])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/* ------------------------------------------------------------------ public API */

/**
 * Cross-group dashboard rollup for the caller. The owed / receivable / net figures come
 * from the *derived* group balances (balanceService.buildBalances + the pure engine), never
 * from a stored number and never from an aggregation that could drift from the ledger, so
 * this is guaranteed to reconcile with `GET /groups/:id/balances`. A mixed-currency account
 * reports a single `currency` of null with the per-currency split in `byCurrency`.
 */
async function dashboard({ userId, now = new Date() } = {}) {
  const viewerId = toId(userId);
  if (!viewerId) throw ApiError.unauthorized();

  const groups = await Group.find({ members: { $elemMatch: { userId: oid(viewerId), status: 'active' } } })
    .select('_id name baseCurrency')
    .lean();

  let totalOwedMinor = 0; // the caller owes this much (sum of debtor magnitudes)
  let totalOwedToMeMinor = 0; // this much is owed to the caller (sum of creditor magnitudes)
  let netMinor = 0; // signed position across every ledger
  let activeGroupCount = 0;
  const byCurrency = new Map();

  for (const group of groups) {
    // buildBalances recomputes from expenses + completed settlements and asserts Σ net === 0,
    // so a corrupt ledger surfaces as an invariant error rather than a wrong dashboard number.
    // A rule that is mid-mutation on another group must not blank the whole dashboard, so the
    // per-group read is guarded; a failed group is simply skipped (it contributes nothing).
    let snapshot;
    try {
      // eslint-disable-next-line global-require
      const balanceService = require('./balanceService');
      snapshot = await balanceService.buildBalances(group._id);
      balanceService.assertGroupInvariant(group._id, snapshot.balances);
    } catch (error) {
      if (error && error.code === 'FINANCIAL_INVARIANT_VIOLATION') throw error;
      continue;
    }

    activeGroupCount += 1;
    const code = String(group.baseCurrency || 'INR').toUpperCase();
    const row = snapshot.balances.find((balance) => balance.userId === viewerId);
    if (!row) continue;

    if (row.netMinor > 0) totalOwedToMeMinor += row.netMinor;
    else if (row.netMinor < 0) totalOwedMinor += -row.netMinor;
    netMinor += row.netMinor;

    const bucket = byCurrency.get(code) || { currency: code, owedToMeMinor: 0, owedMinor: 0, netMinor: 0 };
    if (row.netMinor > 0) bucket.owedToMeMinor += row.netMinor;
    else if (row.netMinor < 0) bucket.owedMinor += -row.netMinor;
    bucket.netMinor += row.netMinor;
    byCurrency.set(code, bucket);
  }

  const currencies = [...byCurrency.keys()];
  const currency = currencies.length === 1 ? currencies[0] : null;

  const groupIds = groups.map((group) => group._id);
  const { expenseDate } = windowFor({}, now);
  const [recent, pending, activity] = await Promise.all([
    recentActivity({ groupIds, expenseDate, viewerId }),
    pendingSettlements({ groupIds }),
    settlementActivity({ groupIds, viewerId }),
  ]);

  return {
    viewerId,
    currency,
    currencies,
    mixedCurrency: currencies.length > 1,
    totalOwedMinor,
    totalOwed: moneyText(totalOwedMinor, currency),
    totalOwedToMeMinor,
    totalOwedToMe: moneyText(totalOwedToMeMinor, currency),
    netMinor,
    net: moneyText(netMinor, currency),
    status: netMinor > 0 ? 'creditor' : netMinor < 0 ? 'debtor' : 'settled',
    activeGroups: activeGroupCount,
    groupCount: groups.length,
    byCurrency: [...byCurrency.values()],
    pendingSettlements: pending.count,
    pendingSettlementMinor: pending.amountMinor,
    settledCount: activity.completedCount,
    settledMinor: activity.completedMinor,
    recentActivity: recent,
  };
}

/**
 * Reconcile report for one group: the aggregation-derived category/member totals against the
 * same ledger the balance engine derives from, so a caller can prove the two agree.
 */
async function groupReconciliation({ userId, groupId, query = {}, now = new Date() } = {}) {
  const scope = await resolveScope({ userId, groupId });
  const { expenseDate, window } = windowFor(query, now);

  const [categories, members, position] = await Promise.all([
    categoryBreakdown({ ...scope, expenseDate }),
    memberBreakdown({ ...scope, expenseDate }),
    viewerPosition({ ...scope, expenseDate, viewerId: scope.viewerId }),
  ]);

  // eslint-disable-next-line global-require
  const balanceService = require('./balanceService');
  const snapshot = await balanceService.buildBalances(oid(groupId));
  balanceService.assertGroupInvariant(snapshot.group._id, snapshot.balances);

  const derivedSpend = snapshot.expenses.reduce((sum, expense) => sum + expense.groupAmountMinor, 0);
  const categorySpend = categories.reduce((sum, row) => sum + row.totalMinor, 0);
  const derivedNet = snapshot.balances.find((row) => row.userId === scope.viewerId)?.netMinor ?? 0;

  return {
    groupId: scope.groups[0]?.id ?? null,
    currency: scope.currency,
    window,
    categorySpendMinor: categorySpend,
    derivedSpendMinor: derivedSpend,
    spendReconciles: categorySpend === derivedSpend,
    viewerNetDerivedMinor: derivedNet,
    viewerNetAggregatedMinor: position.netMinor,
    netReconciles: derivedNet === position.netMinor,
    memberCount: members.length,
    balances: snapshot.balances.map((row) => ({ userId: row.userId, netMinor: row.netMinor, status: row.status })),
  };
}

function scopeSummary(scope, window) {
  return {
    groupId: scope.isSingleGroup ? scope.groups[0]?.id ?? null : null,
    groupName: scope.isSingleGroup ? scope.groups[0]?.name ?? null : null,
    groupCount: scope.groups.length,
    currency: scope.currency,
    currencies: scope.currencies,
    mixedCurrency: scope.mixedCurrency,
    window,
  };
}

async function overview({ userId, query = {}, now = new Date() }) {
  const scope = await resolveScope({ userId, groupId: query.groupId ?? null });
  const { expenseDate, window } = windowFor(query, now);

  const [categories, members, series, position, byCurrency, pending, recent, settlementSummary] = await Promise.all([
    categoryBreakdown({ ...scope, expenseDate }),
    memberBreakdown({ ...scope, expenseDate }),
    trendSeries({ ...scope, expenseDate, granularity: 'month' }),
    viewerPosition({ ...scope, expenseDate, viewerId: scope.viewerId }),
    spendByCurrency({ ...scope, expenseDate }),
    pendingSettlements(scope),
    recentActivity({ ...scope, expenseDate, viewerId: scope.viewerId }),
    settlementActivity({ groupIds: scope.groupIds, viewerId: scope.viewerId }),
  ]);

  const topCategory = categories[0] ?? null;
  const topMember = members[0] ?? null;
  const currency = scope.currency;

  const result = {
    scope: scopeSummary(scope, window),
    totals: {
      spentMinor: position.spentMinor,
      spent: moneyText(position.spentMinor, currency),
      spentDisplay: displayText(position.spentMinor, currency),
      expenseCount: position.expenseCount,
      byCurrency,
    },
    // `paid` is money the viewer put in; `consumed` is the share of the ledger they enjoy.
    you: {
      paidMinor: position.paidMinor,
      paid: moneyText(position.paidMinor, currency),
      paidDisplay: displayText(position.paidMinor, currency),
      consumedMinor: position.consumedMinor,
      consumed: moneyText(position.consumedMinor, currency),
      consumedDisplay: displayText(position.consumedMinor, currency),
      netMinor: position.netMinor,
      net: moneyText(position.netMinor, currency),
      netDisplay: displayText(position.netMinor, currency),
      fundedPercent: position.fundedPercent,
      status: position.netMinor > 0 ? 'creditor' : position.netMinor < 0 ? 'debtor' : 'settled',
    },
    monthlySeries: series.slice(-MONTHLY_SERIES_POINTS).map((row) => ({
      ...row,
      amount: moneyText(row.totalMinor, currency),
    })),
    topCategory: topCategory
      ? {
          category: topCategory.category,
          label: topCategory.label,
          totalMinor: topCategory.totalMinor,
          amount: moneyText(topCategory.totalMinor, currency),
          percentOfSpend: topCategory.percentOfSpend,
        }
      : null,
    topMember: topMember
      ? {
          user: topMember.user,
          paidMinor: topMember.paidMinor,
          amount: moneyText(topMember.paidMinor, currency),
          sharePercent: topMember.sharePercent,
        }
      : null,
    recentActivity: recent.map((row) => ({ ...row, amount: moneyText(row.groupAmountMinor, currency) })),
    pendingSettlements: {
      count: pending.count,
      amountMinor: pending.amountMinor,
      amount: moneyText(pending.amountMinor, currency),
    },
    settlementActivity: settlementSummary,
  };

  // The cross-group dashboard rollup reconciles against the derived balances; for a
  // single-group view `you.netMinor` is already that group's derived net, so we only add
  // the owed/receivable split when the scope spans more than one group.
  if (!scope.isSingleGroup) {
    const rollup = await dashboard({ userId: scope.viewerId, now });
    result.rollup = {
      totalOwedMinor: rollup.totalOwedMinor,
      totalOwedToMeMinor: rollup.totalOwedToMeMinor,
      netMinor: rollup.netMinor,
      currency: rollup.currency,
      activeGroups: rollup.activeGroups,
      pendingSettlements: rollup.pendingSettlements,
      recentActivity: rollup.recentActivity,
    };
  }

  return result;
}

async function categories({ userId, query = {}, now = new Date() }) {
  const scope = await resolveScope({ userId, groupId: query.groupId ?? null });
  const { expenseDate, window } = windowFor(query, now);
  const rows = await categoryBreakdown({ ...scope, expenseDate });
  const limited = query.limit ? rows.slice(0, query.limit) : rows;
  return {
    scope: scopeSummary(scope, window),
    totalMinor: rows.reduce((sum, row) => sum + row.totalMinor, 0),
    currency: scope.currency,
    categories: limited.map((row) => ({ ...row, amount: moneyText(row.totalMinor, scope.currency) })),
  };
}

async function members({ userId, query = {}, now = new Date() }) {
  const scope = await resolveScope({ userId, groupId: query.groupId ?? null });
  const { expenseDate, window } = windowFor(query, now);
  const rows = await memberBreakdown({ ...scope, expenseDate });
  const limited = query.limit ? rows.slice(0, query.limit) : rows;
  const totalPaid = rows.reduce((sum, row) => sum + row.paidMinor, 0);
  return {
    scope: scopeSummary(scope, window),
    totalPaidMinor: totalPaid,
    currency: scope.currency,
    members: limited.map((row) => ({
      ...row,
      paid: moneyText(row.paidMinor, scope.currency),
      consumed: moneyText(row.consumedMinor, scope.currency),
      net: moneyText(row.netMinor, scope.currency),
    })),
  };
}

async function trend({ userId, query = {}, now = new Date() }) {
  const scope = await resolveScope({ userId, groupId: query.groupId ?? null });
  const { expenseDate, window } = windowFor(query, now);
  const granularity = query.granularity ?? 'month';
  const rows = await trendSeries({ ...scope, expenseDate, granularity, viewerId: scope.viewerId });
  return {
    scope: scopeSummary(scope, window),
    granularity,
    currency: scope.currency,
    points: rows.map((row) => ({ ...row, amount: moneyText(row.totalMinor, scope.currency) })),
  };
}

async function exportCsv({ userId, query = {}, now = new Date() }) {
  const scope = await resolveScope({ userId, groupId: query.groupId ?? null });
  const { expenseDate, window } = windowFor(query, now);
  const rows = await exportRows({ ...scope, expenseDate, limit: query.limit ?? 5000 });
  const filenameParts = [
    scope.isSingleGroup ? `group-${scope.groups[0]?.id}` : 'all-groups',
    window.from ? window.from.slice(0, 10) : 'from-beginning',
    window.to ? window.to.slice(0, 10) : 'to-now',
  ];
  return {
    csv: toCsv(rows),
    rowCount: rows.length,
    filename: `balancebook-analytics-${filenameParts.join('-')}.csv`,
  };
}

module.exports = {
  resolveScope,
  windowFor,
  previousWindowFor,
  matchFor,
  bucketExpression,
  categoryBreakdown,
  memberBreakdown,
  trendSeries,
  viewerPosition,
  spendByCurrency,
  pendingSettlements,
  settlementActivity,
  recentActivity,
  exportRows,
  toCsv,
  csvCell,
  CSV_HEADERS,
  overview,
  categories,
  members,
  trend,
  dashboard,
  groupReconciliation,
  exportCsv,
  percentOf,
  round2,
  moneyText,
  displayText,
  toId,
  oid,
  PENDING_SETTLEMENT_STATUSES,
};
