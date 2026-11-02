'use strict';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/settlementtest';
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
const { computeGroupBalances } = require('../../src/services/balanceService');

let mongod;

async function makeUser(name, email) {
  return User.create({
    name: name.length >= 2 ? name : `${name}x`,
    email,
    password: 'Passw0rd123',
    preferredCurrency: 'INR',
  });
}

async function makeGroup(createdBy, memberUsers = []) {
  const members = [
    { userId: createdBy._id, role: 'admin', status: 'active' },
    ...memberUsers.map((user) => ({ userId: user._id, role: 'member', status: 'active' })),
  ];
  return Group.create({ name: 'Test Group', baseCurrency: 'INR', createdBy: createdBy._id, members });
}

async function makeExpense(group, { paidBy, shares, totalMinor, splitType = 'exact' }) {
  const participants = Object.entries(shares).map(([userId, shareMinor]) => ({ userId, shareMinor }));
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
  await Promise.all([User, Group, Expense, Settlement].map((model) => model.deleteMany({})));
});

// A -> B 500, A -> C 500, B -> C 500: three IOUs that collapse to a single payment.
async function specExampleGroup() {
  const alice = await makeUser('Alice', 'alice@example.com');
  const bob = await makeUser('Bob', 'bob@example.com');
  const charlie = await makeUser('Charlie', 'charlie@example.com');
  const group = await makeGroup(alice, [bob, charlie]);
  await makeExpense(group, { paidBy: bob._id, totalMinor: 100000, shares: { [alice._id]: 50000, [bob._id]: 50000 } });
  await makeExpense(group, {
    paidBy: charlie._id,
    totalMinor: 100000,
    shares: { [alice._id]: 50000, [charlie._id]: 50000 },
  });
  await makeExpense(group, { paidBy: charlie._id, totalMinor: 50000, shares: { [bob._id]: 50000 } });
  return { alice, bob, charlie, group };
}

describe('settlement suggestions', () => {
  test('the spec example collapses three IOUs into one payment', async () => {
    const { alice, charlie, group } = await specExampleGroup();

    const res = await request(app)
      .get(`/api/v1/groups/${group._id}/settlements/suggested?algorithm=minimum`)
      .set(bearer(alice));

    expect(res.status).toBe(200);
    const suggested = res.body.data;
    expect(suggested.algorithm).toBe('minimum');
    expect(suggested.transactionCount).toBe(1);
    expect(suggested.naiveTransactionCount).toBe(3);
    expect(suggested.reductionPercent).toBe(66.67);
    expect(suggested.transactions).toHaveLength(1);
    expect(suggested.transactions[0]).toMatchObject({
      from: { id: String(alice._id) },
      to: { id: String(charlie._id) },
      amountMinor: 100000,
    });
  });

  test('defaults to the exact solver when no algorithm is given', async () => {
    const { alice, group } = await specExampleGroup();
    const res = await request(app).get(`/api/v1/groups/${group._id}/settlements/suggested`).set(bearer(alice));
    expect(res.status).toBe(200);
    expect(res.body.data.algorithm).toBe('minimum');
  });

  test('minimum is never worse than greedy on a crafted two-subset ledger', async () => {
    const w = await makeUser('W', 'w@example.com');
    const x = await makeUser('X', 'x@example.com');
    const y = await makeUser('Y', 'y@example.com');
    const z = await makeUser('Z', 'z@example.com');
    const p = await makeUser('P', 'p@example.com');
    const q = await makeUser('Q', 'q@example.com');
    const group = await makeGroup(w, [x, y, z, p, q]);

    // Two independent zero-sum triangles: w +700/x -400/y -300 and z +600/p -500/q -100.
    await makeExpense(group, {
      paidBy: w._id,
      totalMinor: 700,
      shares: { [x._id]: 400, [y._id]: 300 },
    });
    await makeExpense(group, {
      paidBy: z._id,
      totalMinor: 600,
      shares: { [p._id]: 500, [q._id]: 100 },
    });

    const minRes = await request(app)
      .get(`/api/v1/groups/${group._id}/settlements/suggested?algorithm=minimum`)
      .set(bearer(w));
    const greedyRes = await request(app)
      .get(`/api/v1/groups/${group._id}/settlements/suggested?algorithm=greedy`)
      .set(bearer(w));

    expect(minRes.status).toBe(200);
    expect(greedyRes.status).toBe(200);
    const minimum = minRes.body.data;
    const greedy = greedyRes.body.data;
    expect(greedy.transactionCount).toBe(5);
    expect(minimum.transactionCount).toBe(4);
    expect(minimum.transactionCount).toBeLessThanOrEqual(greedy.transactionCount);
  });
});

describe('recordSettlement', () => {
  async function owedGroup() {
    const a = await makeUser('A', 'a@example.com');
    const b = await makeUser('B', 'b@example.com');
    const group = await makeGroup(a, [b]);
    // b owes a ₹50.00 (5000 minor).
    await makeExpense(group, { paidBy: a._id, totalMinor: 10000, shares: { [a._id]: 5000, [b._id]: 5000 } });
    return { a, b, group };
  }

  test('records an awaiting-confirmation settlement up to the outstanding debt', async () => {
    const { a, b, group } = await owedGroup();
    const res = await request(app)
      .post('/api/v1/settlements')
      .set(bearer(b))
      .send({ groupId: String(group._id), payerId: String(b._id), receiverId: String(a._id), amount: '50.00', paymentMethod: 'upi' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'awaiting_confirmation', amountMinor: 5000, currency: 'INR' });
    expect(res.body.data.canConfirm).toBe(false); // b is the payer, not the receiver
    // Awaiting (unconfirmed) settlements must not have moved the ledger yet.
    const balances = await computeGroupBalances(group._id);
    expect(balances.members.find((row) => row.user.id === String(b._id)).netMinor).toBe(-5000);
  });

  test('rejects an over-payment with the allowed maximum', async () => {
    const { a, b, group } = await owedGroup();
    const res = await request(app)
      .post('/api/v1/settlements')
      .set(bearer(b))
      .send({ groupId: String(group._id), payerId: String(b._id), receiverId: String(a._id), amount: '60.00' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.allowedMaxMinor).toBe(5000);
  });

  test('rejects a self-payment', async () => {
    const { a, group } = await owedGroup();
    const res = await request(app)
      .post('/api/v1/settlements')
      .set(bearer(a))
      .send({ groupId: String(group._id), payerId: String(a._id), receiverId: String(a._id), amount: '10.00' });
    expect(res.status).toBe(422);
  });

  test('rejects a non-member payer/receiver', async () => {
    const { a, group } = await owedGroup();
    const outsider = await makeUser('Outsider', 'out@example.com');
    const res = await request(app)
      .post('/api/v1/settlements')
      .set(bearer(a))
      .send({ groupId: String(group._id), payerId: String(a._id), receiverId: String(outsider._id), amount: '10.00' });
    expect(res.status).toBe(403);
  });

  test('returns the original settlement for a replayed idempotency key', async () => {
    const { a, b, group } = await owedGroup();
    const body = {
      groupId: String(group._id),
      payerId: String(b._id),
      receiverId: String(a._id),
      amount: '40.00',
      idempotencyKey: 'idem-1',
    };
    const first = await request(app).post('/api/v1/settlements').set(bearer(b)).send(body);
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/v1/settlements').set(bearer(b)).send(body);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    const count = await Settlement.countDocuments({ idempotencyKey: 'idem-1' });
    expect(count).toBe(1);
  });

  test('honours the X-Idempotency-Key header', async () => {
    const { a, b, group } = await owedGroup();
    const body = { groupId: String(group._id), payerId: String(b._id), receiverId: String(a._id), amount: '30.00' };
    const first = await request(app).post('/api/v1/settlements').set({ ...bearer(b), 'X-Idempotency-Key': 'hdr-1' }).send(body);
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/v1/settlements').set({ ...bearer(b), 'X-Idempotency-Key': 'hdr-1' }).send(body);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
  });
});

describe('settlement lifecycle', () => {
  async function awaitingSettlement() {
    const a = await makeUser('A', 'a5@example.com');
    const b = await makeUser('B', 'b5@example.com');
    const group = await makeGroup(a, [b]);
    await makeExpense(group, { paidBy: a._id, totalMinor: 10000, shares: { [a._id]: 5000, [b._id]: 5000 } });
    const res = await request(app)
      .post('/api/v1/settlements')
      .set(bearer(b))
      .send({ groupId: String(group._id), payerId: String(b._id), receiverId: String(a._id), amount: '50.00' });
    return { a, b, group, id: res.body.data.id };
  }

  test('only the receiver can confirm, and it settles the ledger', async () => {
    const { a, b, group, id } = await awaitingSettlement();

    const notReceiver = await request(app).post(`/api/v1/settlements/${id}/confirm`).set(bearer(b));
    expect(notReceiver.status).toBe(403);

    const confirmed = await request(app).post(`/api/v1/settlements/${id}/confirm`).set(bearer(a));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('completed');
    expect(confirmed.body.data.confirmedBy.id).toBe(String(a._id));

    const balances = await computeGroupBalances(group._id);
    expect(balances.isSettledUp).toBe(true);
  });

  test('confirming twice is a conflict', async () => {
    const { a, id } = await awaitingSettlement();
    const first = await request(app).post(`/api/v1/settlements/${id}/confirm`).set(bearer(a));
    expect(first.status).toBe(200);
    const again = await request(app).post(`/api/v1/settlements/${id}/confirm`).set(bearer(a));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CONFLICT');
  });

  test('reject requires a reason and is receiver-only', async () => {
    const { a, b, id } = await awaitingSettlement();
    const noReason = await request(app).post(`/api/v1/settlements/${id}/reject`).set(bearer(a)).send({});
    expect(noReason.status).toBe(422);
    const byPayer = await request(app).post(`/api/v1/settlements/${id}/reject`).set(bearer(b)).send({ reason: 'nope' });
    expect(byPayer.status).toBe(403);
    const rejected = await request(app).post(`/api/v1/settlements/${id}/reject`).set(bearer(a)).send({ reason: 'amount wrong' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('rejected');
    expect(rejected.body.data.rejectedReason).toBe('amount wrong');
  });

  test('either party can dispute an unconfirmed settlement', async () => {
    const { b, id } = await awaitingSettlement();
    const disputed = await request(app).post(`/api/v1/settlements/${id}/dispute`).set(bearer(b)).send({ reason: 'I already paid' });
    expect(disputed.status).toBe(200);
    expect(disputed.body.data.status).toBe('disputed');
  });

  test('the initiator can cancel only while unconfirmed', async () => {
    const { b, id } = await awaitingSettlement();
    const cancelled = await request(app).post(`/api/v1/settlements/${id}/cancel`).set(bearer(b));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('cancelled');
    const again = await request(app).post(`/api/v1/settlements/${id}/cancel`).set(bearer(b));
    expect(again.status).toBe(409);
  });

  test('a non-initiator cannot cancel', async () => {
    const { a, id } = await awaitingSettlement();
    const res = await request(app).post(`/api/v1/settlements/${id}/cancel`).set(bearer(a));
    expect(res.status).toBe(403);
  });
});

describe('listing, history and my summary', () => {
  test('GET /groups/:id/settlements lists them and GET /settlements covers both directions', async () => {
    const a = await makeUser('A', 'a6@example.com');
    const b = await makeUser('B', 'b6@example.com');
    const group = await makeGroup(a, [b]);
    await makeExpense(group, { paidBy: a._id, totalMinor: 10000, shares: { [a._id]: 5000, [b._id]: 5000 } });
    const created = await request(app)
      .post('/api/v1/settlements')
      .set(bearer(b))
      .send({ groupId: String(group._id), payerId: String(b._id), receiverId: String(a._id), amount: '50.00' });
    const id = created.body.data.id;

    const listRes = await request(app).get(`/api/v1/groups/${group._id}/settlements`).set(bearer(a));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].canConfirm).toBe(true); // a is the receiver awaiting

    const mine = await request(app).get('/api/v1/settlements?direction=to_me').set(bearer(a));
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((row) => row.id)).toContain(id);

    await request(app).post(`/api/v1/settlements/${id}/confirm`).set(bearer(a));

    const historyRes = await request(app).get('/api/v1/settlements/history').set(bearer(a));
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data[0].settlements[0].id).toBe(id);
  });

  test('GET /me/summary aggregates across groups and checks each invariant', async () => {
    const a = await makeUser('A', 'a7@example.com');
    const b = await makeUser('B', 'b7@example.com');
    const c = await makeUser('C', 'c7@example.com');

    const g1 = await makeGroup(a, [b]);
    await makeExpense(g1, { paidBy: a._id, totalMinor: 10000, shares: { [a._id]: 5000, [b._id]: 5000 } });

    const g2 = await makeGroup(a, [c]);
    await makeExpense(g2, { paidBy: c._id, totalMinor: 4000, shares: { [a._id]: 2000, [c._id]: 2000 } });

    const res = await request(app).get('/api/v1/me/summary').set(bearer(a));
    expect(res.status).toBe(200);
    const summary = res.body.data;
    expect(summary.groupCount).toBe(2);
    expect(summary.totalOwedToMeMinor).toBe(5000);
    expect(summary.totalOwedMinor).toBe(2000);
    expect(summary.netMinor).toBe(3000);
    expect(summary.pendingSettlements).toBe(0);
    expect(summary.currency).toBe('INR');
  });
});
