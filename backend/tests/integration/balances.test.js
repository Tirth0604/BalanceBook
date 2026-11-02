'use strict';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/balancetest';
process.env.USE_TRANSACTIONS = 'true';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app');
const { connectDatabase, disconnectDatabase } = require('../../src/config/db');
const { signAccessToken } = require('../../src/middleware/authMiddleware');
const User = require('../../src/models/User');
const Group = require('../../src/models/Group');
const Expense = require('../../src/models/Expense');
const Settlement = require('../../src/models/Settlement');
const { computeGroupBalances, assertGroupInvariant } = require('../../src/services/balanceService');

let mongod;

async function makeUser(name, email) {
  const user = await User.create({
    name: name.length >= 2 ? name : `${name}x`,
    email,
    password: 'Passw0rd123',
    preferredCurrency: 'INR',
  });
  return user;
}

async function makeGroup(createdBy, memberUsers = []) {
  const members = [
    { userId: createdBy._id, role: 'admin', status: 'active' },
    ...memberUsers.map((user) => ({ userId: user._id, role: 'member', status: 'active' })),
  ];
  return Group.create({ name: 'Test Group', baseCurrency: 'INR', createdBy: createdBy._id, members });
}

// `shares` maps userId -> shareMinor; the payer is whoever we pass in `paidBy`.
async function makeExpense(group, { paidBy, shares, totalMinor, splitType = 'exact' }) {
  const participants = Object.entries(shares).map(([key, shareMinor]) => ({ userId: key, shareMinor }));
  return Expense.create({
    groupId: group._id,
    title: 'expense',
    totalMinor,
    currency: 'INR',
    groupAmountMinor: totalMinor,
    paidBy,
    splitType,
    participants,
    createdBy: paidBy,
    expenseDate: new Date('2026-11-01'),
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
    [User, Group, Expense, Settlement].map((model) => model.deleteMany({})),
  );
});

describe('balance computation', () => {
  test('Σ balances = 0 and the totals are internally consistent', async () => {
    const alice = await makeUser('Alice', 'alice@example.com');
    const bob = await makeUser('Bob', 'bob@example.com');
    const charlie = await makeUser('Charlie', 'charlie@example.com');
    const group = await makeGroup(alice, [bob, charlie]);
    await makeExpense(group, {
      paidBy: alice._id,
      totalMinor: 300000,
      shares: { [alice._id]: 100000, [bob._id]: 100000, [charlie._id]: 100000 },
    });

    const res = await request(app)
      .get(`/api/v1/groups/${group._id}/balances`)
      .set(bearer(alice));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const members = res.body.data;
    expect(members).toHaveLength(3);
    const sum = members.reduce((total, row) => total + row.netMinor, 0);
    expect(sum).toBe(0);
    expect(res.body.meta.groupTotalMinor).toBe(300000);
    expect(res.body.meta.isSettledUp).toBe(false);

    const aliceRow = members.find((row) => row.user.id === String(alice._id));
    expect(aliceRow).toMatchObject({ netMinor: 200000, net: '2000.00', status: 'creditor', isMe: true });
    expect(aliceRow.owedToMeMinor).toBe(200000);
    expect(aliceRow.iOweMinor).toBe(0);
  });

  test('a fully settled group reports isSettledUp true', async () => {
    const a = await makeUser('A', 'a@example.com');
    const b = await makeUser('B', 'b@example.com');
    const group = await makeGroup(a, [b]);
    await makeExpense(group, { paidBy: a._id, totalMinor: 100000, shares: { [a._id]: 50000, [b._id]: 50000 } });
    await Settlement.create({
      groupId: group._id,
      payerId: b._id,
      receiverId: a._id,
      amountMinor: 50000,
      currency: 'INR',
      status: 'completed',
      initiatedBy: b._id,
      confirmedBy: a._id,
      confirmedAt: new Date(),
    });

    const result = await computeGroupBalances(group._id, { viewerId: a._id });
    expect(result.isSettledUp).toBe(true);
    expect(result.members.every((row) => row.netMinor === 0)).toBe(true);
  });

  test('deleting an expense restores the pre-expense balance', async () => {
    const a = await makeUser('A', 'a2@example.com');
    const b = await makeUser('B', 'b2@example.com');
    const group = await makeGroup(a, [b]);
    const expense = await makeExpense(group, {
      paidBy: a._id,
      totalMinor: 100000,
      shares: { [a._id]: 50000, [b._id]: 50000 },
    });

    const before = await computeGroupBalances(group._id);
    expect(before.members.find((row) => row.user.id === String(b._id)).netMinor).toBe(-50000);

    // The expenses module soft-deletes; balances are always derived so they must rebuild.
    await Expense.updateOne({ _id: expense._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

    const after = await computeGroupBalances(group._id);
    expect(after.members.every((row) => row.netMinor === 0)).toBe(true);
    expect(after.isSettledUp).toBe(true);
  });

  test('a non-member cannot read the group balances', async () => {
    const a = await makeUser('A', 'a3@example.com');
    const outsider = await makeUser('Outsider', 'out@example.com');
    const group = await makeGroup(a);
    const res = await request(app).get(`/api/v1/groups/${group._id}/balances`).set(bearer(outsider));
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

describe('assertGroupInvariant', () => {
  test('throws FINANCIAL_INVARIANT_VIOLATION when the ledger does not net to zero', () => {
    expect(() =>
      assertGroupInvariant('group-1', [
        { userId: 'a', netMinor: 500 },
        { userId: 'b', netMinor: -300 },
      ]),
    ).toThrow(
      expect.objectContaining({ statusCode: 500, code: 'FINANCIAL_INVARIANT_VIOLATION' }),
    );
    expect(() =>
      assertGroupInvariant('group-1', [
        { userId: 'a', netMinor: 500 },
        { userId: 'b', netMinor: -500 },
      ]),
    ).not.toThrow();
  });

  test('a corrupted share sum (validateBeforeSave off) surfaces as an error', async () => {
    const a = await makeUser('A', 'a4@example.com');
    const b = await makeUser('B', 'b4@example.com');
    const group = await makeGroup(a, [b]);

    // Deliberately inconsistent shares: this bypasses the model's sum guard to plant a bug.
    await Expense.create(
      [
        {
          groupId: group._id,
          title: 'corrupt',
          totalMinor: 100000,
          currency: 'INR',
          groupAmountMinor: 100000,
          paidBy: a._id,
          splitType: 'exact',
          participants: [
            { userId: a._id, shareMinor: 60000 },
            { userId: b._id, shareMinor: 30000 },
          ],
          createdBy: a._id,
        },
      ],
      { validateBeforeSave: false },
    );

    await expect(computeGroupBalances(group._id)).rejects.toThrow(/sum to its total|not.*zero|sum/i);

    const res = await request(app).get(`/api/v1/groups/${group._id}/balances`).set(bearer(a));
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});
