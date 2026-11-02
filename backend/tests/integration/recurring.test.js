'use strict';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/recurringtest';
process.env.USE_TRANSACTIONS = 'true';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app');
const { connectDatabase, disconnectDatabase } = require('../../src/config/db');
const { signAccessToken } = require('../../src/middleware/authMiddleware');
const User = require('../../src/models/User');
const Group = require('../../src/models/Group');
const Expense = require('../../src/models/Expense');
const ExpenseAuditLog = require('../../src/models/ExpenseAuditLog');
const Notification = require('../../src/models/Notification');
const RecurringExpense = require('../../src/models/RecurringExpense');
const recurringService = require('../../src/services/recurringExpenseService');

let mongod;

async function makeUser(name, email) {
  return User.create({ name, email, password: 'Passw0rd123', preferredCurrency: 'INR' });
}

async function makeGroup(createdBy, memberUsers = []) {
  const members = [
    { userId: createdBy._id, role: 'admin', status: 'active' },
    ...memberUsers.map((user) => ({ userId: user._id, role: 'member', status: 'active' })),
  ];
  return Group.create({ name: 'Test Group', baseCurrency: 'INR', createdBy: createdBy._id, members });
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
  await Promise.all([User, Group, Expense, ExpenseAuditLog, Notification, RecurringExpense].map((m) => m.deleteMany({})));
});

async function createRuleViaHttp(alice, group, overrides = {}) {
  const res = await request(app)
    .post(`/api/v1/groups/${group._id}/recurring`)
    .set(bearer(alice))
    .send({
      title: 'Netflix',
      category: 'entertainment',
      amount: '500.00',
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-01-31',
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe('recurring rule creation', () => {
  test('POST /groups/:id/recurring creates a template that never charges anyone', async () => {
    const alice = await makeUser('Alice', 'alice-rec@example.com');
    const bob = await makeUser('Bob', 'bob-rec@example.com');
    const group = await makeGroup(alice, [bob]);

    const rule = await createRuleViaHttp(alice, group);
    expect(rule).toMatchObject({ frequency: 'monthly', interval: 1, isActive: true, occurrenceCount: 0 });
    expect(rule.totalMinor).toBe(50000);
    expect(new Date(rule.nextDueDate).toISOString().slice(0, 10)).toBe('2026-01-31');
    // Creating a rule is a template, not a charge: no ledger row exists yet.
    expect(await Expense.countDocuments({})).toBe(0);
  });

  test('a non-member cannot create or list rules for a group', async () => {
    const alice = await makeUser('Alice', 'alice-rec2@example.com');
    const outsider = await makeUser('Out', 'out-rec2@example.com');
    const group = await makeGroup(alice, []);

    const forbiddenCreate = await request(app)
      .post(`/api/v1/groups/${group._id}/recurring`)
      .set(bearer(outsider))
      .send({ title: 'X', amount: '10.00', frequency: 'monthly', startDate: '2026-01-01' });
    expect(forbiddenCreate.status).toBe(403);

    const forbiddenList = await request(app).get(`/api/v1/groups/${group._id}/recurring`).set(bearer(outsider));
    expect(forbiddenList.status).toBe(403);
  });
});

describe('occurrence materialisation is idempotent', () => {
  test('running the scheduler twice creates exactly one expense', async () => {
    const alice = await makeUser('Alice', 'alice-rec3@example.com');
    const bob = await makeUser('Bob', 'bob-rec3@example.com');
    const group = await makeGroup(alice, [bob]);
    const rule = await createRuleViaHttp(alice, group, { startDate: '2026-01-31' });

    const now = new Date('2026-02-01T00:00:00.000Z');
    const first = await recurringService.runDueOccurrences(now, { groupId: String(group._id) });
    expect(first.generated).toBe(1);
    expect(await Expense.countDocuments({ recurrenceId: rule.id })).toBe(1);

    // Second run at the same clock must not double-charge.
    const second = await recurringService.runDueOccurrences(now, { groupId: String(group._id) });
    expect(second.generated).toBe(0);
    expect(await Expense.countDocuments({ recurrenceId: rule.id })).toBe(1);
  });

  test('a reset back to the same due date is skipped silently (unique index), never duplicated', async () => {
    const alice = await makeUser('Alice', 'alice-rec4@example.com');
    const group = await makeGroup(alice, []);
    const rule = await createRuleViaHttp(alice, group, { startDate: '2026-01-31' });

    const now = new Date('2026-01-31T12:00:00.000Z');
    await recurringService.runDueOccurrences(now, { groupId: String(group._id) });
    expect(await Expense.countDocuments({ recurrenceId: rule.id })).toBe(1);

    // Force the exact same occurrence to be attempted again.
    await RecurringExpense.updateOne({ _id: rule.id }, { nextDueDate: new Date('2026-01-31T00:00:00.000Z') });
    const rerun = await recurringService.runDueOccurrences(now, { groupId: String(group._id) });
    expect(rerun.generated).toBe(0);
    expect(await Expense.countDocuments({ recurrenceId: rule.id })).toBe(1);

    const expense = await Expense.findOne({ recurrenceId: rule.id }).lean();
    expect(expense.isDeleted).toBe(false);
    expect(expense.occurrenceKey).toContain('|2026-01-31');
  });

  test('each generated expense writes an ExpenseAuditLog and a non-payment reminder', async () => {
    const alice = await makeUser('Alice', 'alice-rec5@example.com');
    const bob = await makeUser('Bob', 'bob-rec5@example.com');
    const group = await makeGroup(alice, [bob]);
    const rule = await createRuleViaHttp(alice, group, { startDate: '2026-01-31' });

    await recurringService.runDueOccurrences(new Date('2026-02-01T00:00:00.000Z'), { groupId: String(group._id) });

    const expense = await Expense.findOne({ recurrenceId: rule.id }).lean();
    const audit = await ExpenseAuditLog.findOne({ expenseId: expense._id }).lean();
    expect(audit).not.toBeNull();
    expect(audit.action).toBe('created');

    const reminder = await Notification.findOne({ type: 'recurring_due' }).lean();
    expect(reminder).not.toBeNull();
    expect(reminder.body.toLowerCase()).toMatch(/not a payment|never/);

    // A recurring run must never open a settlement or initiate a payment.
    const Settlement = require('../../src/models/Settlement');
    expect(await Settlement.countDocuments({})).toBe(0);
  });
});

describe('month-end clamping', () => {
  test('a rule anchored on the 31st bills on the 28th in a short February', async () => {
    const jan31 = new Date('2026-01-31T00:00:00.000Z');
    const next = recurringService.advanceDueDate(
      { frequency: 'monthly', interval: 1, startDate: jan31 },
      jan31,
    );
    expect(next.toISOString().slice(0, 10)).toBe('2026-02-28');

    // ...and returns to the 31st once March (a 31-day month) arrives.
    const feb28 = new Date('2026-02-28T00:00:00.000Z');
    const march = recurringService.advanceDueDate({ frequency: 'monthly', interval: 1, startDate: jan31 }, feb28);
    expect(march.toISOString().slice(0, 10)).toBe('2026-03-31');
  });

  test('daily and weekly steps advance by interval days', async () => {
    const start = new Date('2026-03-01T00:00:00.000Z');
    const daily = recurringService.advanceDueDate({ frequency: 'daily', interval: 3, startDate: start }, start);
    expect(daily.toISOString().slice(0, 10)).toBe('2026-03-04');
    const weekly = recurringService.advanceDueDate({ frequency: 'weekly', interval: 2, startDate: start }, start);
    expect(weekly.toISOString().slice(0, 10)).toBe('2026-03-15');
  });
});

describe('pause, resume and exhaust', () => {
  test('resuming does not retroactively bill the pause window', async () => {
    const alice = await makeUser('Alice', 'alice-rec6@example.com');
    const group = await makeGroup(alice, []);
    const rule = await createRuleViaHttp(alice, group, { startDate: '2026-01-01' });

    // Pause, then resume well past several missed monthly dates.
    await request(app).post(`/api/v1/recurring/${rule.id}/pause`).set(bearer(alice));
    const resumed = await request(app)
      .post(`/api/v1/recurring/${rule.id}/resume`)
      .set(bearer(alice));
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.recurrence.isActive).toBe(true);
    // Skipped dates are reported, not charged.
    expect(resumed.body.data.skippedOccurrences.length).toBeGreaterThan(0);
    expect(await Expense.countDocuments({ recurrenceId: rule.id })).toBe(0);
  });

  test('maxOccurrences exhausts the rule after the cap', async () => {
    const alice = await makeUser('Alice', 'alice-rec7@example.com');
    const group = await makeGroup(alice, []);
    const rule = await createRuleViaHttp(alice, group, { startDate: '2026-01-01', maxOccurrences: 2 });

    await recurringService.runDueOccurrences(new Date('2026-12-31T00:00:00.000Z'), { groupId: String(group._id) });
    const fresh = await RecurringExpense.findById(rule.id).lean();
    expect(fresh.isActive).toBe(false);
    expect(fresh.occurrenceCount).toBe(2);
    expect(await Expense.countDocuments({ recurrenceId: rule.id, isDeleted: false })).toBe(2);
  });
});
