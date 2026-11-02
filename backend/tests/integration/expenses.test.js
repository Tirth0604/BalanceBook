'use strict';

// A standalone mongod (MongoMemoryServer default) accepts a no-op startTransaction probe
// but rejects transaction numbers on real writes; the env switch makes src/config/db run
// every write session-less, which is the supported fallback.
process.env.USE_TRANSACTIONS = 'false';

const express = require('express');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { connectDatabase, disconnectDatabase } = require('../../src/config/db');
const baseApp = require('../../src/app');
const expenseRoutes = require('../../src/routes/expenseRoutes');
const { errorMiddleware } = require('../../src/middleware/errorMiddleware');
const User = require('../../src/models/User');
const Group = require('../../src/models/Group');
const Expense = require('../../src/models/Expense');
const ExpenseAuditLog = require('../../src/models/ExpenseAuditLog');
const Notification = require('../../src/models/Notification');
const { signAccessToken } = require('../../src/middleware/authMiddleware');

const API = '/api/v1';

/**
 * src/routes/index.js is lead-owned and mounts expenseRoutes at /expenses; the
 * group-scoped create router (POST /groups/:groupId/expenses) is exported as
 * expenseRoutes.groupScoped. Mounting it here keeps this suite independent of the
 * lead's pending index.js update while still exercising the real routers/middleware.
 */
const app = express();
app.use(express.json());
app.use(`${API}/groups`, expenseRoutes.groupScoped);
app.use(baseApp);
// groupScoped rejects bubble past the mounted base app; give the harness the same
// envelope error handler so failures assert like production responses.
app.use(errorMiddleware);

let mongoServer;
let alice;
let bob;
let carol;
let dave;
let trip;
let flat;

const auth = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

async function makeUser(name, email) {
  return User.create({ name, email, password: 'TestPass123!' });
}

async function makeGroup(name, members, createdBy) {
  return Group.create({
    name,
    createdBy: createdBy._id,
    members: members.map(({ user, role = 'member', status = 'active' }) => ({
      userId: user._id,
      role,
      status,
    })),
  });
}

function expenseBody(overrides = {}) {
  return {
    title: 'Team lunch',
    category: 'food',
    amount: '100.00',
    currency: 'INR',
    paidBy: String(alice._id),
    splitType: 'equal',
    participants: [
      { userId: String(alice._id) },
      { userId: String(bob._id) },
      { userId: String(carol._id) },
    ],
    ...overrides,
  };
}

function createExpense(group, body, actor = alice) {
  return request(app)
    .post(`${API}/groups/${group._id}/expenses`)
    .set(auth(actor))
    .send(body);
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await connectDatabase(mongoServer.getUri());

  [alice, bob, carol, dave] = await Promise.all([
    makeUser('Alice Patel', 'alice@example.com'),
    makeUser('Bob Rao', 'bob@example.com'),
    makeUser('Carol Nair', 'carol@example.com'),
    makeUser('Dave Menon', 'dave@example.com'),
  ]);

  trip = await makeGroup('Goa Trip', [
    { user: alice, role: 'admin' },
    { user: bob },
    { user: carol },
  ], alice);
  flat = await makeGroup('Flatmates', [{ user: alice, role: 'admin' }, { user: dave }], alice);
});

afterAll(async () => {
  await disconnectDatabase();
  if (mongoServer) await mongoServer.stop();
});

describe('POST /groups/:groupId/expenses — split engine integration', () => {
  it('computes equal-split shares server-side and stores the ledger fields', async () => {
    const res = await createExpense(trip, expenseBody({ amount: '100.00' }));
    expect(res.status).toBe(201);
    const expense = res.body.data;

    expect(expense.totalMinor).toBe(10000);
    expect(expense.amount).toBe('100.00');
    expect(expense.currency).toBe('INR');
    expect(expense.groupAmountMinor).toBe(10000);
    expect(expense.exchangeRate).toBe(1);
    expect(expense.splitType).toBe('equal');
    expect(expense.participants).toHaveLength(3);

    const shares = expense.participants.map((p) => p.shareMinor);
    expect(shares.reduce((sum, s) => sum + s, 0)).toBe(expense.totalMinor);
    // Largest-remainder over 10000/3: one paisa goes to the lowest id, others floor.
    expect(shares.every((s) => s === 3333 || s === 3334)).toBe(true);

    expect(expense.paidBy.id).toBe(String(alice._id));
    expect(expense.paidBy.name).toBe('Alice Patel');
    expect(expense.participants.find((p) => p.user.id === String(alice._id)).isPayer).toBe(true);
    expect(expense.editable).toBe(true);
    expect(expense.group).toEqual({ id: String(trip._id), name: 'Goa Trip', baseCurrency: 'INR' });

    // Every share must sum to the total per contract invariant, and the doc agrees.
    const stored = await Expense.findById(expense.id);
    expect(stored.shareSumMinor).toBe(10000);

    // Group members other than the actor were notified.
    const notified = await Notification.countDocuments({ userId: bob._id, type: 'expense_added' });
    expect(notified).toBeGreaterThanOrEqual(1);
    const selfNotified = await Notification.countDocuments({ userId: alice._id, type: 'expense_added' });
    expect(selfNotified).toBe(0);
  });

  it('rejects an exact split whose shares do not sum to the total with 422', async () => {
    const res = await createExpense(
      trip,
      expenseBody({
        splitType: 'exact',
        amount: '100.00',
        participants: [
          { userId: String(alice._id), share: '60.00' },
          { userId: String(bob._id), share: '30.00' },
        ],
      }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path).toBe('participants');
    expect(res.body.error.message).toMatch(/shares/i);
  });

  it('rejects percentages that sum to 99.99 with 422', async () => {
    const res = await createExpense(
      trip,
      expenseBody({
        splitType: 'percentage',
        participants: [
          { userId: String(alice._id), percentage: 50 },
          { userId: String(bob._id), percentage: 49.99 },
        ],
      }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path).toBe('participants');
  });

  it('derives percentage shares that sum exactly to the total', async () => {
    const res = await createExpense(
      trip,
      expenseBody({
        amount: '5000.00',
        splitType: 'percentage',
        participants: [
          { userId: String(alice._id), percentage: 33.33 },
          { userId: String(bob._id), percentage: 33.33 },
          { userId: String(carol._id), percentage: 33.34 },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const expense = res.body.data;
    const shares = expense.participants.map((p) => p.shareMinor);
    expect(shares.reduce((sum, s) => sum + s, 0)).toBe(500000);
    expect(expense.participants.map((p) => p.percentage).sort()).toEqual([33.33, 33.33, 33.34]);
  });

  it('rejects a paidBy who is not an active member of the group', async () => {
    const res = await createExpense(trip, expenseBody({ paidBy: String(dave._id) }));
    // docs/03: 403 is for the CALLER; a bad body field is semantic validation -> 422.
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path).toBe('paidBy');
    expect(res.body.error.message).toMatch(/active member/i);
  });

  it('rejects a paidBy whose membership is no longer active', async () => {
    await Group.updateOne(
      { _id: trip._id },
      { $set: { 'members.$[m].status': 'inactive' } },
      { arrayFilters: [{ 'm.userId': carol._id }] },
    );
    try {
      const res = await createExpense(trip, expenseBody({ paidBy: String(carol._id) }));
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].path).toBe('paidBy');
    } finally {
      await Group.updateOne(
        { _id: trip._id },
        { $set: { 'members.$[m].status': 'active' } },
        { arrayFilters: [{ 'm.userId': carol._id }] },
      );
    }
  });

  it('rejects a participant who is not an active member of the group', async () => {
    const res = await createExpense(
      trip,
      expenseBody({
        participants: [
          { userId: String(alice._id) },
          { userId: String(dave._id) },
        ],
      }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path).toBe('participants');
  });

  it('snapshots currency conversion fields at write time', async () => {
    const res = await createExpense(
      trip,
      expenseBody({
        amount: '100.00',
        currency: 'USD',
        exchangeRate: 83.5,
        participants: [{ userId: String(alice._id) }, { userId: String(bob._id) }],
      }),
    );
    expect(res.status).toBe(201);
    const expense = res.body.data;
    expect(expense.totalMinor).toBe(10000);
    expect(expense.currency).toBe('USD');
    expect(expense.exchangeRate).toBe(83.5);
    // 100.00 USD at 83.5 = 8350.00 INR expressed in paise.
    expect(expense.groupAmountMinor).toBe(835000);
    expect(expense.participants.map((p) => p.shareMinor).reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('rejects amounts with sub-paisa precision as 422 (MONEY_PRECISION mapped)', async () => {
    const res = await createExpense(trip, expenseBody({ amount: '10.005' }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    // the money engine owns per-currency precision; its code must survive the mapping
    expect(res.body.error.details[0].code).toBe('MONEY_PRECISION');
    expect(res.body.error.details[0].path).toBe('amount');
  });

  it('rejects an expense dated more than one day in the future', async () => {
    const farFuture = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const res = await createExpense(trip, expenseBody({ expenseDate: farFuture }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path).toBe('expenseDate');
  });

  it('checks the expense date before running any money work', async () => {
    // Both fields are invalid; the cheap input check must win so the client is not told
    // about a split that was never attempted.
    const farFuture = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const res = await createExpense(trip, expenseBody({ amount: '10.005', expenseDate: farFuture }));
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('expenseDate');
  });

  it('rejects a caller who is not a member of the group with 403', async () => {
    const res = await createExpense(trip, expenseBody(), dave);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    // authorization runs ahead of the resource: nothing about the group leaks back
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/Goa Trip/);
  });
});

describe('PATCH /expenses/:id — edit with full re-split', () => {
  let expenseId;

  beforeEach(async () => {
    const res = await createExpense(
      trip,
      expenseBody({ title: 'Beach shack', amount: '300.00', participants: [{ userId: String(alice._id) }, { userId: String(bob._id) }] }),
    );
    expect(res.status).toBe(201);
    expenseId = res.body.data.id;
  });

  it('recalculates shares for a new total and writes an audit row', async () => {
    const res = await request(app)
      .patch(`${API}/expenses/${expenseId}`)
      .set(auth(alice))
      .send({ amount: '500.00', participants: [{ userId: String(alice._id) }, { userId: String(bob._id) }, { userId: String(carol._id) }] });
    expect(res.status).toBe(200);
    const expense = res.body.data;

    expect(expense.totalMinor).toBe(50000);
    const shares = expense.participants.map((p) => p.shareMinor);
    expect(expense.participants).toHaveLength(3);
    expect(shares.reduce((sum, s) => sum + s, 0)).toBe(50000);

    const audit = await ExpenseAuditLog.find({ expenseId }).sort({ createdAt: -1, _id: -1 });
    expect(audit[0].action).toBe('updated');
    expect(audit[0].previousData.totalMinor).toBe(30000);
    expect(audit[0].updatedData.totalMinor).toBe(50000);
    expect(audit[0].changeSummary).toMatch(/amount|participants/i);
    expect(audit[1].action).toBe('created');
  });

  it('allows a group admin who is not the payer to edit', async () => {
    // carol is only a member here; make her an admin of a fresh expense to isolate the rule.
    await Group.updateOne({ _id: trip._id }, { $set: { 'members.$[m].role': 'admin' } }, { arrayFilters: [{ 'm.userId': carol._id }] });
    const res = await request(app)
      .patch(`${API}/expenses/${expenseId}`)
      .set(auth(carol))
      .send({ title: 'Renamed by admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Renamed by admin');
    await Group.updateOne({ _id: trip._id }, { $set: { 'members.$[m].role': 'member' } }, { arrayFilters: [{ 'm.userId': carol._id }] });
  });

  it('forbids a plain member who is neither payer nor admin', async () => {
    const res = await request(app)
      .patch(`${API}/expenses/${expenseId}`)
      .set(auth(bob))
      .send({ amount: '1.00' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('DELETE /expenses/:id — soft delete', () => {
  it('flags the document, records the audit trail and hides it from reads', async () => {
    const created = await createExpense(trip, expenseBody({ title: 'Sunset cruise' }));
    const expenseId = created.body.data.id;

    const res = await request(app)
      .delete(`${API}/expenses/${expenseId}`)
      .set(auth(alice))
      .send({ reason: 'duplicate entry' });
    expect(res.status).toBe(200);

    const stored = await Expense.findById(expenseId);
    expect(stored.isDeleted).toBe(true);
    expect(stored.deletedBy).toBeTruthy();
    expect(stored.deletedAt).toBeInstanceOf(Date);

    const audit = await ExpenseAuditLog.find({ expenseId }).sort({ createdAt: -1, _id: -1 });
    expect(audit[0].action).toBe('deleted');
    expect(audit[0].reason).toBe('duplicate entry');
    expect(audit[0].previousData.totalMinor).toBe(10000);

    const fetch = await request(app).get(`${API}/expenses/${expenseId}`).set(auth(alice));
    expect(fetch.status).toBe(404);
  });

  it('forbids a non-payer member from deleting', async () => {
    const created = await createExpense(trip, expenseBody({ title: 'Kayaking' }));
    const res = await request(app).delete(`${API}/expenses/${created.body.data.id}`).set(auth(bob));
    expect(res.status).toBe(403);
  });
});

describe('Receipt upload', () => {
  let expenseId;

  beforeEach(async () => {
    const created = await createExpense(trip, expenseBody({ title: 'Market snacks' }));
    expenseId = created.body.data.id;
  });

  it('rejects a .txt receipt file', async () => {
    const res = await request(app)
      .post(`${API}/expenses/${expenseId}/receipt`)
      .set(auth(alice))
      .attach('receipt', Buffer.from('not an image at all'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect([400, 415]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('stores a png receipt through the local driver and replaces it on a second upload', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001', 'hex');
    const first = await request(app)
      .post(`${API}/expenses/${expenseId}/receipt`)
      .set(auth(alice))
      .attach('receipt', png, { filename: 'receipt.png', contentType: 'image/png' });
    expect(first.status).toBe(200);
    expect(first.body.data.expense.receipt.url).toContain('/uploads/receipts/');
    expect(first.body.data.expense.receipt.mimeType).toBe('image/png');

    const second = await request(app)
      .post(`${API}/expenses/${expenseId}/receipt`)
      .set(auth(alice))
      .attach('receipt', png, { filename: 'receipt-v2.png', contentType: 'image/png' });
    expect(second.status).toBe(200);
    expect(second.body.data.expense.receipt.fileName).toBe('receipt-v2.png');
    expect(second.body.data.expense.receipt.url).not.toBe(first.body.data.expense.receipt.url);

    const audit = await ExpenseAuditLog.find({ expenseId, action: 'receipt_added' });
    expect(audit.length).toBe(2);

    const removed = await request(app).delete(`${API}/expenses/${expenseId}/receipt`).set(auth(alice));
    expect(removed.status).toBe(200);
    expect(removed.body.data.expense.receipt).toBeNull();
  });
});

describe('GET /expenses — cross-group list scoped to membership', () => {
  let hideout;

  beforeAll(async () => {
    // trip expenses (alice/bob/carol), flat expenses (alice/dave), hidden group (dave+carol).
    await createExpense(trip, expenseBody({ title: 'Coffee run', category: 'food', amount: '250.00' }));
    await createExpense(trip, expenseBody({ title: 'Hotel stay', category: 'accommodation', amount: '8000.00', expenseDate: '2025-01-05' }));
    await createExpense(
      flat,
      expenseBody({
        title: 'Gas bill',
        category: 'utilities',
        paidBy: String(dave._id),
        participants: [{ userId: String(dave._id) }, { userId: String(alice._id) }],
      }),
      dave,
    );

    hideout = await makeGroup('Hideout Crew', [{ user: dave, role: 'admin' }, { user: carol }], dave);
    await createExpense(
      hideout,
      expenseBody({
        title: 'Secret poker night',
        paidBy: String(dave._id),
        participants: [{ userId: String(dave._id) }, { userId: String(carol._id) }],
      }),
      dave,
    );
  });

  it('never returns expenses from groups the caller is not a member of', async () => {
    const res = await request(app).get(`${API}/expenses`).set(auth(bob));
    expect(res.status).toBe(200);
    const titles = res.body.data.map((e) => e.title);
    expect(titles).toContain('Coffee run');
    expect(titles).not.toContain('Secret poker night');
    expect(titles).not.toContain('Gas bill');

    const groupIds = new Set(res.body.data.map((e) => e.group.id));
    expect(groupIds.has(String(trip._id))).toBe(true);
    expect(groupIds.has(String(hideout._id))).toBe(false);
  });

  it('filters by search, category and date range', async () => {
    const search = await request(app).get(`${API}/expenses?search=coff`).set(auth(alice));
    expect(search.status).toBe(200);
    expect(search.body.data.map((e) => e.title)).toEqual(expect.arrayContaining(['Coffee run']));
    expect(search.body.data.every((e) => /coff/i.test(e.title))).toBe(true);

    const byCategory = await request(app).get(`${API}/expenses?category=accommodation`).set(auth(alice));
    expect(byCategory.body.data.map((e) => e.title)).toEqual(['Hotel stay']);

    const dated = await request(app).get(`${API}/expenses?from=2025-02-01&to=2030-01-01`).set(auth(alice));
    const datedTitles = dated.body.data.map((e) => e.title);
    expect(datedTitles).not.toContain('Hotel stay');
    expect(datedTitles).toContain('Coffee run');
  });

  it('supports minAmount/maxAmount against the group-base amount', async () => {
    const res = await request(app).get(`${API}/expenses?minAmount=100.00&maxAmount=500.00`).set(auth(alice));
    expect(res.status).toBe(200);
    res.body.data.forEach((expense) => {
      expect(expense.totalMinor).toBeGreaterThanOrEqual(10000);
      expect(expense.totalMinor).toBeLessThanOrEqual(50000);
    });
  });
});

describe('Audit trail and meta endpoints', () => {
  it('returns the audit trail newest-first to group members and 403 to outsiders', async () => {
    const created = await createExpense(trip, expenseBody({ title: 'Auto ride' }));
    const expenseId = created.body.data.id;
    await request(app).patch(`${API}/expenses/${expenseId}`).set(auth(alice)).send({ amount: '120.00' });

    const res = await request(app).get(`${API}/expenses/${expenseId}/audit`).set(auth(bob));
    expect(res.status).toBe(200);
    expect(res.body.data.map((entry) => entry.action)).toEqual(['updated', 'created']);
    expect(res.body.data[0].modifiedBy.name).toBe('Alice Patel');

    const outsider = await request(app).get(`${API}/expenses/${expenseId}/audit`).set(auth(dave));
    expect(outsider.status).toBe(403);
  });

  it('serves category and split-type vocabularies from /meta', async () => {
    const categories = await request(app).get(`${API}/meta/categories`).set(auth(alice));
    expect(categories.status).toBe(200);
    expect(categories.body.data.categories).toHaveLength(10);
    expect(categories.body.data.categories[0]).toEqual({
      value: 'food',
      label: 'Food & Dining',
      icon: 'utensils',
    });

    const splits = await request(app).get(`${API}/meta/split-types`).set(auth(alice));
    expect(splits.status).toBe(200);
    expect(splits.body.data.splitTypes.map((s) => s.value)).toEqual(['equal', 'exact', 'percentage']);
  });

  it('requires authentication', async () => {
    const res = await request(app).get(`${API}/expenses`);
    expect(res.status).toBe(401);
  });
});
