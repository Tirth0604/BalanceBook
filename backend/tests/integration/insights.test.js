'use strict';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/insightstest';
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
const Notification = require('../../src/models/Notification');
const RecurringExpense = require('../../src/models/RecurringExpense');
const Budget = require('../../src/models/Budget');

let mongod;

async function makeUser(name, email, preferredCurrency = 'INR') {
  return User.create({ name, email, password: 'Passw0rd123', preferredCurrency });
}

async function makeGroup(createdBy, memberUsers = [], name = 'Test Group', baseCurrency = 'INR') {
  const members = [
    { userId: createdBy._id, role: 'admin', status: 'active' },
    ...memberUsers.map((user) => ({ userId: user._id, role: 'member', status: 'active' })),
  ];
  return Group.create({ name, baseCurrency, createdBy: createdBy._id, members });
}

async function makeExpense(group, { paidBy, shares, totalMinor, category = 'others', expenseDate = '2026-11-01', title = 'expense' }) {
  const participants = Object.entries(shares).map(([userId, shareMinor]) => ({ userId, shareMinor }));
  return Expense.create({
    groupId: group._id,
    title,
    category,
    totalMinor,
    currency: group.baseCurrency,
    groupAmountMinor: totalMinor,
    paidBy,
    splitType: 'exact',
    participants,
    createdBy: paidBy,
    expenseDate: new Date(expenseDate),
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
    [User, Group, Expense, Settlement, Notification, RecurringExpense, Budget].map((m) => m.deleteMany({})),
  );
});

/** Two INR groups with a known ledger: ada paid 90000 and consumed 60000 of a 150000 total. */
async function seededAccount() {
  const ada = await makeUser('Ada', 'ada-ins@example.com');
  const bo = await makeUser('Bo', 'bo-ins@example.com');
  const flat = await makeGroup(ada, [bo], 'Flat', 'INR');
  const trip = await makeGroup(ada, [bo], 'Trip', 'INR');
  await makeExpense(flat, {
    paidBy: ada._id,
    totalMinor: 60000,
    category: 'food',
    expenseDate: '2026-11-02',
    shares: { [ada._id]: 30000, [bo._id]: 30000 },
  });
  await makeExpense(flat, {
    paidBy: bo._id,
    totalMinor: 40000,
    category: 'travel',
    expenseDate: '2026-11-03',
    shares: { [ada._id]: 20000, [bo._id]: 20000 },
  });
  await makeExpense(trip, {
    paidBy: ada._id,
    totalMinor: 50000,
    category: 'accommodation',
    expenseDate: '2026-11-04',
    shares: { [ada._id]: 10000, [bo._id]: 40000 },
  });
  return { ada, bo, flat, trip };
}

function minorFieldsOf(insight) {
  return Object.entries(insight.metric ?? {}).filter(([key]) => key.endsWith('Minor'));
}

describe('GET /insights — personal (cross-group) scope', () => {
  test('401 without a token: the scope is the caller, so there is nothing to read anonymously', async () => {
    const res = await request(app).get('/api/v1/insights');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('a signed-in user gets their own scope and cards that cite their own numbers', async () => {
    const { ada } = await seededAccount();
    const res = await request(app).get('/api/v1/insights').set(bearer(ada));
    expect(res.status).toBe(200);

    const data = res.body.data;
    expect(data.scope).toMatchObject({ groupId: null, groupName: null, mode: 'me', groupCount: 2, currency: 'INR' });
    expect(data.currencies ?? data.scope.currencies).toEqual(['INR']);
    expect(Array.isArray(data.insights)).toBe(true);
    expect(data.count).toBe(data.insights.length);

    // ada paid 60000 + 50000 and consumed 30000 + 20000 + 10000 across both groups.
    expect(data.evidence.paidMinor).toBe(110000);
    expect(data.evidence.consumedMinor).toBe(60000);
    expect(data.evidence.netMinor).toBe(50000);

    const contribution = data.insights.find((row) => row.type === 'contribution_share');
    expect(contribution).toBeTruthy();
    // The chip contract: every field the card prints is a server-supplied integer minor unit
    // (or percentage), so nothing has to be derived in the browser.
    expect(contribution.metric.paidMinor).toBe(data.evidence.paidMinor);
    expect(contribution.metric.consumedMinor).toBe(data.evidence.consumedMinor);
    expect(contribution.metric.netMinor).toBe(data.evidence.netMinor);
    expect(Number.isSafeInteger(contribution.metric.paidMinor)).toBe(true);
    expect(typeof contribution.metric.fundedPercent).toBe('number');
    expect(contribution.metric.fundedPercent).toBeGreaterThan(0);
    expect(contribution.body).toContain('₹');

    for (const insight of data.insights) {
      expect(['info', 'positive', 'warning']).toContain(insight.severity);
      for (const [key, value] of minorFieldsOf(insight)) {
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  test('group_leader cites a group the caller actually belongs to — no membership bypass', async () => {
    const { ada, bo } = await seededAccount();
    const outsider = await makeUser('Outsider', 'out-ins@example.com');
    const own = await makeGroup(outsider, [], 'Own Ledger', 'INR');
    await makeExpense(own, {
      paidBy: outsider._id,
      totalMinor: 500000,
      category: 'food',
      expenseDate: '2026-11-02',
      shares: { [outsider._id]: 500000 },
    });

    const res = await request(app).get('/api/v1/insights').set(bearer(outsider));
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.scope.groupCount).toBe(1);
    expect(data.scope.groupName).toBeNull();
    // Only outsider's own ledger is inside this payload: the evidence lists exactly his members.
    expect(data.evidence.paidMinor).toBe(500000);
    expect(data.evidence.members.map((row) => row.userId).sort()).toEqual([String(outsider._id)]);
    expect(data.evidence.categories.every((row) => row.totalMinor <= 500000)).toBe(true);

    // With two groups of their own the leader rule can fire, and it must stay inside the scope.
    const second = await makeGroup(outsider, [], 'Own Ledger 2', 'INR');
    await makeExpense(second, {
      paidBy: outsider._id,
      totalMinor: 120000,
      category: 'travel',
      expenseDate: '2026-11-03',
      shares: { [outsider._id]: 120000 },
    });
    const leaderRes = await request(app).get('/api/v1/insights').set(bearer(outsider));
    const leaderData = leaderRes.body.data;
    expect(leaderData.scope.groupCount).toBe(2);
    const leader = leaderData.insights.find((row) => row.type === 'group_leader');
    expect(leader).toBeTruthy();
    expect([String(own._id), String(second._id)]).toContain(leader.metric.groupId);
    expect(leader.metric.spentMinor).toBe(500000);
    expect(leader.metric.totalMinor).toBe(620000);

    // The mirror image: ada reaches only her own two groups and their members.
    const adaRes = await request(app).get('/api/v1/insights').set(bearer(ada));
    const adaData = adaRes.body.data;
    expect(adaData.scope.groupCount).toBe(2);
    expect(adaData.scope.groupName).toBeNull();
    expect(adaData.evidence.paidMinor).toBe(110000);
    expect(adaData.evidence.members.map((row) => row.userId).sort()).toEqual(
      [String(ada._id), String(bo._id)].sort(),
    );
    const adaLeader = adaData.insights.find((row) => row.type === 'group_leader');
    expect(adaLeader).toBeTruthy();
    expect(adaLeader.metric.groupId).not.toBe(String(own._id));
    expect(adaLeader.metric.totalMinor).toBe(150000);
  });

  test('an account with no ledger history answers 200 with no cards, not invented zeroes', async () => {
    const lone = await makeUser('Lone', 'lone-ins@example.com');
    await makeGroup(lone, [], 'Empty Ledger', 'INR');
    const res = await request(app).get('/api/v1/insights').set(bearer(lone));
    expect(res.status).toBe(200);
    expect(res.body.data.insights).toEqual([]);
    expect(res.body.data.count).toBe(0);
    expect(res.body.data.scope.groupCount).toBe(1);
    expect(res.body.data.scope.currency).toBe('INR');
    expect(res.body.data.evidence.spentMinor).toBe(0);
    expect(res.body.data.previousSpentMinor ?? res.body.data.evidence.previousSpentMinor).toBeNull();
  });

  test('window filters are honoured and repeated calls are deterministic', async () => {
    const { ada } = await seededAccount();

    const windowed = await request(app).get('/api/v1/insights?from=2026-11-03&to=2026-11-04').set(bearer(ada));
    expect(windowed.status).toBe(200);
    expect(windowed.body.data.window.preset).toBe('custom');
    expect(windowed.body.data.window.from).toBe('2026-11-03T00:00:00.000Z');
    // Only the two expenses inside the window are cited: 40000 (travel) + 50000 (accommodation).
    expect(windowed.body.data.evidence.spentMinor).toBe(90000);

    const first = await request(app).get('/api/v1/insights').set(bearer(ada));
    const second = await request(app).get('/api/v1/insights').set(bearer(ada));
    expect(second.body.data.insights.map((row) => row.id)).toEqual(first.body.data.insights.map((row) => row.id));
    expect(second.body.data.evidence).toEqual(first.body.data.evidence);
  });

  test('the scope currency is reported at scope.currency, so a USD group prints $ not ₹', async () => {
    const usd = await makeUser('Sam', 'sam-usd@example.com', 'USD');
    const pal = await makeUser('Priya', 'priya-usd@example.com');
    const squad = await makeGroup(usd, [pal], 'Squad Lunches', 'USD');
    await makeExpense(squad, {
      paidBy: pal._id,
      totalMinor: 40372,
      category: 'food',
      expenseDate: '2026-11-02',
      shares: { [usd._id]: 3032, [pal._id]: 37340 },
    });

    // Group route: the unit lives on the scope, not on the payload root.
    const groupRes = await request(app).get(`/api/v1/groups/${squad._id}/insights`).set(bearer(usd));
    expect(groupRes.status).toBe(200);
    expect(groupRes.body.data.currency).toBeUndefined();
    expect(groupRes.body.data.scope.currency).toBe('USD');
    const groupContribution = groupRes.body.data.insights.find((row) => row.type === 'contribution_share');
    expect(groupContribution.metric.consumedMinor).toBe(3032);
    expect(groupContribution.body).toContain('$');
    expect(groupContribution.body).not.toContain('₹');

    // Personal route reports the same unit for a single-currency account.
    const meRes = await request(app).get('/api/v1/insights').set(bearer(usd));
    expect(meRes.body.data.scope.currency).toBe('USD');
    expect(meRes.body.data.scope.currencies).toEqual(['USD']);
  });
});
