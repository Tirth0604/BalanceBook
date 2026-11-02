'use strict';

/**
 * Settlement write lifecycle: record → confirm/reject/dispute/cancel. Every state change is
 * transactional, appends an audit entry, and — when it moves money (only `completed`
 * settlements affect balances) — recomputes and asserts the group invariant before the
 * transaction commits.
 */

const ApiError = require('../utils/ApiError');
const money = require('../utils/money');
const { withTransaction } = require('../config/db');
const { SETTLEMENT_STATUS } = require('../utils/constants');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { computePairwiseDebts } = require('../algorithms/balanceCalculator');
const Group = require('../models/Group');
const Settlement = require('../models/Settlement');
const { buildBalances, assertGroupInvariant, pairwiseOwedTo, withSession, toId } = require('./balanceService');
const { notify, broadcastGroup } = require('./notificationService');

const UNCONFIRMED_STATUSES = new Set([SETTLEMENT_STATUS.PENDING, SETTLEMENT_STATUS.AWAITING_CONFIRMATION]);

const POPULATE = [
  { path: 'groupId', select: 'name baseCurrency' },
  { path: 'payerId', select: 'name email avatarUrl' },
  { path: 'receiverId', select: 'name email avatarUrl' },
  { path: 'initiatedBy', select: 'name email avatarUrl' },
  { path: 'confirmedBy', select: 'name email avatarUrl' },
];

function saveOptions(session) {
  return session ? { session } : {};
}

function userRef(value) {
  if (!value) return null;
  const doc = value.toObject ? value.toObject() : value;
  return {
    id: toId(doc._id ?? doc.id),
    name: doc.name ?? '',
    email: doc.email ?? null,
    avatarUrl: doc.avatarUrl ?? null,
  };
}

function groupRef(value) {
  if (!value) return null;
  const doc = value.toObject ? value.toObject() : value;
  return {
    id: toId(doc._id ?? doc.id),
    name: doc.name ?? '',
    baseCurrency: doc.baseCurrency ?? null,
  };
}

/** Contract `Settlement` DTO with server-computed permissions for the viewer. */
function toSettlementDto(settlement, viewerId) {
  const status = settlement.status;
  const receiverId = toId(settlement.receiverId?._id ?? settlement.receiverId);
  const isReceiver = receiverId === toId(viewerId);
  const isAwaiting = status === SETTLEMENT_STATUS.AWAITING_CONFIRMATION;

  return {
    id: toId(settlement._id ?? settlement.id),
    group: groupRef(settlement.groupId),
    payer: userRef(settlement.payerId),
    receiver: userRef(settlement.receiverId),
    amountMinor: settlement.amountMinor,
    amount: money.fromMinor(settlement.amountMinor, settlement.currency),
    currency: settlement.currency,
    status,
    paymentMethod: settlement.paymentMethod,
    note: settlement.note ?? '',
    proofUrl: settlement.proofUrl ?? null,
    initiatedBy: userRef(settlement.initiatedBy),
    initiatedAt: settlement.initiatedAt ?? null,
    confirmedAt: settlement.confirmedAt ?? null,
    confirmedBy: settlement.confirmedBy ? userRef(settlement.confirmedBy) : null,
    rejectedReason: settlement.rejectedReason ?? null,
    canConfirm: isReceiver && isAwaiting,
    canReject: isReceiver && isAwaiting,
  };
}

async function findPopulated(id, session) {
  return withSession(Settlement.findById(id).populate(POPULATE), session);
}

/**
 * Records a settlement in `awaiting_confirmation`. The amount is capped at the payer's
 * outstanding debt to that specific receiver (the pairwise view), never the whole group net,
 * so a payer cannot over-pay one creditor using another group member's money.
 */
async function recordSettlement(payload, { viewerId, idempotencyKey } = {}) {
  const outcome = await withTransaction(async ({ session }) => {
    const key = idempotencyKey || payload.idempotencyKey || null;

    if (key) {
      const existing = await withSession(Settlement.findOne({ idempotencyKey: key }).populate(POPULATE), session);
      if (existing) return { settlement: existing, created: false, replayed: true };
    }

    const group = await withSession(Group.findById(payload.groupId), session);
    if (!group) throw ApiError.notFound('Group not found');

    const payerId = toId(payload.payerId);
    const receiverId = toId(payload.receiverId);

    // Both sides must be active members before any money is committed to the ledger.
    if (!group.isMember(payerId) || !group.isMember(receiverId)) {
      throw ApiError.forbidden('Payer and receiver must both be active members of this group');
    }
    if (payerId === receiverId) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'A settlement cannot pay itself');
    }
    if (!(viewerId === payerId || group.hasActiveAdmin(viewerId))) {
      throw ApiError.forbidden('Only the payer or a group admin can record a settlement');
    }

    const currency = (payload.currency || group.baseCurrency).toUpperCase();
    if (currency !== group.baseCurrency) {
      throw new ApiError(422, 'VALIDATION_ERROR', `Settlement currency must match the group base currency (${group.baseCurrency})`);
    }

    const amountMinor = money.toMinor(payload.amount, currency);
    if (amountMinor <= 0) throw new ApiError(422, 'VALIDATION_ERROR', 'Settlement amount must be greater than zero');

    const snapshot = await buildBalances(payload.groupId, { session });
    assertGroupInvariant(snapshot.group._id, snapshot.balances);
    const debts = pairwiseOwedTo({
      balances: snapshot.balances,
      memberIds: snapshot.memberIds,
      debts: computePairwiseDebts({
        memberIds: snapshot.memberIds,
        expenses: snapshot.expenses,
        settlements: snapshot.settlements,
      }),
    });
    const outstanding = debts.debtBetween(payerId, receiverId);
    if (amountMinor > outstanding) {
      throw new ApiError(
        422,
        'VALIDATION_ERROR',
        `Amount exceeds what the payer owes this receiver (max ${money.format(outstanding, currency)})`,
        { allowedMaxMinor: outstanding, path: 'amount' },
      );
    }

    const [created] = await Settlement.create(
      [
        {
          groupId: group._id,
          payerId,
          receiverId,
          amountMinor,
          currency,
          status: SETTLEMENT_STATUS.AWAITING_CONFIRMATION,
          paymentMethod: payload.paymentMethod || 'cash',
          note: payload.note || '',
          initiatedBy: viewerId,
          idempotencyKey: key,
          auditTrail: [
            { action: 'recorded', by: viewerId, from: null, to: SETTLEMENT_STATUS.AWAITING_CONFIRMATION, at: new Date() },
          ],
        },
      ],
      saveOptions(session),
    );

    await notify({
      userIds: [receiverId],
      groupId: toId(group._id),
      type: 'settlement_requested',
      title: 'A settlement awaits your confirmation',
      body: `${money.format(amountMinor, currency)} recorded as a payment to you.`,
      payload: { settlementId: toId(created._id), groupId: toId(group._id) },
      session,
    });

    const settlement = await findPopulated(created._id, session);
    return { settlement, created: true, replayed: false };
  });

  return outcome;
}

async function confirmSettlement(id, viewerId) {
  const settlement = await withTransaction(async ({ session }) => {
    const doc = await findPopulated(id, session);
    if (!doc) throw ApiError.notFound('Settlement not found');

    if (toId(doc.receiverId?._id ?? doc.receiverId) !== toId(viewerId)) {
      throw ApiError.forbidden('Only the receiver can confirm this settlement');
    }
    if (doc.status !== SETTLEMENT_STATUS.AWAITING_CONFIRMATION) {
      // Confirming an already-completed (or otherwise closed) settlement is a conflict.
      throw ApiError.conflict('This settlement is not awaiting confirmation');
    }

    const from = doc.status;
    const now = new Date();
    doc.status = SETTLEMENT_STATUS.COMPLETED;
    doc.confirmedAt = now;
    doc.confirmedBy = viewerId;
    doc.auditTrail.push({ action: 'confirmed', by: viewerId, from, to: doc.status, at: now });
    await doc.save(saveOptions(session));

    const snapshot = await buildBalances(doc.groupId?._id ?? doc.groupId, { session });
    assertGroupInvariant(snapshot.group._id, snapshot.balances);

    await notify({
      userIds: [toId(doc.payerId?._id ?? doc.payerId)],
      groupId: toId(snapshot.group._id),
      type: 'settlement_confirmed',
      title: 'Settlement confirmed',
      body: `${money.format(doc.amountMinor, doc.currency)} was confirmed.`,
      payload: { settlementId: toId(doc._id), groupId: toId(snapshot.group._id) },
      session,
    });

    return doc;
  });

  broadcastGroup(toId(settlement.groupId?._id ?? settlement.groupId), 'balance:changed', {
    groupId: toId(settlement.groupId?._id ?? settlement.groupId),
  });

  return toSettlementDto(settlement, viewerId);
}

async function rejectSettlement(id, viewerId, { reason } = {}) {
  const settlement = await withTransaction(async ({ session }) => {
    const doc = await findPopulated(id, session);
    if (!doc) throw ApiError.notFound('Settlement not found');

    if (toId(doc.receiverId?._id ?? doc.receiverId) !== toId(viewerId)) {
      throw ApiError.forbidden('Only the receiver can reject this settlement');
    }
    if (doc.status !== SETTLEMENT_STATUS.AWAITING_CONFIRMATION) {
      throw ApiError.conflict('This settlement is not awaiting confirmation');
    }

    const from = doc.status;
    const now = new Date();
    doc.status = SETTLEMENT_STATUS.REJECTED;
    doc.rejectedBy = viewerId;
    doc.rejectedAt = now;
    doc.rejectedReason = reason || null;
    doc.auditTrail.push({ action: 'rejected', by: viewerId, from, to: doc.status, at: now, note: reason || null });
    await doc.save(saveOptions(session));

    await notify({
      userIds: [toId(doc.payerId?._id ?? doc.payerId)],
      groupId: toId(doc.groupId?._id ?? doc.groupId),
      type: 'settlement_rejected',
      title: 'Settlement rejected',
      body: reason || 'Your proposed settlement was rejected.',
      payload: { settlementId: toId(doc._id), groupId: toId(doc.groupId?._id ?? doc.groupId) },
      session,
    });

    return doc;
  });

  return toSettlementDto(settlement, viewerId);
}

async function disputeSettlement(id, viewerId, { reason } = {}) {
  const settlement = await withTransaction(async ({ session }) => {
    const doc = await findPopulated(id, session);
    if (!doc) throw ApiError.notFound('Settlement not found');

    const payer = toId(doc.payerId?._id ?? doc.payerId);
    const receiver = toId(doc.receiverId?._id ?? doc.receiverId);
    if (toId(viewerId) !== payer && toId(viewerId) !== receiver) {
      throw ApiError.forbidden('Only the payer or receiver can dispute this settlement');
    }
    if (!UNCONFIRMED_STATUSES.has(doc.status)) {
      throw ApiError.conflict('This settlement can no longer be disputed');
    }

    const from = doc.status;
    const now = new Date();
    doc.status = SETTLEMENT_STATUS.DISPUTED;
    doc.disputedBy = viewerId;
    doc.disputedAt = now;
    doc.auditTrail.push({ action: 'disputed', by: viewerId, from, to: doc.status, at: now, note: reason || null });
    await doc.save(saveOptions(session));

    const otherParty = toId(viewerId) === payer ? receiver : payer;
    await notify({
      userIds: [otherParty],
      groupId: toId(doc.groupId?._id ?? doc.groupId),
      type: 'settlement_disputed',
      title: 'Settlement disputed',
      body: reason || 'A settlement you are part of was disputed.',
      payload: { settlementId: toId(doc._id), groupId: toId(doc.groupId?._id ?? doc.groupId) },
      session,
    });

    return doc;
  });

  return toSettlementDto(settlement, viewerId);
}

async function cancelSettlement(id, viewerId) {
  const settlement = await withTransaction(async ({ session }) => {
    const doc = await findPopulated(id, session);
    if (!doc) throw ApiError.notFound('Settlement not found');

    if (toId(doc.initiatedBy?._id ?? doc.initiatedBy) !== toId(viewerId)) {
      throw ApiError.forbidden('Only the initiator can cancel this settlement');
    }
    if (!UNCONFIRMED_STATUSES.has(doc.status)) {
      throw ApiError.conflict('This settlement can no longer be cancelled');
    }

    const from = doc.status;
    const now = new Date();
    doc.status = SETTLEMENT_STATUS.CANCELLED;
    doc.cancelledBy = viewerId;
    doc.cancelledAt = now;
    doc.auditTrail.push({ action: 'cancelled', by: viewerId, from, to: doc.status, at: now });
    await doc.save(saveOptions(session));

    return doc;
  });

  return toSettlementDto(settlement, viewerId);
}

async function listSettlements(groupId, { status, viewerId } = {}) {
  const filter = { groupId };
  if (status) filter.status = status;
  const docs = await Settlement.find(filter).populate(POPULATE).sort({ initiatedAt: -1, createdAt: -1 });
  return docs.map((doc) => toSettlementDto(doc, viewerId));
}

async function listForUser(viewerId, query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultSort: '-initiatedAt' });
  const { direction, status, groupId } = query;

  const filter = {};
  if (direction === 'to_me') filter.receiverId = viewerId;
  else if (direction === 'from_me') filter.payerId = viewerId;
  else filter.$or = [{ payerId: viewerId }, { receiverId: viewerId }];
  if (status) filter.status = status;
  if (groupId) filter.groupId = groupId;

  const [docs, total] = await Promise.all([
    Settlement.find(filter).populate(POPULATE).sort({ initiatedAt: -1, createdAt: -1 }).skip(skip).limit(limit),
    Settlement.countDocuments(filter),
  ]);

  return {
    items: docs.map((doc) => toSettlementDto(doc, viewerId)),
    meta: buildMeta({ page, limit, total }),
  };
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Completed settlements for the caller, newest first, grouped by calendar month (UTC). */
async function history(viewerId, { groupId } = {}) {
  const filter = {
    status: SETTLEMENT_STATUS.COMPLETED,
    $or: [{ payerId: viewerId }, { receiverId: viewerId }],
  };
  if (groupId) filter.groupId = groupId;

  const docs = await Settlement.find(filter).populate(POPULATE).sort({ confirmedAt: -1, initiatedAt: -1 });

  const buckets = new Map();
  for (const doc of docs) {
    const at = doc.confirmedAt || doc.initiatedAt || doc.createdAt;
    const key = monthKey(new Date(at));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(toSettlementDto(doc, viewerId));
  }

  return [...buckets.entries()].map(([month, settlements]) => ({ month, settlements }));
}

/** Cross-group totals for the caller; each group's ledger is invariant-checked first. */
async function mySummary(viewerId, { currency } = {}) {
  const groups = await Group.find({ 'members.userId': viewerId, 'members.status': 'active' }).select('_id');

  let totalOwedMinor = 0;
  let totalOwedToMeMinor = 0;
  let netMinor = 0;

  for (const group of groups) {
    const snapshot = await buildBalances(group._id);
    assertGroupInvariant(group._id, snapshot.balances);
    const row = snapshot.balances.find((balance) => balance.userId === toId(viewerId));
    if (!row) continue;
    if (row.netMinor > 0) totalOwedToMeMinor += row.netMinor;
    else if (row.netMinor < 0) totalOwedMinor += -row.netMinor;
    netMinor += row.netMinor;
  }

  const pendingSettlements = await Settlement.countDocuments({
    status: SETTLEMENT_STATUS.AWAITING_CONFIRMATION,
    $or: [{ payerId: viewerId }, { receiverId: viewerId }],
  });

  return {
    totalOwedMinor,
    totalOwedToMeMinor,
    netMinor,
    currency: currency || 'INR',
    groupCount: groups.length,
    pendingSettlements,
  };
}

module.exports = {
  recordSettlement,
  confirmSettlement,
  rejectSettlement,
  disputeSettlement,
  cancelSettlement,
  listSettlements,
  listForUser,
  history,
  mySummary,
  toSettlementDto,
};
