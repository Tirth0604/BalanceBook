'use strict';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/budgettest';
process.env.USE_TRANSACTIONS = 'true';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app');
const { connectDatabase, disconnectDatabase } = require('../../src/config/db');
const { signAccessToken } = require('../../src/middleware/authMiddleware');
const User = require('../../src/models/User');
const Group = require('../../src/models/Group');
const Expense = require('../../src/models/Expense');
const Budget = require('../../src/models/Budget');
const Notification = require('../../src/models/Notification');
const Settlement = require('../../src/models/Settlement');
const RecurringExpense = require('../../src/models/RecurringExpense');

let mongod;

async function makeUser(name, email) {
  return User.create({ name, email, password: 'Passw0rd123', preferredCurrency: 'INR' });
}

async function makeGroup(createdBy, memberUsers = []) {
  const members = [
    { userId: createdBy._id, role: 'admin', status: 'active' },
    ...memberUsers.map((user) => ({ userId: user._id, role: 'member', status: 'active' })),
  ];
  return Group.create({ name: 'Flatmates', baseCurrency: 'INR', createdBy: createdBy._id, members });
}

async function makeExpense(group, { paidBy, shares, totalMinor, category = 'groceries' }) {
  const participants = Object.entries(shares).map(([userId, shareMinor]) => ({ userId, shareMinor }));
  return Expense.create({
    groupId: group._id,
    title: 'shop',
    category,
    totalMinor,
    currency: 'INR',
    groupAmountMinor: totalMinor,
    paidBy,
    splitType: 'exact',
    participants,
    createdBy: paidBy,
    expenseDate: new Date('2020-06-01'),
  });
}

const bearer = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDatabase(mongod.getUri());
});

afterAll(async () => {
  await disconnectDatabase();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all(
    [User, Group, Expense, Budget, Notification, Settlement, RecurringExpense].map((m) => m.deleteMany({})),
  );
});

describe('budget upsert and live spent', () => {
  test('PUT /groups/:id/budgets creates a plan and reports spent vs remaining', async () => {
    const alice = await makeUser('Alice', 'alice-bud@example.com');
    const bob = await makeUser('Bob', 'bob-bud@example.com');
    const group = await makeGroup(alice, [bob]);
    await makeExpense(group, { paidBy: alice._id, totalMinor: 8000, shares: { [alice._id]: 4000, [bob._id]: 4000 } });

    const res = await request(app)
      .put(`/api/v1/groups/${group._id}/budgets`)
      .set(bearer(alice))
      .send({ scope: 'group_total', limit: '100.00', period: 'overall', startDate: '2020-01-01' });

    expect(res.status).toBe(201);
    const budget = res.body.data;
    expect(budget.limitMinor).toBe(10000);
    expect(budget.spentMinor).toBe(8000);
    expect(budget.remainingMinor).toBe(2000);
    expect(budget.percentUsed).toBe(80);
    expect(budget.thresholdHit).toBe(75);
    expect(budget.currency).toBe('INR');
  });

  test('spent is derived from the ledger — deleting an expense lowers it', async () => {
    const alice = await makeUser('Alice', 'alice-bud2@example.com');
    const bob = await makeUser('Bob', 'bob-bud2@example.com');
    const group = await makeGroup(alice, [bob]);
    await makeExpense(group, { paidBy: alice._id, totalMinor: 8000, shares: { [alice._id]: 4000, [bob._id]: 4000 } });
    const created = await request(app)
      .put(`/api/v1/groups/${group._id}/budgets`)
      .set(bearer(alice))
      .send({ scope: 'group_total', limit: '100.00', period: 'overall', startDate: '2020-01-01' });
    const budgetId = created.body.data.id;

    await Expense.deleteMany({ groupId: group._id });
    const after = await request(app).get(`/api/v1/budgets/${budgetId}`).set(bearer(alice));
    expect(after.body.data.spentMinor).toBe(0);
    expect(after.body.data.percentUsed).toBe(0);
  });

  test('a category budget only counts its own category', async () => {
    const alice = await makeUser('Alice', 'alice-bud3@example.com');
    const bob = await makeUser('Bob', 'bob-bud3@example.com');
    const group = await makeGroup(alice, [bob]);
    await makeExpense(group, { paidBy: alice._id, totalMinor: 5000, category: 'food', shares: { [alice._id]: 2500, [bob._id]: 2500 } });
    await makeExpense(group, { paidBy: alice._id, totalMinor: 7000, category: 'travel', shares: { [alice._id]: 3500, [bob._id]: 3500 } });

    const res = await request(app)
      .put(`/api/v1/groups/${group._id}/budgets`)
      .set(bearer(alice))
      .send({ scope: 'category', category: 'food', limit: '60.00', period: 'overall', startDate: '2020-01-01' });
    expect(res.status).toBe(201);
    expect(res.body.data.scope).toBe('category');
    expect(res.body.data.spentMinor).toBe(5000);
    expect(res.body.data.remainingMinor).toBe(1000);
  });

  test('re-PUT on the same scope updates in place (unique key), not a second row', async () => {
    const alice = await makeUser('Alice', 'alice-bud4@example.com');
    const group = await makeGroup(alice, []);
    await request(app)
      .put(`/api/v1/groups/${group._id}/budgets`)
      .set(bearer(alice))
      .send({ scope: 'group_total', limit: '100.00', period: 'overall', startDate: '2020-01-01' });
    await request(app)
      .put(`/api/v1/groups/${group._id}/budgets`)
      .set(bearer(alice))
      .send({ scope: 'group_total', limit: '200.00', period: 'overall', startDate: '2020-01-01' });
    expect(await Budget.countDocuments({ groupId: group._id })).toBe(1);
    expect(await Budget.countDocuments({ groupId: group._id, limitMinor: 20000 })).toBe(1);
  });
});

describe('threshold alerts fire exactly once', () => {
  test('the 75% alert fires on first crossing and never repeats', async () => {
    const alice = await makeUser('Alice', 'alice-bud5@example.com');
    const bob = await makeUser('Bob', 'bob-bud5@example.com');
    const group = await makeGroup(alice, [bob]);
    await makeExpense(group, { paidBy: alice._id, totalMinor: 8000, shares: { [alice._id]: 4000, [bob._id]: 4000 } });

    const created = await request(app)
      .put(`/api/v1/groups/${group._id}/budgets`)
      .set(bearer(alice))
      .send({ scope: 'group_total', limit: '100.00', period: 'overall', startDate: '2020-01-01', alertThresholds: [75, 90, 100] });
    expect(created.status).toBe(201);
    expect(created.body.data.notifiedThresholds).toEqual([75]);

    const firstCount = await Notification.countDocuments({ groupId: group._id, type: 'budget_threshold' });
    expect(firstCount).toBeGreaterThan(0);

    // Re-reads (which re-evaluate) must not re-fire the already-claimed 75% threshold.
    await request(app).get(`/api/v1/groups/${group._id}/budgets`).set(bearer(alice));
    await request(app).get(`/api/v1/groups/${group._id}/budgets`).set(bearer(alice));

    const afterCount = await Notification.countDocuments({ groupId: group._id, type: 'budget_threshold' });
    expect(afterCount).toBe(firstCount);
    const budget = await Budget.findById(created.body.data.id).lean();
    expect(budget.notifiedThresholds).toEqual([75]);
  });

  test('crossing into a new threshold fires that one alert once too', async () => {
    const alice = await makeUser('Alice', 'alice-bud6@example.com');
    const bob = await makeUser('Bob', 'bob-bud6@example.com');
    const group = await makeGroup(alice, [bob]);
    await makeExpense(group, { paidBy: alice._id, totalMinor: 8000, shares: { [alice._id]: 4000, [bob._id]: 4000 } });
    const created = await request(app)
      .put(`/api/v1/groups/${group._id}/budgets`)
      .set(bearer(alice))
      .send({ scope: 'group_total', limit: '100.00', period: 'overall', startDate: '2020-01-01', alertThresholds: [75, 90, 100] });
    const budgetId = created.body.data.id;

    // Push spend to 95% -> only the 90 threshold is newly crossed (100 is not).
    await makeExpense(group, { paidBy: alice._id, totalMinor: 1500, shares: { [alice._id]: 750, [bob._id]: 750 } });
    const refreshed = await request(app).get(`/api/v1/budgets/${budgetId}`).set(bearer(alice));
    expect(refreshed.body.data.percentUsed).toBe(95);
    expect(refreshed.body.data.notifiedThresholds.sort((a, b) => a - b)).toEqual([75, 90]);

    const alerts = await Notification.find({ type: 'budget_threshold' }).lean();
    // one alert per threshold per member for the two distinct thresholds crossed
    const thresholds = new Set(alerts.map((row) => row.payload.threshold));
    expect([...thresholds].sort((a, b) => a - b)).toEqual([75, 90]);

    // And it must remain stable on further reads.
    const before = await Notification.countDocuments({ type: 'budget_threshold' });
    await request(app).get(`/api/v1/budgets/${budgetId}`).set(bearer(alice));
    expect(await Notification.countDocuments({ type: 'budget_threshold' })).toBe(before);
  });
});

describe('budgets authorization', () => {
  test('a non-member gets 403 on group-scoped budget routes', async () => {
    const alice = await makeUser('Alice', 'alice-bud7@example.com');
    const bob = await makeUser('Bob', 'bob-bud7@example.com');
    const outsider = await makeUser('Outsider', 'out-bud7@example.com');
    const group = await makeGroup(alice, [bob]);
    const created = await request(app)
      .put(`/api/v1/groups/${group._id}/budgets`)
      .set(bearer(alice))
      .send({ scope: 'group_total', limit: '100.00', period: 'overall', startDate: '2020-01-01' });
    const budgetId = created.body.data.id;

    const list = await request(app).get(`/api/v1/groups/${group._id}/budgets`).set(bearer(outsider));
    expect(list.status).toBe(403);

    const read = await request(app).get(`/api/v1/budgets/${budgetId}`).set(bearer(outsider));
    expect(read.status).toBe(403);

    const del = await request(app).delete(`/api/v1/budgets/${budgetId}`).set(bearer(outsider));
    expect(del.status).toBe(403);

    const put = await request(app)
      .put(`/api/v1/groups/${group._id}/budgets`)
      .set(bearer(outsider))
      .send({ scope: 'group_total', limit: '100.00' });
    expect(put.status).toBe(403);
  });

  test('a plain member cannot write a budget; only admins can', async () => {
    const alice = await makeUser('Alice', 'alice-bud8@example.com');
    const bob = await makeUser('Bob', 'bob-bud8@example.com');
    const group = await makeGroup(alice, [bob]);
    const res = await request(app)
      .put(`/api/v1/groups/${group._id}/budgets`)
      .set(bearer(bob))
      .send({ scope: 'group_total', limit: '100.00', period: 'overall', startDate: '2020-01-01' });
    expect(res.status).toBe(403);
  });

  test('DELETE /budgets/:id soft-deletes for an admin', async () => {
    const alice = await makeUser('Alice', 'alice-bud9@example.com');
    const group = await makeGroup(alice, []);
    const created = await request(app)
      .put(`/api/v1/groups/${group._id}/budgets`)
      .set(bearer(alice))
      .send({ scope: 'group_total', limit: '100.00', period: 'overall', startDate: '2020-01-01' });
    const del = await request(app).delete(`/api/v1/budgets/${created.body.data.id}`).set(bearer(alice));
    expect(del.status).toBe(200);
    const budget = await Budget.findById(created.body.data.id).lean();
    expect(budget.isActive).toBe(false);
    const list = await request(app).get(`/api/v1/groups/${group._id}/budgets`).set(bearer(alice));
    expect(list.body.data.budgets).toHaveLength(0);
  });
});
