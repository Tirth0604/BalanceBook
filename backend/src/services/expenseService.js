'use strict';

const mongoose = require('mongoose');

const Expense = require('../models/Expense');
const ExpenseAuditLog = require('../models/ExpenseAuditLog');
const Group = require('../models/Group');
const User = require('../models/User');

const { withTransaction } = require('../config/db');
const money = require('../utils/money');
const currencyEngine = require('../algorithms/currency');
const splitter = require('../algorithms/splitter');
const ApiError = require('../utils/ApiError');
const { parsePagination, buildMeta, resolveRange } = require('../utils/pagination');
const notificationService = require('./notificationService');
const storageService = require('./storageService');

const { MoneyError } = money;

const USER_FIELDS = 'name email avatarUrl';
const GROUP_FIELDS = 'name baseCurrency members';
const MAX_FUTURE_DAYS = 1;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Split/money codes that blame the participants array rather than the total. */
const PARTICIPANT_ERROR_CODES = new Set([
  'SHARE_SUM_MISMATCH',
  'SHARE_INVALID',
  'PERCENTAGE_SUM_INVALID',
  'PERCENTAGE_INVALID',
  'DUPLICATE_PARTICIPANT',
  'NO_PARTICIPANTS',
  'INVALID_PARTICIPANT',
  'INVALID_WEIGHT',
  'ALLOCATION_ERROR',
]);

const AMOUNT_ERROR_CODES = new Set(['MONEY_PRECISION', 'INVALID_AMOUNT', 'AMOUNT_OUT_OF_RANGE', 'INVALID_MINOR']);

/**
 * The engine is pure and throws MoneyError; the API boundary turns those into
 * 422 VALIDATION_ERROR (or 400 UNKNOWN_CURRENCY) pointing at the offending field,
 * so a client mistake never leaks a 500.
 */
function mapMoneyError(error) {
  const code = error.code || 'MONEY_ERROR';
  if (code === 'UNKNOWN_CURRENCY') {
    return new ApiError(400, 'UNKNOWN_CURRENCY', error.message, [{ path: 'currency', message: error.message, code }]);
  }
  let path = 'amount';
  if (PARTICIPANT_ERROR_CODES.has(code)) path = 'participants';
  else if (code === 'SPLIT_TYPE_INVALID') path = 'splitType';
  else if (code === 'INVALID_RATE') path = 'exchangeRate';
  else if (!AMOUNT_ERROR_CODES.has(code)) path = 'participants';
  return ApiError.unprocessable(error.message, [{ path, message: error.message, code }]);
}

function runMoneyWork(work) {
  try {
    return work();
  } catch (error) {
    if (error instanceof MoneyError) throw mapMoneyError(error);
    throw error;
  }
}

function toObjectId(value, message) {
  if (!mongoose.isValidObjectId(String(value))) throw ApiError.badRequest(message);
  return new mongoose.Types.ObjectId(String(value));
}

function ref(id) {
  if (!id) return null;
  if (typeof id === 'object' && id._id) return String(id._id);
  return String(id);
}

function isPopulatedDoc(value, marker) {
  return Boolean(value) && typeof value === 'object' && value[marker] !== undefined;
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Financial truth of an expense, for the audit diff — never receipt bytes or the whole doc. */
function financialSnapshot(expense) {
  return {
    title: expense.title,
    category: expense.category,
    totalMinor: expense.totalMinor,
    currency: expense.currency,
    groupAmountMinor: expense.groupAmountMinor,
    exchangeRate: expense.exchangeRate,
    paidBy: ref(expense.paidBy?._id ?? expense.paidBy),
    splitType: expense.splitType,
    expenseDate: expense.expenseDate ? new Date(expense.expenseDate).toISOString() : null,
    participants: (expense.participants || []).map((participant) => ({
      userId: ref(participant.userId?._id ?? participant.userId),
      shareMinor: participant.shareMinor,
      percentage: participant.percentage ?? null,
    })),
  };
}

function receiptSummary(receipt) {
  if (!receipt) return null;
  return {
    url: receipt.url,
    mimeType: receipt.mimeType,
    sizeBytes: receipt.sizeBytes,
    fileName: receipt.fileName,
  };
}

function userRef(user) {
  if (!user) return null;
  if (!isPopulatedDoc(user, 'name')) {
    return { id: ref(user), name: null, email: null, avatarUrl: null };
  }
  return {
    id: String(user._id),
    name: user.name ?? null,
    email: user.email ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}

function groupRef(groupIdOrDoc) {
  if (isPopulatedDoc(groupIdOrDoc, 'name')) {
    return { id: String(groupIdOrDoc._id), name: groupIdOrDoc.name, baseCurrency: groupIdOrDoc.baseCurrency };
  }
  return { id: ref(groupIdOrDoc), name: null, baseCurrency: null };
}

/**
 * Contract Expense DTO. Callers should populate `group`, `paidBy`, `participants.userId`
 * and `createdBy`; unpopulated refs degrade to id-only UserRefs rather than crashing.
 */
function toExpenseDto(expense, actorId = null) {
  const currencyCode = expense.currency || 'INR';
  const paidById = ref(expense.paidBy);
  // The schema stores `groupId`; loaders populate that path, so the DTO reads a doc there.
  const groupDocument = isPopulatedDoc(expense.groupId, 'members') ? expense.groupId : null;
  const isAdmin = Boolean(groupDocument?.hasActiveAdmin?.(String(actorId ?? '')));
  const canModify = paidById === String(actorId ?? '') || isAdmin;

  const participants = (expense.participants || []).map((participant) => ({
    user: userRef(participant.userId),
    shareMinor: participant.shareMinor,
    share: money.fromMinor(participant.shareMinor, currencyCode),
    percentage: participant.percentage ?? null,
    isPayer: ref(participant.userId) === paidById,
  }));

  return {
    id: String(expense._id),
    group: groupRef(expense.groupId),
    title: expense.title,
    description: expense.description ?? '',
    category: expense.category,
    tags: expense.tags ?? [],
    totalMinor: expense.totalMinor,
    amount: money.fromMinor(expense.totalMinor, currencyCode),
    currency: currencyCode,
    exchangeRate: expense.exchangeRate,
    groupAmountMinor: expense.groupAmountMinor,
    paidBy: userRef(expense.paidBy),
    splitType: expense.splitType,
    participants,
    receipt: receiptSummary(expense.receipt),
    expenseDate: expense.expenseDate ? new Date(expense.expenseDate).toISOString() : null,
    notes: expense.notes ?? '',
    recurrenceId: ref(expense.recurrenceId),
    createdBy: userRef(expense.createdBy),
    createdAt: expense.createdAt ? new Date(expense.createdAt).toISOString() : null,
    updatedAt: expense.updatedAt ? new Date(expense.updatedAt).toISOString() : null,
    editable: canModify,
    deletable: canModify,
  };
}

const DTO_POPULATE = [
  { path: 'groupId', select: GROUP_FIELDS },
  { path: 'paidBy', select: USER_FIELDS },
  { path: 'createdBy', select: USER_FIELDS },
  { path: 'participants.userId', select: USER_FIELDS },
];

async function loadForDto(expenseId, actorId, session = null) {
  const expense = await Expense.findById(expenseId).populate(DTO_POPULATE).session(session ?? null);
  if (!expense) throw ApiError.notFound('Expense not found');
  return toExpenseDto(expense, actorId);
}

async function loadGroup(groupId, session) {
  const group = await Group.findById(groupId).session(session ?? null);
  if (!group) throw ApiError.notFound('Group not found');
  return group;
}

function assertActiveMember(group, userId, label) {
  const member = group.findMember(userId);
  if (!member || member.status !== 'active') {
    throw ApiError.badRequest(`${label} must be an active member of this group`);
  }
  return member;
}

function assertGroupMemberRequired(group, actorId) {
  if (!group.isMember(String(actorId ?? ''))) {
    throw ApiError.forbidden('You are not a member of this group');
  }
}

function assertCanModify(expense, group, actorId) {
  const paidById = ref(expense.paidBy?._id ?? expense.paidBy);
  if (paidById === String(actorId)) return;
  if (!group.hasActiveAdmin(String(actorId ?? ''))) {
    throw ApiError.forbidden('Only the payer or a group admin can modify this expense');
  }
}

async function resolveGroup(groupIdOrGroup, actorId, session) {
  // Accept an already-loaded group (route middleware) or fall back to the given id.
  const group = groupIdOrGroup && groupIdOrGroup.members !== undefined ? groupIdOrGroup : await loadGroup(groupIdOrGroup, session);
  assertGroupMemberRequired(group, actorId);
  return group;
}

function parseExpenseDate(value) {
  if (value === undefined || value === null || value === '') return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw ApiError.badRequest('expenseDate is not a valid date');
  if (date.getTime() > Date.now() + MAX_FUTURE_DAYS * ONE_DAY_MS) {
    throw ApiError.unprocessable('expenseDate cannot be more than one day in the future', [
      { path: 'expenseDate', message: 'expenseDate cannot be more than one day in the future' },
    ]);
  }
  return date;
}

/**
 * Validate members, convert the total, snapshot the exchange rate and let the pure
 * engine allocate every share. Nothing here trusts a client-computed number.
 */
function buildExpensePlan({ body, group }) {
  const currencyCode = String(body.currency || group.baseCurrency || 'INR').toUpperCase();
  const totalMinor = runMoneyWork(() => money.toMinor(body.amount, currencyCode));
  if (totalMinor <= 0) {
    throw ApiError.unprocessable('Expense amount must be greater than zero', [
      { path: 'amount', message: 'Expense amount must be greater than zero' },
    ]);
  }

  const requestedRate = body.exchangeRate == null ? 1 : Number(body.exchangeRate);
  if (!Number.isFinite(requestedRate) || requestedRate <= 0) {
    throw ApiError.unprocessable('exchangeRate must be a positive number', [
      { path: 'exchangeRate', message: 'exchangeRate must be a positive number' },
    ]);
  }
  // A same-currency expense needs no conversion; forcing rate 1 keeps the snapshot honest.
  const isBaseCurrency = currencyEngine.sameCurrency(currencyCode, group.baseCurrency);
  const exchangeRate = isBaseCurrency ? 1 : requestedRate;
  const groupAmountMinor = runMoneyWork(() =>
    currencyEngine.convert(totalMinor, currencyCode, group.baseCurrency, exchangeRate),
  );

  const paidBy = toObjectId(body.paidBy, 'paidBy must be a valid user id');
  assertActiveMember(group, paidBy, 'paidBy');

  const participants = (body.participants || []).map((participant) => ({
    userId: participant.userId,
    share: participant.share,
    percentage: participant.percentage,
    shareMinor: participant.shareMinor,
  }));
  const seen = new Set();
  for (const participant of participants) {
    const id = toObjectId(participant.userId, 'participant userId must be a valid user id');
    participant.userId = String(id);
    if (seen.has(participant.userId)) {
      throw ApiError.unprocessable(`Participant ${participant.userId} appears more than once`, [
        { path: 'participants', message: 'The same user cannot appear twice', code: 'DUPLICATE_PARTICIPANT' },
      ]);
    }
    seen.add(participant.userId);
    assertActiveMember(group, id, 'Every participant');
  }
  if (participants.length === 0) {
    throw ApiError.unprocessable('An expense needs at least one participant', [
      { path: 'participants', message: 'An expense needs at least one participant' },
    ]);
  }

  const shares = runMoneyWork(() =>
    splitter.split(totalMinor, { splitType: body.splitType, participants, currency: currencyCode }),
  );

  return {
    title: body.title,
    description: body.description ?? '',
    category: body.category ?? 'others',
    tags: body.tags ?? [],
    totalMinor,
    currency: currencyCode,
    groupAmountMinor,
    exchangeRate,
    paidBy,
    splitType: String(body.splitType).toLowerCase(),
    participants: shares.map((share) => ({
      userId: toObjectId(share.userId),
      shareMinor: share.shareMinor,
      percentage: share.percentage ?? null,
    })),
    expenseDate: parseExpenseDate(body.expenseDate),
    notes: body.notes ?? '',
  };
}

async function writeAudit({ expense, actorId, action, previousData, updatedData, changeSummary, reason, session }) {
  await ExpenseAuditLog.create(
    [
      {
        expenseId: expense._id,
        groupId: expense.groupId,
        modifiedBy: toObjectId(actorId, 'actorId must be a valid user id'),
        action,
        previousData: previousData ?? null,
        updatedData: updatedData ?? null,
        changeSummary: (changeSummary || '').slice(0, 500),
        reason: reason ? String(reason).slice(0, 300) : null,
      },
    ],
    { session: session ?? null },
  );
}

async function notifyExpense({ doc, group, actorId, kind, session }) {
  const actor = await User.findById(actorId).select('name').session(session ?? null);
  const actorName = actor?.name || 'A group member';
  const display = money.format(doc.totalMinor, doc.currency);
  const messages = {
    created: {
      type: 'expense_added',
      title: `New expense: ${doc.title}`,
      body: `${actorName} added "${doc.title}" (${display}) in ${group.name}.`,
    },
    updated: {
      type: 'expense_updated',
      title: `Expense updated: ${doc.title}`,
      body: `${actorName} updated "${doc.title}" (${display}) in ${group.name}.`,
    },
    deleted: {
      type: 'expense_deleted',
      title: `Expense deleted: ${doc.title}`,
      body: `${actorName} removed "${doc.title}" (${display}) from ${group.name}.`,
    },
  };
  const message = messages[kind];
  if (!message) return;
  await notificationService.notify({
    groupId: String(group._id),
    includeGroupMembers: true,
    excludeUserId: String(actorId),
    type: message.type,
    title: message.title.slice(0, 140),
    body: message.body.slice(0, 400),
    payload: { expenseId: String(doc._id), groupId: String(group._id), amountMinor: doc.groupAmountMinor },
    session,
  });
}

/**
 * `session` lets another module (e.g. the recurring scheduler) fold this write into its
 * own transaction; standalone callers get a transaction of their own. Real-time events
 * are emitted once every document write in the unit has succeeded — with transactions
 * available the commit lands microseconds later, which is acceptable for a UI hint.
 */
async function runWrite(session, work, broadcast = () => {}) {
  if (session) {
    const result = await work({ session });
    broadcast(result);
    return result;
  }
  const result = await withTransaction(work);
  broadcast(result);
  return result;
}

async function createExpense({ groupId, actorId, body, session } = {}) {
  const created = await runWrite(
    session ?? null,
    async ({ session: scoped }) => {
      const group = await resolveGroup(groupId, actorId, scoped);
      const plan = buildExpensePlan({ body, group });
      const [doc] = await Expense.create([{ ...plan, groupId: group._id, createdBy: actorId }], {
        session: scoped ?? null,
      });
      await writeAudit({
        expense: doc,
        actorId,
        action: 'created',
        previousData: null,
        updatedData: financialSnapshot(doc),
        changeSummary: `Created "${doc.title}" ${money.format(doc.totalMinor, doc.currency)} (${doc.splitType}, ${doc.participants.length} participant${doc.participants.length === 1 ? '' : 's'}, category ${doc.category})`,
        session: scoped,
      });
      await notifyExpense({ doc, group, actorId, kind: 'created', session: scoped });
      return { id: String(doc._id), groupId: String(group._id) };
    },
    (result) =>
      notificationService.broadcastGroup(result.groupId, 'expense:created', {
        expenseId: result.id,
        groupId: result.groupId,
      }),
  );
  return loadForDto(created.id, actorId);
}

async function findEditableExpense(expenseId, options = {}) {
  const session = options && options.session ? options.session : null;
  const expense = await Expense.findOne({ _id: expenseId, isDeleted: false }).session(session);
  if (!expense) throw ApiError.notFound('Expense not found');
  return expense;
}

async function updateExpense({ expenseId, actorId, body, session } = {}) {
  const updated = await runWrite(
    session ?? null,
    async ({ session: scoped }) => {
      const expense = await findEditableExpense(expenseId, { session: scoped });
      const group = await loadGroup(expense.groupId, scoped);
      assertGroupMemberRequired(group, actorId);
      assertCanModify(expense, group, actorId);

      if (body.currency && body.amount == null) {
        throw ApiError.unprocessable('Changing currency requires a new amount', [
          { path: 'currency', message: 'Changing currency requires a new amount' },
        ]);
      }

      // Merge stored values so a partial PATCH still triggers a full, consistent re-split.
      const merged = {
        title: body.title ?? expense.title,
        description: body.description ?? expense.description ?? '',
        category: body.category ?? expense.category,
        tags: body.tags ?? expense.tags ?? [],
        amount: body.amount ?? money.fromMinor(expense.totalMinor, expense.currency),
        currency: body.currency ?? expense.currency,
        exchangeRate:
          body.exchangeRate ??
          (body.currency && !currencyEngine.sameCurrency(body.currency, expense.currency) ? 1 : expense.exchangeRate),
        paidBy: body.paidBy ?? String(expense.paidBy),
        splitType: body.splitType ?? expense.splitType,
        participants:
          body.participants ??
          expense.participants.map((participant) => ({
            userId: String(participant.userId),
            shareMinor: participant.shareMinor,
            percentage: participant.percentage ?? undefined,
          })),
        expenseDate: body.expenseDate ?? expense.expenseDate,
        notes: body.notes ?? expense.notes ?? '',
      };

      const previous = financialSnapshot(expense);
      const plan = buildExpensePlan({ body: merged, group });

      Object.assign(expense, plan);
      expense.lastModifiedBy = toObjectId(actorId, 'actorId must be a valid user id');
      await expense.save({ session: scoped ?? null });

      const after = financialSnapshot(expense);
      const changed = [];
      if (previous.totalMinor !== after.totalMinor) changed.push('amount');
      if (previous.currency !== after.currency) changed.push('currency');
      if (previous.exchangeRate !== after.exchangeRate) changed.push('exchangeRate');
      if (previous.paidBy !== after.paidBy) changed.push('paidBy');
      if (previous.splitType !== after.splitType) changed.push('splitType');
      if (JSON.stringify(previous.participants) !== JSON.stringify(after.participants)) changed.push('participants');
      if (previous.title !== after.title) changed.push('title');
      if (previous.category !== after.category) changed.push('category');
      if (previous.expenseDate !== after.expenseDate) changed.push('expenseDate');
      if (body.tags) changed.push('tags');
      if (body.description !== undefined) changed.push('description');
      if (body.notes !== undefined) changed.push('notes');

      await writeAudit({
        expense,
        actorId,
        action: 'updated',
        previousData: previous,
        updatedData: after,
        changeSummary: `Updated ${changed.length ? changed.join(', ') : 'expense'} — now ${money.format(expense.totalMinor, expense.currency)} (${expense.splitType}, ${expense.participants.length} participant${expense.participants.length === 1 ? '' : 's'})`,
        session: scoped,
      });
      await notifyExpense({ doc: expense, group, actorId, kind: 'updated', session: scoped });
      return { id: String(expense._id), groupId: String(group._id) };
    },
    (result) =>
      notificationService.broadcastGroup(result.groupId, 'expense:updated', {
        expenseId: result.id,
        groupId: result.groupId,
      }),
  );
  return loadForDto(updated.id, actorId);
}

async function deleteExpense({ expenseId, actorId, reason, session } = {}) {
  const outcome = await runWrite(
    session ?? null,
    async ({ session: scoped }) => {
      const expense = await findEditableExpense(expenseId, { session: scoped });
      const group = await loadGroup(expense.groupId, scoped);
      assertGroupMemberRequired(group, actorId);
      assertCanModify(expense, group, actorId);

      const previous = financialSnapshot(expense);
      expense.isDeleted = true;
      expense.deletedAt = new Date();
      expense.deletedBy = toObjectId(actorId, 'actorId must be a valid user id');
      await expense.save({ session: scoped ?? null });

      await writeAudit({
        expense,
        actorId,
        action: 'deleted',
        previousData: previous,
        updatedData: { isDeleted: true, deletedAt: expense.deletedAt.toISOString(), deletedBy: String(actorId) },
        changeSummary: `Soft-deleted "${expense.title}" (${money.format(expense.totalMinor, expense.currency)})`,
        reason,
        session: scoped,
      });
      await notifyExpense({ doc: expense, group, actorId, kind: 'deleted', session: scoped });

      return {
        result: { id: String(expense._id), isDeleted: true, deletedAt: expense.deletedAt.toISOString() },
        groupId: String(group._id),
      };
    },
    (committed) =>
      notificationService.broadcastGroup(committed.groupId, 'expense:deleted', {
        expenseId: committed.result.id,
        groupId: committed.groupId,
      }),
  );
  return outcome.result;
}

async function getExpense({ expenseId, actorId }) {
  const expense = await Expense.findOne({ _id: expenseId, isDeleted: false }).populate(DTO_POPULATE);
  if (!expense) throw ApiError.notFound('Expense not found');
  await resolveGroup(expense.groupId, actorId);
  return toExpenseDto(expense, actorId);
}

async function listExpenses({ actorId, query = {} }) {
  const memberGroups = await Group.find({ 'members.userId': actorId, 'members.status': 'active' }).select(GROUP_FIELDS);
  const groupIds = memberGroups.map((group) => group._id);

  const { page, limit, skip, sort } = parsePagination(query, { defaultSort: '-expenseDate' });
  const empty = { items: [], meta: buildMeta({ page, limit, total: 0 }) };
  if (!groupIds.length) return empty;

  const filter = { groupId: { $in: groupIds }, isDeleted: false };
  if (query.groupId) {
    const requested = toObjectId(query.groupId, 'groupId is not valid');
    if (!groupIds.some((id) => String(id) === String(requested))) return empty;
    filter.groupId = requested;
  }
  if (query.category) filter.category = query.category;
  if (query.paidBy) filter.paidBy = toObjectId(query.paidBy, 'paidBy is not valid');
  if (query.tag) filter.tags = String(query.tag).trim().toLowerCase();
  if (query.search) filter.title = { $regex: escapeRegex(query.search), $options: 'i' };

  // minAmount/maxAmount compare against groupAmountMinor so the filter is single-currency;
  // clients read them in the group base unit (2-decimal minor scale).
  const amounts = {};
  if (query.minAmount != null) amounts.$gte = runMoneyWork(() => money.toMinor(query.minAmount, 'INR'));
  if (query.maxAmount != null) amounts.$lte = runMoneyWork(() => money.toMinor(query.maxAmount, 'INR'));
  if (Object.keys(amounts).length) filter.groupAmountMinor = amounts;

  const window = resolveRange(query);
  if (window && window.expenseDate) {
    filter.expenseDate = { ...(filter.expenseDate || {}), ...window.expenseDate };
  }

  const [items, total] = await Promise.all([
    Expense.find(filter).populate(DTO_POPULATE).sort(sort).skip(skip).limit(limit),
    Expense.countDocuments(filter),
  ]);

  return { items: items.map((item) => toExpenseDto(item, actorId)), meta: buildMeta({ page, limit, total }) };
}

async function attachReceipt({ expenseId, actorId, file, session } = {}) {
  if (!file || !file.buffer) throw ApiError.badRequest('No receipt file received');
  const outcome = await runWrite(
    session ?? null,
    async ({ session: scoped }) => {
      const expense = await findEditableExpense(expenseId, { session: scoped });
      const group = await loadGroup(expense.groupId, scoped);
      assertGroupMemberRequired(group, actorId);
      assertCanModify(expense, group, actorId);

      const reference = await storageService.save({
        buffer: file.buffer,
        mimeType: file.mimetype,
        fileName: file.originalname,
        safeName: file.safeName,
        kind: 'receipts',
      });

      const previousReceipt = receiptSummary(expense.receipt);
      const replacedReference = expense.receipt ? { ...expense.receipt.toObject() } : null;
      expense.receipt = reference;
      expense.lastModifiedBy = toObjectId(actorId, 'actorId must be a valid user id');
      await expense.save({ session: scoped ?? null });

      await writeAudit({
        expense,
        actorId,
        action: 'receipt_added',
        previousData: { receipt: previousReceipt },
        updatedData: { receipt: receiptSummary(expense.receipt) },
        changeSummary: `Receipt ${previousReceipt ? 'replaced' : 'uploaded'}: ${reference.fileName} (${reference.sizeBytes} bytes)`,
        session: scoped,
      });
      return { id: String(expense._id), replacedReference };
    },
  );

  // Old bytes are only dropped once the replacement is durably recorded.
  if (outcome.replacedReference) {
    await storageService.remove(outcome.replacedReference).catch(() => {});
  }
  return loadForDto(outcome.id, actorId);
}

async function removeReceipt({ expenseId, actorId, session } = {}) {
  const outcome = await runWrite(
    session ?? null,
    async ({ session: scoped }) => {
      const expense = await findEditableExpense(expenseId, { session: scoped });
      if (!expense.receipt) throw ApiError.notFound('This expense has no receipt');
      const group = await loadGroup(expense.groupId, scoped);
      assertGroupMemberRequired(group, actorId);
      assertCanModify(expense, group, actorId);

      const previousReceipt = receiptSummary(expense.receipt);
      const oldReference = { ...expense.receipt.toObject() };
      expense.receipt = null;
      expense.lastModifiedBy = toObjectId(actorId, 'actorId must be a valid user id');
      await expense.save({ session: scoped ?? null });

      await writeAudit({
        expense,
        actorId,
        action: 'receipt_removed',
        previousData: { receipt: previousReceipt },
        updatedData: { receipt: null },
        changeSummary: `Receipt removed: ${previousReceipt ? previousReceipt.fileName : 'unknown'}`,
        session: scoped,
      });
      return { id: String(expense._id), oldReference };
    },
  );

  await storageService.remove(outcome.oldReference).catch(() => {});
  return loadForDto(outcome.id, actorId);
}

async function getAuditTrail({ expenseId, actorId }) {
  const expense = await Expense.findById(expenseId);
  if (!expense) throw ApiError.notFound('Expense not found');
  await resolveGroup(expense.groupId, actorId);

  const entries = await ExpenseAuditLog.find({ expenseId })
    // createdAt can collide within a millisecond; the ObjectId counter keeps the order stable.
    .sort({ createdAt: -1, _id: -1 })
    .populate('modifiedBy', USER_FIELDS);
  return entries.map((entry) => ({
    id: String(entry._id),
    expenseId: ref(entry.expenseId),
    groupId: ref(entry.groupId),
    action: entry.action,
    modifiedBy: userRef(entry.modifiedBy),
    previousData: entry.previousData ?? null,
    updatedData: entry.updatedData ?? null,
    changeSummary: entry.changeSummary,
    reason: entry.reason ?? null,
    createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : null,
  }));
}

module.exports = {
  createExpense,
  updateExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  attachReceipt,
  removeReceipt,
  getAuditTrail,
  toExpenseDto,
  findEditableExpense,
};
