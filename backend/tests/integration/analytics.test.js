'use strict';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/analicstest';
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
const balanceService = require('../../src/services/balanceService');
const analyticsService = require('../../src/services/analyticsService');

let mongod;

async function makeUser(name, email) {
  return User.create({ name, email, password: 'Passw0rd123', preferredCurrency: 'INR' });
}

async function makeGroup(createdBy, memberUsers = [], name = 'Test Group') {
  const members = [
    { userId: createdBy._id, role: 'admin', status: 'active' },
    ...memberUsers.map((user) => ({ userId: user._id, role: 'member', status: 'active' })),
  ];
  return Group.create({ name, baseCurrency: 'INR', createdBy: createdBy._id, members });
}

async function makeExpense(group, { paidBy, shares, totalMinor, category = 'others', expenseDate = '2026-11-01', title = 'expense' }) {
  const participants = Object.entries(shares).map(([userId, shareMinor]) => ({ userId, shareMinor }));
  return Expense.create({
    groupId: group._id,
    title,
    category,
    totalMinor,
    currency: 'INR',
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

async function spentByGroup(groupId) {
  const rows = await Expense.find({ groupId, isDeleted: false }).lean();
  return rows.reduce((sum, expense) => sum + expense.groupAmountMinor, 0);
}

describe('category totals', () => {
  test('category totals equal the sum of the ledger expenses', async () => {
    const alice = await makeUser('Alice', 'alice-an@example.com');
    const bob = await makeUser('Bob', 'bob-an@example.com');
    const group = await makeGroup(alice, [bob]);

    await makeExpense(group, { paidBy: alice._id, totalMinor: 30000, category: 'food', shares: { [alice._id]: 15000, [bob._id]: 15000 } });
    await makeExpense(group, { paidBy: bob._id, totalMinor: 20000, category: 'food', shares: { [alice._id]: 10000, [bob._id]: 10000 } });
    await makeExpense(group, { paidBy: alice._id, totalMinor: 50000, category: 'travel', shares: { [alice._id]: 25000, [bob._id]: 25000 } });

    const res = await request(app).get(`/api/v1/analytics/categories?groupId=${group._id}`).set(bearer(alice));
    expect(res.status).toBe(200);
    const { categories, totalMinor } = res.body.data;

    const food = categories.find((row) => row.category === 'food');
    const travel = categories.find((row) => row.category === 'travel');
    expect(food.totalMinor).toBe(50000);
    expect(travel.totalMinor).toBe(50000);
    expect(totalMinor).toBe(100000);
    // The reported category sum must equal the raw ledger total.
    const rawTotal = await spentByGroup(group._id);
    expect(totalMinor).toBe(rawTotal);
    const categorySum = categories.reduce((sum, row) => sum + row.totalMinor, 0);
    expect(categorySum).toBe(rawTotal);
  });

  test('a soft-deleted expense disappears from every aggregate', async () => {
    const alice = await makeUser('Alice', 'alice-an2@example.com');
    const bob = await makeUser('Bob', 'bob-an2@example.com');
    const group = await makeGroup(alice, [bob]);
    const doomed = await makeExpense(group, {
      paidBy: alice._id,
      totalMinor: 99999,
      category: 'shopping',
      shares: { [alice._id]: 50000, [bob._id]: 49999 },
    });
    await makeExpense(group, { paidBy: alice._id, totalMinor: 10000, category: 'food', shares: { [alice._id]: 5000, [bob._id]: 5000 } });

    await Expense.updateOne({ _id: doomed._id }, { isDeleted: true });
    const res = await request(app).get(`/api/v1/analytics/categories?groupId=${group._id}`).set(bearer(alice));
    expect(res.body.data.totalMinor).toBe(10000);
    expect(res.body.data.categories.some((row) => row.category === 'shopping')).toBe(false);
  });
});

describe('monthly series', () => {
  test('the monthly series sums to the period total', async () => {
    const alice = await makeUser('Alice', 'alice-an3@example.com');
    const bob = await makeUser('Bob', 'bob-an3@example.com');
    const group = await makeGroup(alice, [bob]);

    await makeExpense(group, { paidBy: alice._id, totalMinor: 10000, expenseDate: '2026-01-05', shares: { [alice._id]: 5000, [bob._id]: 5000 } });
    await makeExpense(group, { paidBy: alice._id, totalMinor: 20000, expenseDate: '2026-01-20', shares: { [alice._id]: 10000, [bob._id]: 10000 } });
    await makeExpense(group, { paidBy: bob._id, totalMinor: 30000, expenseDate: '2026-02-10', shares: { [alice._id]: 15000, [bob._id]: 15000 } });

    const trend = await request(app)
      .get(`/api/v1/analytics/trend?groupId=${group._id}&granularity=month`)
      .set(bearer(alice));
    expect(trend.status).toBe(200);
    const points = trend.body.data.points;
    const jan = points.find((row) => row.period === '2026-01');
    const feb = points.find((row) => row.period === '2026-02');
    expect(jan.totalMinor).toBe(30000);
    expect(feb.totalMinor).toBe(30000);
    const seriesSum = points.reduce((sum, row) => sum + row.totalMinor, 0);
    const rawTotal = await spentByGroup(group._id);
    expect(seriesSum).toBe(rawTotal);

    // The overview monthly series is a (truncated) view of the same numbers.
    const overview = await request(app).get(`/api/v1/analytics/overview?groupId=${group._id}`).set(bearer(alice));
    expect(overview.body.data.totals.spentMinor).toBe(rawTotal);
  });

  test('yearly granularity folds months into calendar years', async () => {
    const alice = await makeUser('Alice', 'alice-an4@example.com');
    const bob = await makeUser('Bob', 'bob-an4@example.com');
    const group = await makeGroup(alice, [bob]);
    await makeExpense(group, { paidBy: alice._id, totalMinor: 10000, expenseDate: '2025-06-01', shares: { [alice._id]: 5000, [bob._id]: 5000 } });
    await makeExpense(group, { paidBy: alice._id, totalMinor: 25000, expenseDate: '2026-03-01', shares: { [alice._id]: 12500, [bob._id]: 12500 } });

    const res = await request(app).get(`/api/v1/analytics/trend?groupId=${group._id}&granularity=year`).set(bearer(alice));
    expect(res.status).toBe(200);
    const byYear = Object.fromEntries(res.body.data.points.map((row) => [row.period, row.totalMinor]));
    expect(byYear['2025']).toBe(10000);
    expect(byYear['2026']).toBe(25000);
  });
});

describe('cross-group dashboard rollup reconciles with balanceService', () => {
  test('owed / receivable / net match the derived per-group balances', async () => {
    const alice = await makeUser('Alice', 'alice-an5@example.com');
    const bob = await makeUser('Bob', 'bob-an5@example.com');
    const carol = await makeUser('Carol', 'carol-an5@example.com');

    const g1 = await makeGroup(alice, [bob], 'Trip');
    // alice fronts 100, consumes 50 -> net +50 (alice is owed 5000).
    await makeExpense(g1, { paidBy: alice._id, totalMinor: 10000, shares: { [alice._id]: 5000, [bob._id]: 5000 } });

    const g2 = await makeGroup(alice, [carol], 'Home');
    // carol pays 4000; alice consumes 2000 and paid 0 -> alice net -2000 (alice owes 2000).
    await makeExpense(g2, { paidBy: carol._id, totalMinor: 4000, shares: { [alice._id]: 2000, [carol._id]: 2000 } });

    // Independent truth from balanceService, aggregated across both groups.
    let expectedOwedToMe = 0;
    let expectedOwed = 0;
    let expectedNet = 0;
    for (const group of [g1, g2]) {
      const balances = await balanceService.computeGroupBalances(group._id, { viewerId: alice._id });
      const row = balances.members.find((member) => member.user.id === String(alice._id));
      if (row.netMinor > 0) expectedOwedToMe += row.netMinor;
      else if (row.netMinor < 0) expectedOwed += -row.netMinor;
      expectedNet += row.netMinor;
    }

    const res = await request(app).get('/api/v1/analytics/dashboard').set(bearer(alice));
    expect(res.status).toBe(200);
    const rollup = res.body.data;
    expect(rollup.activeGroups).toBe(2);
    expect(rollup.totalOwedToMeMinor).toBe(expectedOwedToMe);
    expect(rollup.totalOwedMinor).toBe(expectedOwed);
    expect(rollup.netMinor).toBe(expectedNet);
    expect(rollup.totalOwedToMeMinor).toBe(5000);
    expect(rollup.totalOwedMinor).toBe(2000);
    expect(rollup.netMinor).toBe(3000);
  });

  test('overview rollup agrees with the direct dashboard rollup', async () => {
    const alice = await makeUser('Alice', 'alice-an6@example.com');
    const bob = await makeUser('Bob', 'bob-an6@example.com');
    const carol = await makeUser('Carol', 'carol-an6@example.com');
    const g1 = await makeGroup(alice, [bob], 'Alpha');
    const g2 = await makeGroup(alice, [carol], 'Beta');
    await makeExpense(g1, { paidBy: alice._id, totalMinor: 10000, shares: { [alice._id]: 5000, [bob._id]: 5000 } });
    await makeExpense(g2, { paidBy: carol._id, totalMinor: 6000, shares: { [alice._id]: 3000, [carol._id]: 3000 } });

    const dashboard = await analyticsService.dashboard({ userId: String(alice._id) });
    const overview = await analyticsService.overview({ userId: String(alice._id), query: {} });
    expect(overview.rollup.totalOwedToMeMinor).toBe(dashboard.totalOwedToMeMinor);
    expect(overview.rollup.totalOwedMinor).toBe(dashboard.totalOwedMinor);
    expect(overview.rollup.netMinor).toBe(dashboard.netMinor);
    expect(overview.rollup.activeGroups).toBe(2);
  });
});

describe('authorization: non-member is rejected on every group-scoped analytics route', () => {
  async function setup() {
    const alice = await makeUser('Alice', 'alice-auth@example.com');
    const bob = await makeUser('Bob', 'bob-auth@example.com');
    const outsider = await makeUser('Outsider', 'out-auth@example.com');
    const group = await makeGroup(alice, [bob]);
    await makeExpense(group, { paidBy: alice._id, totalMinor: 10000, category: 'food', shares: { [alice._id]: 5000, [bob._id]: 5000 } });
    return { outsider, group };
  }

  test('403 on overview/categories/members/trend/reconcile/export for a named non-member group', async () => {
    const { outsider, group } = await setup();
    const gid = String(group._id);

    const routes = [
      `/api/v1/analytics/overview?groupId=${gid}`,
      `/api/v1/analytics/categories?groupId=${gid}`,
      `/api/v1/analytics/members?groupId=${gid}`,
      `/api/v1/analytics/trend?groupId=${gid}`,
      `/api/v1/analytics/reconcile/${gid}`,
      `/api/v1/analytics/export.csv?groupId=${gid}`,
    ];
    const results = {};
    for (const path of routes) {
      const res = await request(app).get(path).set(bearer(outsider));
      results[path] = { status: res.status, code: res.body && res.body.error && res.body.error.code };
    }
    const offenders = routes.filter((path) => results[path].status !== 403);
    expect(offenders).toEqual([]);
    for (const path of routes) expect(results[path].code).toBe('FORBIDDEN');
  });

  test('403 on group-scoped insights/budgets/recurring and balances for a non-member', async () => {
    const { outsider, group } = await setup();
    const gid = String(group._id);
    const paths = [
      ['/api/v1/analytics/dashboard', 200], // viewer-scoped, always allowed
      [`/api/v1/groups/${gid}/insights`, 403],
      [`/api/v1/groups/${gid}/budgets`, 403],
      [`/api/v1/groups/${gid}/recurring`, 403],
      [`/api/v1/groups/${gid}/balances`, 403],
    ];
    for (const [path] of paths) {
      const res = await request(app).get(path).set(bearer(outsider));
      const expected = paths.find((entry) => entry[0] === path)[1];
      expect(res.status).toBe(expected);
      if (expected === 403) expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});

describe('rule-based insights are live and deterministic', () => {
  test('a member gets a 200 with insights that cite their own numbers', async () => {
    const alice = await makeUser('Alice', 'alice-ins@example.com');
    const bob = await makeUser('Bob', 'bob-ins@example.com');
    const group = await makeGroup(alice, [bob], 'Flat');
    await makeExpense(group, { paidBy: alice._id, totalMinor: 60000, category: 'food', expenseDate: '2026-11-05', shares: { [alice._id]: 30000, [bob._id]: 30000 } });
    await makeExpense(group, { paidBy: alice._id, totalMinor: 20000, category: 'travel', expenseDate: '2026-11-06', shares: { [alice._id]: 10000, [bob._id]: 10000 } });

    const res = await request(app).get(`/api/v1/groups/${group._id}/insights`).set(bearer(alice));
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(Array.isArray(data.insights)).toBe(true);
    // Contribution share must cite the same minor figure the ledger derives (alice paid 80000).
    const contribution = data.insights.find((row) => row.type === 'contribution_share');
    expect(contribution).toBeTruthy();
    expect(contribution.metric.paidMinor).toBe(80000);

    // Deterministic: the same facts produce the same ordered insight ids.
    const again = await request(app).get(`/api/v1/groups/${group._id}/insights`).set(bearer(alice));
    expect(again.body.data.insights.map((row) => row.id)).toEqual(data.insights.map((row) => row.id));
  });
});

describe('CSV export escapes spreadsheet formula injection', () => {
  test('cells beginning with = + - @ are neutralised with a leading apostrophe', () => {
    const rows = [
      { title: '=SUM(A1:A2)', value: '+danger' },
      { title: '-@cmd', value: 'ok' },
    ];
    const headers = ['title', 'value'];
    const csv = analyticsService.toCsv(rows, headers);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe(`"'=SUM(A1:A2)","'+danger"`);
    expect(lines[2]).toBe(`"'-@cmd",ok`);
    // No emitted cell may begin (after an optional surrounding quote) with a raw formula op.
    for (const line of lines.slice(1)) {
      for (const cell of line.split(',')) {
        const unquoted = cell.startsWith('"') ? cell.slice(1, -1) : cell;
        expect(/^[=+\-@]/.test(unquoted)).toBe(false);
      }
    }
  });

  test('a malicious expense title is escaped in the downloaded CSV', async () => {
    const alice = await makeUser('Alice', 'alice-csv@example.com');
    const bob = await makeUser('Bob', 'bob-csv@example.com');
    const group = await makeGroup(alice, [bob]);
    await makeExpense(group, {
      paidBy: alice._id,
      totalMinor: 10000,
      title: '=HYPERLINK("http://evil")',
      shares: { [alice._id]: 5000, [bob._id]: 5000 },
    });

    const res = await request(app).get(`/api/v1/analytics/export.csv?groupId=${group._id}`).set(bearer(alice));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain("'=HYPERLINK");
    // The raw formula must never appear unescaped at the start of a cell.
    const cells = res.text.split(/\r?\n/).flatMap((line) => line.split(','));
    const unsafe = cells.some((cell) => /^"?(=|\+|-|@)/.test(cell) && !cell.startsWith(`'`) && !cell.startsWith(`"'`));
    expect(unsafe).toBe(false);
  });
});
