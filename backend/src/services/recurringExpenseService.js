'use strict';

/**
 * Recurring expenses are templates, not charges.
 *
 * A rule never moves money: when its due date arrives the scheduler posts an ordinary
 * ledger entry (an Expense) with the template's split, tells every group member about it,
 * and then advances the rule. Every generated entry carries
 * `occurrenceKey = recurrence.occurrenceKeyFor(date)`, which sits under a unique index, so
 * a scheduler that runs twice — after a crash, a deploy or a manual trigger — can never
 * double-charge the group.
 */

const mongoose = require('mongoose');

const RecurringExpense = require('../models/RecurringExpense');
const Expense = require('../models/Expense');
const ExpenseAuditLog = require('../models/ExpenseAuditLog');
const Group = require('../models/Group');
const User = require('../models/User');

const notificationService = require('./notificationService');

const { withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const money = require('../utils/money');
const splitter = require('../algorithms/splitter');
const currencyEngine = require('../algorithms/currency');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { categoryLabel, MEMBER_STATUS, GROUP_ROLE } = require('../utils/constants');

const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEDULER_INTERVAL_MS = 15 * 60 * 1000;
/** A catch-up run must be bounded: a mis-typed rule cannot generate ten thousand expenses. */
const MAX_OCCURRENCES_PER_RULE = 24;
const MAX_RULES_PER_RUN = 200;
const UPCOMING_PREVIEW = 3;

const POPULATE = [
  { path: 'paidBy', select: 'name email avatarUrl' },
  { path: 'createdBy', select: 'name email avatarUrl' },
  { path: 'participants.userId', select: 'name email avatarUrl' },
];

function toId(value) {
  return value == null ? null : String(value);
}

function oid(value) {
  if (!mongoose.isValidObjectId(String(value))) throw ApiError.badRequest(`Invalid id: ${value}`);
  return new mongoose.Types.ObjectId(String(value));
}

function isDuplicateKeyError(error) {
  return error?.code === 11000 || error?.code === 11001 || /E11000|duplicate key/i.test(String(error?.message));
}

function sessionOptions(session) {
  return session ? { session } : {};
}

/** Money / split engine errors surface as 422s pointing at the participants. */
function runSplit(work) {
  try {
    return work();
  } catch (error) {
    if (error instanceof money.MoneyError || error?.name === 'MoneyError') {
      throw ApiError.unprocessable(error.message, [{ path: 'participants', message: error.message, code: error.code }]);
    }
    throw error;
  }
}

function startOfUtcDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw ApiError.badRequest('A valid date is required');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Member check for reads, admin check for anything that can post or stop a ledger entry. */
async function loadAuthorisedGroup(groupId, actorId, { adminRequired = false } = {}) {
  if (!groupId) throw ApiError.badRequest('A groupId is required');
  const group = await Group.findById(oid(groupId)).lean();
  if (!group) throw ApiError.notFound('Group not found');
  const membership = (group.members || []).find(
    (member) => toId(member.userId) === toId(actorId) && member.status === MEMBER_STATUS.ACTIVE,
  );
  if (!membership) throw ApiError.forbidden('You are not a member of this group');
  if (adminRequired && membership.role !== GROUP_ROLE.ADMIN) {
    throw ApiError.forbidden('This action requires group admin rights');
  }
  return group;
}

/* ------------------------------------------------------------------ schedule math */

/**
 * Next due date after `from`. Monthly rules keep the day-of-month they started on and clamp
 * to the shorter month (a rule anchored on the 31st bills on the 28th in February) rather
 * than drifting forward a day each month.
 */
function advanceDueDate({ frequency, interval, startDate }, from) {
  const base = new Date(from);
  const step = Math.max(1, Number(interval) || 1);
  if (frequency === 'monthly') {
    const anchorDay = startOfUtcDay(startDate).getUTCDate();
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth() + step;
    const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const target = new Date(Date.UTC(year, month, Math.min(anchorDay, lastDayOfTarget)));
    target.setUTCHours(base.getUTCHours(), base.getUTCMinutes(), base.getUTCSeconds(), base.getUTCMilliseconds());
    return target;
  }
  const days = frequency === 'weekly' ? 7 * step : step;
  return new Date(base.getTime() + days * DAY_MS);
}

/** Preview of the dates a rule will fire, for the UI and for the tests. */
function upcomingOccurrences(recurrence, { from = new Date(), count = UPCOMING_PREVIEW } = {}) {
  const dates = [];
  let cursor = new Date(recurrence.nextDueDate);
  const startAt = new Date(from).getTime();
  let guard = 0;
  while (dates.length < count && guard < MAX_OCCURRENCES_PER_RULE) {
    guard += 1;
    if (cursor.getTime() < startAt) {
      cursor = advanceDueDate(recurrence, cursor);
      continue;
    }
    if (recurrence.endDate && cursor.getTime() > new Date(recurrence.endDate).getTime()) break;
    if (recurrence.maxOccurrences != null && recurrence.occurrenceCount + dates.length >= recurrence.maxOccurrences) break;
    dates.push(new Date(cursor).toISOString());
    cursor = advanceDueDate(recurrence, cursor);
  }
  return dates;
}

function isExhaustedAfter(recurrence, nextDueDate) {
  if (recurrence.maxOccurrences != null && recurrence.occurrenceCount >= recurrence.maxOccurrences) return true;
  if (recurrence.endDate && new Date(nextDueDate) > new Date(recurrence.endDate)) return true;
  return false;
}

/* ------------------------------------------------------------------ template */

function userRef(user) {
  if (!user || typeof user !== 'object') return null;
  return {
    id: toId(user._id ?? user.id ?? user),
    name: user.name ?? '',
    email: user.email ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}

function toRecurrenceDto(recurrence, { groupName = null } = {}) {
  const currencyCode = recurrence.currency;
  const participants = (recurrence.participants || []).map((participant) => ({
    user: userRef(participant.userId) ?? { id: toId(participant.userId), name: '', email: null, avatarUrl: null },
    shareMinor: participant.shareMinor ?? null,
    share: participant.shareMinor != null ? money.fromMinor(participant.shareMinor, currencyCode) : null,
    percentage: participant.percentage ?? null,
  }));

  return {
    id: toId(recurrence._id),
    groupId: toId(recurrence.groupId),
    groupName,
    title: recurrence.title,
    description: recurrence.description ?? '',
    category: recurrence.category,
    categoryLabel: categoryLabel(recurrence.category),
    totalMinor: recurrence.totalMinor,
    amount: money.fromMinor(recurrence.totalMinor, currencyCode),
    display: money.format(recurrence.totalMinor, currencyCode),
    currency: currencyCode,
    splitType: recurrence.splitType,
    paidBy: userRef(recurrence.paidBy),
    participants,
    frequency: recurrence.frequency,
    interval: recurrence.interval,
    startDate: recurrence.startDate ? new Date(recurrence.startDate).toISOString() : null,
    endDate: recurrence.endDate ? new Date(recurrence.endDate).toISOString() : null,
    nextDueDate: recurrence.nextDueDate ? new Date(recurrence.nextDueDate).toISOString() : null,
    upcomingOccurrences: upcomingOccurrences(recurrence),
    occurrenceCount: recurrence.occurrenceCount,
    maxOccurrences: recurrence.maxOccurrences ?? null,
    remainingOccurrences: recurrence.maxOccurrences != null
      ? Math.max(0, recurrence.maxOccurrences - recurrence.occurrenceCount)
      : null,
    isActive: recurrence.isActive,
    isPaused: Boolean(recurrence.isPaused),
    pausedAt: recurrence.pausedAt ? new Date(recurrence.pausedAt).toISOString() : null,
    lastGeneratedExpenseId: recurrence.lastGeneratedExpenseId ? toId(recurrence.lastGeneratedExpenseId) : null,
    lastGeneratedAt: recurrence.lastGeneratedAt ? new Date(recurrence.lastGeneratedAt).toISOString() : null,
    createdBy: userRef(recurrence.createdBy),
    createdAt: recurrence.createdAt ? new Date(recurrence.createdAt).toISOString() : null,
    updatedAt: recurrence.updatedAt ? new Date(recurrence.updatedAt).toISOString() : null,
  };
}

/**
 * Freeze the split template. An occurrence recomputes shares from this template at its own
 * date, so a member added or removed later is simply (or not) included by the split engine.
 */
function buildTemplate({ group, body, currencyCode, totalMinor, actorId }) {
  const activeIds = new Set(
    (group.members || [])
      .filter((member) => member.status === MEMBER_STATUS.ACTIVE)
      .map((member) => toId(member.userId)),
  );

  const requested = (body.participants ?? []).map((participant) => ({
    userId: toId(participant.userId),
    share: participant.share,
    shareMinor: participant.shareMinor,
    percentage: participant.percentage,
  }));
  const participantIds = requested.length
    ? requested.map((participant) => participant.userId)
    : [...activeIds];

  if (!participantIds.length) throw ApiError.unprocessable('This group has no active members to split with');
  for (const id of participantIds) {
    if (!activeIds.has(id)) throw ApiError.badRequest(`Participant ${id} is not an active member of this group`);
  }

  const paidBy = toId(body.paidBy ?? actorId);
  if (!activeIds.has(paidBy)) throw ApiError.badRequest('paidBy must be an active member of this group');

  const splitType = body.splitType ?? 'equal';
  // The engine is the authority on a valid split; running it here means a bad template is
  // rejected at creation instead of silently failing at 3 a.m. on the due date.
  const shares = runSplit(() =>
    splitter.split(totalMinor, {
      splitType,
      participants: requested.some((participant) => participant.share != null || participant.percentage != null)
        ? requested
        : participantIds.map((userId) => ({ userId })),
      currency: currencyCode,
    }),
  );

  return shares.map((share) => ({
    userId: oid(share.userId),
    shareMinor: share.shareMinor,
    percentage: share.percentage ?? null,
  }));
}

async function createRecurrence({ actorId, groupId, body = {}, now = new Date() }) {
  const group = await loadAuthorisedGroup(groupId ?? body.groupId, actorId, { adminRequired: true });

  const currencyCode = String(body.currency || group.baseCurrency || 'INR').toUpperCase();
  // There is no rate source for a date in the future, so a rule may only bill in the group's
  // own currency; otherwise every occurrence would be converted at an invented rate.
  if (!currencyEngine.sameCurrency(currencyCode, group.baseCurrency)) {
    throw ApiError.unprocessable('A recurring rule must use the group base currency', [
      { path: 'currency', message: `Group ${group.name} bills in ${group.baseCurrency}` },
    ]);
  }

  const totalMinor = money.toMinor(body.amount, currencyCode);
  if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
    throw ApiError.unprocessable('Amount must be greater than zero', [{ path: 'amount', message: 'Amount must be greater than zero' }]);
  }

  const startDate = startOfUtcDay(body.startDate);
  const endDate = body.endDate ? startOfUtcDay(body.endDate) : null;
  if (endDate && endDate < startDate) {
    throw ApiError.unprocessable('endDate must be on or after startDate', [
      { path: 'endDate', message: 'endDate must be on or after startDate' },
    ]);
  }

  const participants = buildTemplate({ group, body, currencyCode, totalMinor, actorId });

  const recurrence = await RecurringExpense.create({
    groupId: group._id,
    title: body.title,
    description: body.description ?? '',
    category: body.category ?? 'utilities',
    totalMinor,
    currency: currencyCode,
    splitType: body.splitType ?? 'equal',
    paidBy: oid(toId(body.paidBy ?? actorId)),
    participants,
    frequency: body.frequency,
    interval: body.interval ?? 1,
    startDate,
    endDate,
    maxOccurrences: body.maxOccurrences ?? null,
    nextDueDate: startDate,
    isActive: true,
    createdBy: oid(actorId),
  });

  return toRecurrenceDto(await RecurringExpense.findById(recurrence._id).populate(POPULATE), {
    groupName: group.name,
  });
}

async function listRecurrences({ actorId, groupId, query = {}, now = new Date() }) {
  const group = await loadAuthorisedGroup(groupId ?? query.groupId, actorId);
  const { page, limit, skip, sort } = parsePagination(query, { defaultSort: '-nextDueDate' });

  const filter = { groupId: group._id };
  if (query.active === 'true') filter.isActive = true;
  if (query.active === 'false') filter.isActive = false;

  const [items, total] = await Promise.all([
    RecurringExpense.find(filter).sort(sort).skip(skip).limit(limit).populate(POPULATE),
    RecurringExpense.countDocuments(filter),
  ]);

  return {
    items: items.map((recurrence) => toRecurrenceDto(recurrence, { groupName: group.name, now })),
    meta: buildMeta({ page, limit, total }),
    groupId: toId(group._id),
    currency: group.baseCurrency,
  };
}

async function loadRecurrenceForActor(recurringId, actorId, { adminRequired = false } = {}) {
  const recurrence = await RecurringExpense.findById(oid(recurringId)).populate(POPULATE);
  if (!recurrence) throw ApiError.notFound('Recurring rule not found');
  const group = await loadAuthorisedGroup(toId(recurrence.groupId), actorId, { adminRequired });
  return { recurrence, group };
}

async function getRecurrence({ actorId, recurringId }) {
  const { recurrence, group } = await loadRecurrenceForActor(recurringId, actorId);
  return toRecurrenceDto(recurrence, { groupName: group.name });
}

async function updateRecurrence({ actorId, recurringId, body = {} }) {
  const { recurrence, group } = await loadRecurrenceForActor(recurringId, actorId, { adminRequired: true });

  const currencyCode = recurrence.currency;
  const totalMinor =
    body.amount == null ? recurrence.totalMinor : money.toMinor(body.amount, currencyCode);
  if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
    throw ApiError.unprocessable('Amount must be greater than zero', [{ path: 'amount', message: 'Amount must be greater than zero' }]);
  }

  if (body.title !== undefined) recurrence.title = body.title;
  if (body.description !== undefined) recurrence.description = body.description;
  if (body.category !== undefined) recurrence.category = body.category;
  if (body.notes !== undefined) recurrence.notes = body.notes;
  if (body.interval !== undefined) recurrence.interval = body.interval;
  if (body.endDate !== undefined) {
    const endDate = body.endDate ? startOfUtcDay(body.endDate) : null;
    if (endDate && endDate < startOfUtcDay(recurrence.startDate)) {
      throw ApiError.unprocessable('endDate must be on or after startDate', [
        { path: 'endDate', message: 'endDate must be on or after startDate' },
      ]);
    }
    recurrence.endDate = endDate;
  }
  if (body.maxOccurrences !== undefined) {
    recurrence.maxOccurrences = body.maxOccurrences ?? null;
    if (recurrence.maxOccurrences != null && recurrence.occurrenceCount > recurrence.maxOccurrences) {
      throw ApiError.unprocessable('maxOccurrences cannot be below the occurrences already generated');
    }
  }

  const splitChanged =
    body.amount !== undefined || body.splitType !== undefined || body.participants !== undefined;
  if (splitChanged) {
    recurrence.splitType = body.splitType ?? recurrence.splitType;
    recurrence.participants = buildTemplate({
      group,
      body: {
        participants: body.participants,
        splitType: recurrence.splitType,
        paidBy: toId(recurrence.paidBy?._id ?? recurrence.paidBy),
      },
      currencyCode,
      totalMinor,
      actorId,
    });
    recurrence.totalMinor = totalMinor;
  }

  // A rule that has run out of future dates stays inactive; the caller sees why in the DTO.
  await recurrence.save();
  if (isExhaustedAfter(recurrence, recurrence.nextDueDate)) {
    recurrence.isActive = false;
    await recurrence.save();
  }
  return toRecurrenceDto(await RecurringExpense.findById(recurrence._id).populate(POPULATE), { groupName: group.name });
}

async function setPaused({ actorId, recurringId, paused, now = new Date() }) {
  const { recurrence, group } = await loadRecurrenceForActor(recurringId, actorId, { adminRequired: true });

  if (paused) {
    if (!recurrence.isActive && recurrence.pausedAt) throw ApiError.conflict('This rule is already paused');
    recurrence.isActive = false;
    recurrence.pausedAt = now;
    recurrence.pausedBy = oid(actorId);
    await recurrence.save();
    return { recurrence: toRecurrenceDto(await RecurringExpense.findById(recurrence._id).populate(POPULATE), { groupName: group.name }), skippedOccurrences: [] };
  }

  // Resuming must not bill the pause window retroactively: the missed dates are dropped and
  // reported, so a member is never charged for a period during which the rule was off.
  const skipped = [];
  let cursor = new Date(recurrence.nextDueDate);
  let guard = 0;
  while (cursor.getTime() < now.getTime() && guard < MAX_OCCURRENCES_PER_RULE) {
    guard += 1;
    skipped.push(new Date(cursor).toISOString());
    cursor = advanceDueDate(recurrence, cursor);
  }
  recurrence.nextDueDate = cursor;
  recurrence.isActive = true;
  recurrence.pausedAt = null;
  recurrence.pausedBy = null;
  await recurrence.save();

  return {
    recurrence: toRecurrenceDto(await RecurringExpense.findById(recurrence._id).populate(POPULATE), { groupName: group.name }),
    skippedOccurrences: skipped,
  };
}

/** Soft delete: the rule stops firing, its history stays queryable. */
async function removeRecurrence({ actorId, recurringId }) {
  const { recurrence, group } = await loadRecurrenceForActor(recurringId, actorId, { adminRequired: true });
  recurrence.isActive = false;
  recurrence.pausedAt = recurrence.pausedAt ?? new Date();
  recurrence.pausedBy = oid(actorId);
  await recurrence.save();
  return toRecurrenceDto(await RecurringExpense.findById(recurrence._id).populate(POPULATE), { groupName: group.name });
}

async function occurrenceHistory({ actorId, recurringId, query = {} }) {
  const { recurrence, group } = await loadRecurrenceForActor(recurringId, actorId);
  const { page, limit, skip, sort } = parsePagination(query, { defaultSort: '-expenseDate' });
  const filter = { recurrenceId: recurrence._id };

  const [items, total] = await Promise.all([
    Expense.find(filter).sort(sort).skip(skip).limit(limit).populate([
      { path: 'paidBy', select: 'name email avatarUrl' },
      { path: 'participants.userId', select: 'name email avatarUrl' },
    ]),
    Expense.countDocuments(filter),
  ]);

  return {
    recurrenceId: toId(recurrence._id),
    groupId: toId(group._id),
    currency: recurrence.currency,
    items: items.map((expense) => ({
      id: toId(expense._id),
      title: expense.title,
      totalMinor: expense.totalMinor,
      amount: money.fromMinor(expense.totalMinor, expense.currency),
      currency: expense.currency,
      expenseDate: new Date(expense.expenseDate).toISOString(),
      occurrenceKey: expense.occurrenceKey ?? null,
      isDeleted: Boolean(expense.isDeleted),
      paidBy: userRef(expense.paidBy),
    })),
    meta: buildMeta({ page, limit, total }),
  };
}

/* ------------------------------------------------------------------ materialisation */

/**
 * `expenseService` owns the ledger write path (audit log, notifications, invariants). It is
 * optional at require time because the modules land in parallel, and a missing or partial
 * implementation must never stop the scheduler from producing a correct split, so the
 * fallback below writes the same invariant-checked document through the same pure engine.
 */
function ledgerWriter() {
  try {
    // eslint-disable-next-line global-require
    const expenseService = require('./expenseService');
    if (typeof expenseService?.createExpense === 'function') return { mode: 'service', create: expenseService.createExpense };
  } catch {
    /* module not present yet */
  }
  return { mode: 'direct', create: null };
}

async function writeDirectExpense({ recurrence, dueDate, occurrenceKey, group, session }) {
  const shares = runSplit(() =>
    splitter.split(recurrence.totalMinor, {
      splitType: recurrence.splitType,
      participants: (recurrence.participants || []).map((participant) => ({
        userId: toId(participant.userId),
        shareMinor: participant.shareMinor ?? undefined,
        percentage: participant.percentage ?? undefined,
      })),
      currency: recurrence.currency,
    }),
  );

  const [expense] = await Expense.create(
    [
      {
        groupId: group._id,
        title: recurrence.title,
        description: recurrence.description ?? '',
        category: recurrence.category,
        totalMinor: recurrence.totalMinor,
        currency: recurrence.currency,
        groupAmountMinor: currencyEngine.convert(recurrence.totalMinor, recurrence.currency, group.baseCurrency, 1),
        exchangeRate: 1,
        paidBy: oid(toId(recurrence.paidBy?._id ?? recurrence.paidBy)),
        splitType: recurrence.splitType,
        participants: shares.map((share) => ({ userId: oid(share.userId), shareMinor: share.shareMinor })),
        expenseDate: new Date(dueDate),
        notes: `Generated by the recurring rule "${recurrence.title}"`,
        recurrenceId: recurrence._id,
        occurrenceKey,
        createdBy: oid(toId(recurrence.createdBy)),
      },
    ],
    sessionOptions(session),
  );

  await ExpenseAuditLog.create(
    [
      {
        expenseId: expense._id,
        groupId: group._id,
        modifiedBy: oid(toId(recurrence.createdBy)),
        action: 'created',
        previousData: null,
        updatedData: { title: expense.title, totalMinor: expense.totalMinor, expenseDate: new Date(dueDate) },
        changeSummary: `Recurring occurrence "${recurrence.title}" generated for ${new Date(dueDate).toISOString().slice(0, 10)}`,
      },
    ],
    sessionOptions(session),
  );

  return expense;
}

/**
 * Both identities are checked: `occurrenceKey` is the indexed guarantee, and
 * `(recurrenceId, expenseDate)` still finds an entry written by a module that ignored the
 * key, so a re-run cannot post the same occurrence twice by any path.
 */
function occurrenceLookup(recurrence, dueDate, occurrenceKey) {
  return {
    $or: [{ occurrenceKey }, { recurrenceId: recurrence._id, expenseDate: new Date(dueDate) }],
  };
}

async function findOccurrence({ recurrence, dueDate, occurrenceKey, session }) {
  return Expense.findOne(occurrenceLookup(recurrence, dueDate, occurrenceKey))
    .session(session ?? null)
    .select('_id')
    .lean();
}

async function materialiseOccurrence({ recurrence, group, dueDate, session }) {
  const occurrenceKey = recurrence.occurrenceKeyFor(dueDate);

  // Read-before-write is the cheap guard; the unique index is the real guarantee.
  const before = await findOccurrence({ recurrence, dueDate, occurrenceKey, session });
  if (before) return { status: 'duplicate', expenseId: toId(before._id), occurrenceKey };

  const writer = ledgerWriter();
  let expenseId = null;
  let via = null;
  let fallbackReason = null;

  if (writer.mode === 'service') {
    try {
      const dto = await writer.create({
        groupId: group._id,
        actorId: toId(recurrence.createdBy),
        session,
        body: {
          title: recurrence.title,
          description: recurrence.description ?? '',
          category: recurrence.category,
          amount: money.fromMinor(recurrence.totalMinor, recurrence.currency),
          currency: recurrence.currency,
          expenseDate: new Date(dueDate),
          paidBy: toId(recurrence.paidBy?._id ?? recurrence.paidBy),
          splitType: recurrence.splitType,
          participants: (recurrence.participants || []).map((participant) => ({
            userId: toId(participant.userId),
            shareMinor: participant.shareMinor ?? undefined,
            percentage: participant.percentage ?? undefined,
          })),
          notes: `Generated by the recurring rule "${recurrence.title}"`,
          recurrenceId: toId(recurrence._id),
          occurrenceKey,
        },
      });
      expenseId = dto?.id ?? null;
      via = 'expenseService';
    } catch (error) {
      if (isDuplicateKeyError(error)) return { status: 'duplicate', expenseId: null, occurrenceKey };
      // The ledger module is a sibling under construction; a failure there must not leave the
      // group's real bill unrecorded, so the same document is written through the direct path.
      fallbackReason = error.message;
    }
  }

  if (expenseId) {
    try {
      // The ledger module does not own occurrence identity, so it is stamped here; the unique
      // index still rejects a second occurrence of the same date.
      await Expense.updateOne(
        { _id: oid(expenseId), occurrenceKey: null },
        { $set: { recurrenceId: recurrence._id, occurrenceKey } },
        sessionOptions(session),
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      await Expense.updateOne(
        { _id: oid(expenseId) },
        { $set: { isDeleted: true, deletedAt: new Date(), notes: 'Removed: duplicate recurring occurrence' } },
        sessionOptions(session),
      );
      return { status: 'duplicate', expenseId, occurrenceKey };
    }
    return { status: 'created', expenseId, occurrenceKey, via };
  }

  const raced = await findOccurrence({ recurrence, dueDate, occurrenceKey, session });
  if (raced) return { status: 'duplicate', expenseId: toId(raced._id), occurrenceKey };

  try {
    const expense = await writeDirectExpense({ recurrence, group, dueDate, occurrenceKey, session });
    return { status: 'created', expenseId: toId(expense._id), occurrenceKey, via: 'direct', fallbackReason };
  } catch (error) {
    if (isDuplicateKeyError(error)) return { status: 'duplicate', expenseId: null, occurrenceKey };
    throw error;
  }
}

async function notifyOccurrences({ recurrence, group, generated, lastDueDate, now }) {
  if (!generated.length) return;
  const display = money.format(recurrence.totalMinor, recurrence.currency);
  const lastDate = lastDueDate ? new Date(lastDueDate).toISOString().slice(0, 10) : 'today';
  await notificationService.notify({
    groupId: toId(group._id),
    includeGroupMembers: true,
    type: 'recurring_due',
    title:
      generated.length === 1
        ? `Recurring ${recurrence.title} added on ${lastDate}`
        : `${generated.length} recurring ${recurrence.title} entries added`,
    body: `The rule "${recurrence.title}" (${display} each) posted ${generated.length} ledger entr${
      generated.length === 1 ? 'y' : 'ies'
    } automatically. This is a ledger entry, not a payment — nobody has been charged.`,
    payload: {
      recurrenceId: toId(recurrence._id),
      groupId: toId(group._id),
      amountMinor: recurrence.totalMinor,
      currency: recurrence.currency,
      occurrences: generated.length,
      expenseIds: generated.map((entry) => entry.expenseId).filter(Boolean),
      at: new Date(now).toISOString(),
    },
  });
}

/**
 * Generate every occurrence that is due at `now`. Idempotent by construction: an existing
 * occurrence key short-circuits the write, and a duplicate-key error is swallowed rather
 * than turned into a second charge.
 */
async function runDueOccurrences(now = new Date(), { groupId = null } = {}) {
  const filter = { isActive: true, nextDueDate: { $lte: now } };
  if (groupId) filter.groupId = oid(groupId);

  const recurrences = await RecurringExpense.find(filter).sort({ nextDueDate: 1 }).limit(MAX_RULES_PER_RUN);
  const summary = {
    checked: recurrences.length,
    generated: 0,
    duplicates: 0,
    exhausted: 0,
    rules: [],
    errors: [],
    via: ledgerWriter().mode,
  };

  for (const recurrence of recurrences) {
    const group = await Group.findById(recurrence.groupId).lean();
    if (!group) {
      summary.errors.push({ recurrenceId: toId(recurrence._id), message: 'Group no longer exists' });
      continue;
    }

    let lastDueDate = null;
    const outcome = await withTransaction(async ({ session }) => {
      const generated = [];
      let duplicates = 0;
      let guard = 0;

      while (new Date(recurrence.nextDueDate).getTime() <= now.getTime() && guard < MAX_OCCURRENCES_PER_RULE) {
        guard += 1;
        const dueDate = new Date(recurrence.nextDueDate);
        lastDueDate = dueDate;
        const result = await materialiseOccurrence({ recurrence, group, dueDate, session });
        if (result.status === 'created') generated.push(result);
        else duplicates += 1;

        recurrence.occurrenceCount += 1;
        recurrence.nextDueDate = advanceDueDate(recurrence, dueDate);
        recurrence.lastGeneratedExpenseId = result.expenseId ? oid(result.expenseId) : recurrence.lastGeneratedExpenseId;
        recurrence.lastGeneratedAt = now;

        if (isExhaustedAfter(recurrence, recurrence.nextDueDate)) {
          recurrence.isActive = false;
          break;
        }
      }

      await recurrence.save(sessionOptions(session));
      return { generated, duplicates, deactivated: !recurrence.isActive };
    });

    summary.generated += outcome.generated.length;
    summary.duplicates += outcome.duplicates;
    if (outcome.deactivated) summary.exhausted += 1;
    summary.rules.push({
      recurrenceId: toId(recurrence._id),
      title: recurrence.title,
      generated: outcome.generated.length,
      duplicates: outcome.duplicates,
      nextDueDate: new Date(recurrence.nextDueDate).toISOString(),
      isActive: recurrence.isActive,
      expenseIds: outcome.generated.map((entry) => entry.expenseId).filter(Boolean),
    });

    try {
      await notifyOccurrences({ recurrence, group, generated: outcome.generated, lastDueDate, now });
    } catch (error) {
      // A notification failure must not undo a correct ledger entry.
      summary.errors.push({ recurrenceId: toId(recurrence._id), message: `Notification failed: ${error.message}` });
    }
  }

  return summary;
}

/**
 * In production the scheduler is a 15-minute heartbeat on the same idempotent entry point.
 * Under test it is inert: the suite calls `runDueOccurrences(now)` directly with a fixed
 * clock, which is the only way to test a date-driven rule deterministically.
 */
function startScheduler({ intervalMs = SCHEDULER_INTERVAL_MS, onError } = {}) {
  if (process.env.NODE_ENV === 'test') {
    return { stop() {}, running: false, intervalMs: 0 };
  }

  const timer = setInterval(() => {
    runDueOccurrences(new Date()).catch((error) => {
      if (onError) return onError(error);
      // eslint-disable-next-line no-console
      console.error('[recurring] scheduler run failed', error);
      return undefined;
    });
  }, intervalMs);
  // Never keep the event loop alive for a housekeeping timer.
  if (typeof timer.unref === 'function') timer.unref();

  return { stop: () => clearInterval(timer), running: true, intervalMs };
}

module.exports = {
  createRecurrence,
  listRecurrences,
  getRecurrence,
  updateRecurrence,
  removeRecurrence,
  setPaused,
  pauseRecurrence: ({ actorId, recurringId }) => setPaused({ actorId, recurringId, paused: true }),
  resumeRecurrence: ({ actorId, recurringId, now = new Date() }) =>
    setPaused({ actorId, recurringId, paused: false, now }),
  occurrenceHistory,
  runDueOccurrences,
  startScheduler,
  advanceDueDate,
  upcomingOccurrences,
  materialiseOccurrence,
  toRecurrenceDto,
  SCHEDULER_INTERVAL_MS,
  MAX_OCCURRENCES_PER_RULE,
};
