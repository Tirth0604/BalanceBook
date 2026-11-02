'use strict';

/**
 * Development seed. Writes REAL documents through the same split engine the API uses, so
 * the seeded ledger satisfies every invariant a live session would (shares sum to totals,
 * group balances net to zero). Refuses to run against production.
 *
 *   npm run seed            # wipe + seed
 *   npm run seed -- --keep  # keep existing data, only add what is missing
 */

const mongoose = require('mongoose');
const config = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const Notification = require('../models/Notification');
const RecurringExpense = require('../models/RecurringExpense');
const Budget = require('../models/Budget');
const ExpenseAuditLog = require('../models/ExpenseAuditLog');
const { split, allocateByLargestRemainder } = require('../algorithms/splitter');
const { computeNetBalances, totalNet } = require('../algorithms/balanceCalculator');
const { greedySettlement } = require('../algorithms/greedySettlement');
const { convert, sameCurrency } = require('../algorithms/currency');
const money = require('../utils/money');
const { SETTLEMENT_STATUS, GROUP_ROLE } = require('../utils/constants');

const PASSWORD = config.SEED_PASSWORD;

const PEOPLE = [
  { key: 'love', name: 'Love Shah', email: 'love@balancebook.app', currency: 'INR' },
  { key: 'tirth', name: 'Tirth Gandhi', email: 'tirth@balancebook.app', currency: 'INR' },
  { key: 'fahim', name: 'Fahim Saiyad', email: 'fahim@balancebook.app', currency: 'INR' },
  { key: 'ananya', name: 'Ananya Rao', email: 'ananya@balancebook.app', currency: 'INR' },
  { key: 'vikram', name: 'Vikram Mehta', email: 'vikram@balancebook.app', currency: 'INR' },
  { key: 'sofia', name: 'Sofia Alvarez', email: 'sofia@balancebook.app', currency: 'USD' },
];

const day = 24 * 60 * 60 * 1000;
const daysAgo = (count) => new Date(Date.now() - count * day);

/** [title, category, amount(decimal string), payerKey, participantKeys, splitType, daysBack, description] */
const GOA_TRIP = [
  ['Beach resort 3 nights', 'accommodation', '42000.00', 'love', ['love', 'tirth', 'fahim', 'ananya'], 'equal', 26, 'Sea-facing room for four'],
  ['Cab to airport', 'transport', '2400.00', 'tirth', ['love', 'tirth', 'fahim', 'ananya', 'vikram'], 'equal', 25, 'Early morning rush'],
  ['Seafood shack dinner', 'food', '8650.50', 'fahim', ['love', 'tirth', 'fahim', 'ananya'], 'equal', 24, 'Caldo and prawns'],
  ['Scooter rentals', 'transport', '3200.00', 'ananya', ['ananya', 'sofia'], 'exact', 23, 'Two scooters, Ananya paid more hours'],
  ['Sunset cruise tickets', 'entertainment', '6000.00', 'love', ['love', 'tirth', 'fahim', 'ananya', 'sofia'], 'percentage', 22, ''],
  ['Groceries for the villa', 'groceries', '5432.75', 'tirth', ['love', 'tirth', 'fahim', 'ananya'], 'equal', 20, 'Breakfast supplies and water'],
  ['Ayurvedic spa', 'health', '7500.00', 'sofia', ['sofia', 'ananya'], 'exact', 18, 'Sofia booked the couple suite'],
  ['Water sports', 'travel', '11200.00', 'fahim', ['love', 'tirth', 'fahim'], 'percentage', 16, 'Parasailing and jet ski'],
  ['Sea-view cafe breakfasts', 'food', '4980.00', 'love', ['love', 'tirth', 'fahim', 'ananya', 'sofia', 'vikram'], 'equal', 14, 'Six mornings'],
  ['Flight change fee', 'travel', '9500.00', 'vikram', ['vikram', 'love'], 'exact', 12, 'Vikram carried the penalty'],
  ['Beach party entry', 'entertainment', '6400.00', 'ananya', ['ananya', 'sofia', 'tirth'], 'equal', 9, ''],
  ['Souvenir shopping', 'shopping', '7777.77', 'sofia', ['love', 'tirth', 'fahim', 'ananya', 'sofia', 'vikram'], 'equal', 6, 'Handicrafts at Mapusa'],
];

const FLAT_704 = [
  ['November rent', 'accommodation', '65000.00', 'love', ['love', 'tirth', 'fahim'], 'equal', 30, 'Flat 704, two bedrooms'],
  ['Electricity bill', 'utilities', '3420.00', 'tirth', ['love', 'tirth', 'fahim'], 'equal', 27, 'APECL postpaid'],
  ['Fibre internet', 'utilities', '1599.00', 'fahim', ['love', 'tirth', 'fahim'], 'equal', 25, 'Rotation month'],
  ['Weekly grocery run', 'groceries', '6210.35', 'love', ['love', 'tirth', 'fahim'], 'equal', 21, 'BigBasket order'],
  ['Water can + cleaning', 'utilities', '2100.00', 'tirth', ['love', 'tirth', 'fahim'], 'exact', 18, 'Tirth covered the sweeper'],
  ['Dinner at Barbeque Nation', 'food', '5480.00', 'fahim', ['love', 'tirth', 'fahim'], 'percentage', 12, 'Fahim ate the most'],
  ['Fridge repair', 'others', '4300.00', 'love', ['love', 'tirth', 'fahim'], 'equal', 8, 'Compressor gas top-up'],
  ['Milk & bread monthly', 'groceries', '3050.00', 'tirth', ['love', 'tirth', 'fahim'], 'equal', 4, ''],
];

const FAMILY_REUNION = [
  ['Caterer for the reunion', 'food', '38000.00', 'ananya', ['ananya', 'vikram', 'love', 'tirth'], 'percentage', 40, ''],
  ['Banquet hall deposit', 'entertainment', '25000.00', 'vikram', ['ananya', 'vikram'], 'exact', 38, ''],
  ['Return cab for relatives', 'transport', '6800.00', 'love', ['ananya', 'vikram', 'love', 'tirth'], 'equal', 35, ''],
  ['Gift hampers', 'shopping', '9600.00', 'tirth', ['ananya', 'vikram', 'love', 'tirth'], 'equal', 33, 'Dry fruits and sweets'],
];

const OFFICE_LUNCH = [
  ['Team lunch at Swagast', 'food', '8460.00', 'fahim', ['fahim', 'love', 'tirth', 'sofia'], 'equal', 11, 'Sprint celebration'],
  ['Conference passes', 'travel', '24000.00', 'sofia', ['sofia', 'fahim', 'love'], 'percentage', 7, 'USD card, INR group'],
  ['Office snacks', 'groceries', '1250.00', 'love', ['love', 'fahim', 'tirth'], 'equal', 3, ''],
];

const PERCENT_TEMPLATES = {
  'Sunset cruise tickets': { love: 25, tirth: 25, fahim: 20, ananya: 20, sofia: 10 },
  'Water sports': { love: 40, tirth: 35, fahim: 25 },
  'Dinner at Barbeque Nation': { love: 25, tirth: 30, fahim: 45 },
  'Caterer for the reunion': { ananya: 40, vikram: 30, love: 15, tirth: 15 },
  'Conference passes': { sofia: 50, fahim: 30, love: 20 },
};

function sharesFor(entry, people, groupCurrency) {
  const [title, , amount, payerKey, participantKeys, splitType] = entry;
  const totalMinor = money.toMinor(amount, 'INR');
  const participants = participantKeys.map((key) => ({ userId: String(people[key].id) }));

  let rows;
  if (splitType === 'equal') {
    rows = split(totalMinor, { splitType, participants, currency: 'INR' });
  } else if (splitType === 'exact') {
    const weights = {
      'Scooter rentals': { ananya: '2000.00', sofia: '1200.00' },
      'Ayurvedic spa': { sofia: '5000.00', ananya: '2500.00' },
      'Flight change fee': { vikram: '6000.00', love: '3500.00' },
      'Water can + cleaning': { love: '700.00', tirth: '900.00', fahim: '500.00' },
      'Banquet hall deposit': { ananya: '15000.00', vikram: '10000.00' },
    }[title];
    rows = split(
      totalMinor,
      {
        splitType,
        participants: participants.map((participant) => ({
          ...participant,
          share: weights[peopleById(participant.userId)],
        })),
        currency: 'INR',
      },
    );
  } else {
    const percentages = PERCENT_TEMPLATES[title];
    rows = split(
      totalMinor,
      {
        splitType,
        participants: participants.map((participant) => ({
          ...participant,
          percentage: percentages[peopleById(participant.userId)],
        })),
        currency: 'INR',
      },
    );
  }
  // A ledger is only self-consistent if the total and every share are in the same minor units,
  // so cross-currency groups store the group-currency amount and re-allocate the shares.
  if (sameCurrency('INR', groupCurrency)) return { totalMinor, rows, sourceMinor: totalMinor };

  const groupTotalMinor = convert(totalMinor, 'INR', groupCurrency, 1 / 83.5);
  const groupRows = allocateByLargestRemainder(
    groupTotalMinor,
    rows.map((row) => ({ userId: row.userId, weight: row.shareMinor, percentage: row.percentage ?? null })),
  ).map((row) => ({ userId: row.userId, shareMinor: row.shareMinor, percentage: row.percentage }));

  return { totalMinor: groupTotalMinor, rows: groupRows, sourceMinor: totalMinor };
}

let LOOKUP = new Map();
function peopleById(id) {
  return LOOKUP.get(String(id));
}

async function createUser(person) {
  const user = await User.create({
    name: person.name,
    email: person.email,
    password: PASSWORD,
    preferredCurrency: person.currency,
    isEmailVerified: true,
    notificationPreferences: { inApp: true, email: false, expenseAdded: true, budgetAlerts: true },
  });
  return { ...person, id: user._id, user };
}

async function createGroup({ name, description, category, baseCurrency, ownerKey, memberKeys, people }) {
  const members = memberKeys.map((key) => ({
    userId: people[key].id,
    role: key === ownerKey ? GROUP_ROLE.ADMIN : GROUP_ROLE.MEMBER,
    status: 'active',
    joinedAt: daysAgo(90),
  }));
  return Group.create({
    name,
    description,
    category,
    baseCurrency,
    createdBy: people[ownerKey].id,
    members,
  });
}

async function seedExpenses(entries, group, people, creatorKey) {
  const created = [];
  for (const entry of entries) {
    const [title, category, amount, payerKey, participantKeys, splitType, back, description] = entry;
    const { totalMinor, rows } = sharesFor(entry, people, group.baseCurrency);
    const converted = !sameCurrency('INR', group.baseCurrency);
    const expense = await Expense.create({
      groupId: group._id,
      title,
      description,
      category,
      tags: category === 'food' ? ['shared'] : [],
      totalMinor,
      currency: group.baseCurrency,
      groupAmountMinor: totalMinor,
      exchangeRate: converted ? 1 / 83.5 : 1,
      paidBy: people[payerKey].id,
      splitType,
      participants: rows.map((row) => ({ userId: row.userId, shareMinor: row.shareMinor, percentage: row.percentage ?? null })),
      expenseDate: daysAgo(back),
      createdBy: people[creatorKey].id,
    });
    await ExpenseAuditLog.create({
      expenseId: expense._id,
      groupId: group._id,
      modifiedBy: people[creatorKey].id,
      action: 'created',
      updatedData: { totalMinor, splitType, participants: rows.length },
      changeSummary: `Seeded ${title}`,
    });
    created.push(expense);
  }
  return created;
}

/** Pay down part of the debt so the app opens with a mixed, realistic ledger. */
async function seedSettlements(group, expenses, people, key, planName) {
  const balances = computeNetBalances({
    memberIds: group.activeMemberIds(),
    expenses,
    settlements: [],
  });
  const plan = greedySettlement(balances.map((row) => ({ userId: row.userId, netMinor: row.netMinor })));
  if (!plan.transactions.length) return [];

  const actorId = String(people[key].id);
  const matching = plan.transactions.find((transaction) => transaction.fromId === actorId) || plan.transactions[0];
  const rows = [];
  // A completed payment, and a second one still waiting on the receiver.
  const completed = await Settlement.create({
    groupId: group._id,
    payerId: matching.fromId,
    receiverId: matching.toId,
    amountMinor: Math.floor(matching.amountMinor / 2),
    currency: group.baseCurrency,
    status: SETTLEMENT_STATUS.COMPLETED,
    paymentMethod: 'upi',
    note: `${planName} partial repayment`,
    initiatedBy: matching.fromId,
    confirmedBy: matching.toId,
    confirmedAt: daysAgo(2),
    initiatedAt: daysAgo(3),
    awaitingConfirmationAt: daysAgo(3),
    auditTrail: [
      { action: 'created', by: matching.fromId, at: daysAgo(3) },
      { action: 'confirmed', by: matching.toId, at: daysAgo(2), from: 'awaiting_confirmation', to: 'completed' },
    ],
  });
  rows.push(completed);

  const pending = plan.transactions.find((transaction) => transaction.fromId !== matching.fromId);
  if (pending) {
    rows.push(
      await Settlement.create({
        groupId: group._id,
        payerId: pending.fromId,
        receiverId: pending.toId,
        amountMinor: pending.amountMinor,
        currency: group.baseCurrency,
        status: SETTLEMENT_STATUS.AWAITING_CONFIRMATION,
        paymentMethod: 'cash',
        note: 'Handed over in cash, waiting for confirmation',
        initiatedBy: pending.fromId,
        initiatedAt: daysAgo(1),
        awaitingConfirmationAt: daysAgo(1),
        auditTrail: [{ action: 'created', by: pending.fromId, at: daysAgo(1) }],
      }),
    );
  }
  return rows;
}

function assertLedger(groupName, memberIds, expenses, settlements) {
  const balances = computeNetBalances({ memberIds, expenses, settlements });
  const sum = totalNet(balances);
  if (sum !== 0) {
    throw new Error(`Seeded ledger for ${groupName} does not net to zero (off by ${sum} minor units)`);
  }
  return balances;
}

async function main() {
  const keep = process.argv.includes('--keep');
  if (config.isProduction && !process.argv.includes('--force')) {
    throw new Error('Refusing to seed a production database');
  }

  await connectDatabase();
  const tag = `[seed:${config.MONGODB_DB_NAME || config.MONGODB_URI.split('/').pop()}]`;

  if (!keep) {
    await Promise.all([
      User.deleteMany({}),
      Group.deleteMany({}),
      Expense.deleteMany({}),
      Settlement.deleteMany({}),
      Notification.deleteMany({}),
      RecurringExpense.deleteMany({}),
      Budget.deleteMany({}),
      ExpenseAuditLog.deleteMany({}),
      mongoose.connection.collection('refreshtokens').deleteMany({}),
      mongoose.connection.collection('invitations').deleteMany({}),
    ]);
    console.info(`${tag} cleared existing collections`);
  }

  const people = {};
  LOOKUP = new Map();
  for (const person of PEOPLE) {
    people[person.key] = await createUser(person);
    LOOKUP.set(String(people[person.key].id), person.key);
  }
  console.info(`${tag} ${PEOPLE.length} users (password: ${PASSWORD})`);

  const allKeys = PEOPLE.map((person) => person.key);
  const goa = await createGroup({
    name: 'Goa Getaway',
    description: 'Six friends, four nights by the beach',
    category: 'trip',
    baseCurrency: 'INR',
    ownerKey: 'love',
    memberKeys: allKeys,
    people,
  });
  const flat = await createGroup({
    name: 'Flat 704',
    description: 'Rent, bills and the weekly grocery run',
    category: 'home',
    baseCurrency: 'INR',
    ownerKey: 'tirth',
    memberKeys: ['love', 'tirth', 'fahim'],
    people,
  });
  const family = await createGroup({
    name: 'Reunion 2026',
    description: 'Annual family get-together',
    category: 'family',
    baseCurrency: 'INR',
    ownerKey: 'ananya',
    memberKeys: ['ananya', 'vikram', 'love', 'tirth'],
    people,
  });
  const office = await createGroup({
    name: 'Squad Lunches',
    description: 'Team lunches and conference tickets',
    category: 'office',
    baseCurrency: 'USD',
    ownerKey: 'sofia',
    memberKeys: ['sofia', 'fahim', 'love', 'tirth'],
    people,
  });

  const goaExpenses = await seedExpenses(GOA_TRIP, goa, people, 'love');
  const flatExpenses = await seedExpenses(FLAT_704, flat, people, 'tirth');
  const familyExpenses = await seedExpenses(FAMILY_REUNION, family, people, 'ananya');
  const officeExpenses = await seedExpenses(OFFICE_LUNCH, office, people, 'sofia');

  const goaSettlements = await seedSettlements(goa, goaExpenses, people, 'tirth', 'Goa');
  const flatSettlements = await seedSettlements(flat, flatExpenses, people, 'fahim', 'Flat');
  const familySettlements = await seedSettlements(family, familyExpenses, people, 'love', 'Reunion');
  const officeSettlements = await seedSettlements(office, officeExpenses, people, 'fahim', 'Squad');

  const ledgers = [
    ['Goa Getaway', goa, goaExpenses, goaSettlements],
    ['Flat 704', flat, flatExpenses, flatSettlements],
    ['Reunion 2026', family, familyExpenses, familySettlements],
    ['Squad Lunches', office, officeExpenses, officeSettlements],
  ];

  for (const [name, group, expenses, settlements] of ledgers) {
    const balances = assertLedger(name, group.activeMemberIds(), expenses, settlements);
    const creditors = balances.filter((row) => row.netMinor > 0).length;
    const debtors = balances.filter((row) => row.netMinor < 0).length;
    console.info(
      `${tag} ${name}: ${expenses.length} expenses, ${settlements.length} settlements, ` +
        `${creditors} owed / ${debtors} owing, net ${totalNet(balances)} minor`,
    );
  }

  await RecurringExpense.create([
    {
      groupId: flat._id,
      title: 'Flat rent',
      category: 'accommodation',
      totalMinor: money.toMinor('65000.00', 'INR'),
      currency: 'INR',
      splitType: 'equal',
      paidBy: people.love.id,
      participants: ['love', 'tirth', 'fahim'].map((key) => ({ userId: people[key].id })),
      frequency: 'monthly',
      interval: 1,
      startDate: daysAgo(30),
      nextDueDate: new Date(Date.now() + 2 * day),
      maxOccurrences: 12,
      createdBy: people.love.id,
    },
    {
      groupId: flat._id,
      title: 'Fibre internet',
      category: 'utilities',
      totalMinor: money.toMinor('1599.00', 'INR'),
      currency: 'INR',
      splitType: 'equal',
      paidBy: people.tirth.id,
      participants: ['love', 'tirth', 'fahim'].map((key) => ({ userId: people[key].id })),
      frequency: 'monthly',
      interval: 1,
      startDate: daysAgo(25),
      nextDueDate: new Date(Date.now() + 5 * day),
      createdBy: people.tirth.id,
    },
  ]);

  await Budget.create([
    {
      groupId: goa._id,
      scope: 'group_total',
      label: 'Trip budget',
      limitMinor: money.toMinor('90000.00', 'INR'),
      currency: 'INR',
      period: 'overall',
      createdBy: people.love.id,
    },
    {
      groupId: goa._id,
      scope: 'category',
      category: 'food',
      label: 'Eating out',
      limitMinor: money.toMinor('12000.00', 'INR'),
      currency: 'INR',
      period: 'overall',
      createdBy: people.love.id,
    },
    {
      groupId: flat._id,
      scope: 'category',
      category: 'groceries',
      label: 'Monthly groceries',
      limitMinor: money.toMinor('8000.00', 'INR'),
      currency: 'INR',
      period: 'monthly',
      periodKey: new Date().toISOString().slice(0, 7),
      createdBy: people.tirth.id,
    },
  ]);

  await Notification.insertMany([
    {
      userId: people.love.id,
      groupId: goa._id,
      type: 'settlement_requested',
      title: 'Tirth recorded a payment',
      body: 'Confirm the cash settlement from Tirth to unlock your Goa balance.',
      payload: { groupId: String(goa._id) },
    },
    {
      userId: people.tirth.id,
      groupId: flat._id,
      type: 'budget_threshold',
      title: 'Groceries are at 84% of budget',
      body: 'Flat 704 has spent most of this month’s grocery budget.',
      payload: { groupId: String(flat._id) },
    },
    {
      userId: people.ananya.id,
      groupId: family._id,
      type: 'expense_added',
      title: 'New expense in Reunion 2026',
      body: 'Vikram added Return cab for relatives.',
      payload: { groupId: String(family._id) },
    },
  ]);
  console.info(`${tag} 2 recurring rules, 3 budgets, 3 notifications`);

  console.info('\nAccounts (password for all: %s)', PASSWORD);
  for (const person of PEOPLE) {
    console.info(`  ${person.email.padEnd(28)} ${person.name}`);
  }
  console.info('\nTip: log in as tirth@balancebook.app to see both a creditor and a debtor view.');

  await disconnectDatabase();
  console.info(`${tag} done`);
}

main().catch(async (error) => {
  console.error(`${'[seed]'} failed:`, error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
