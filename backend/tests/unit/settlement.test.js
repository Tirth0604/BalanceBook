'use strict';

const {
  computeNetBalances,
  computePairwiseDebts,
  totalNet,
  toSolverInput,
} = require('../../src/algorithms/balanceCalculator');
const { greedySettlement } = require('../../src/algorithms/greedySettlement');
const { minimumSettlement } = require('../../src/algorithms/minimumSettlement');
const { validateSettlement } = require('../../src/algorithms/settlementValidator');

const expense = (paidBy, shares, extra = {}) => ({
  id: extra.id,
  paidBy,
  groupAmountMinor: Object.values(shares).reduce((a, b) => a + b, 0),
  participants: Object.entries(shares).map(([userId, shareMinor]) => ({ userId, shareMinor })),
  isDeleted: extra.isDeleted || false,
});

describe('balance calculator', () => {
  test('the spec example: Alice pays ₹3,000 split three ways', () => {
    const balances = computeNetBalances({
      memberIds: ['alice', 'bob', 'charlie'],
      expenses: [expense('alice', { alice: 100000, bob: 100000, charlie: 100000 })],
      settlements: [],
    });
    expect(balances).toEqual([
      {
        userId: 'alice',
        paidMinor: 300000,
        consumedMinor: 100000,
        settledInMinor: 0,
        settledOutMinor: 0,
        netMinor: 200000,
        status: 'creditor',
      },
      expect.objectContaining({ userId: 'bob', netMinor: -100000, status: 'debtor' }),
      expect.objectContaining({ userId: 'charlie', netMinor: -100000, status: 'debtor' }),
    ]);
    expect(totalNet(balances)).toBe(0);
  });

  test('multiple expenses with multiple payers still net to zero', () => {
    const balances = computeNetBalances({
      memberIds: ['a', 'b', 'c', 'd'],
      expenses: [
        expense('a', { a: 25000, b: 25000, c: 25000, d: 25000 }, { id: 'e1' }),
        expense('c', { a: 3334, b: 3333, c: 3333 }, { id: 'e2' }),
        expense('d', { d: 99999 }, { id: 'e3' }),
      ],
      settlements: [],
    });
    expect(totalNet(balances)).toBe(0);
    expect(balances.map((row) => [row.userId, row.netMinor, row.status])).toEqual([
      ['a', 71666, 'creditor'], // paid 100,000 consumed 28,334
      ['b', -28333, 'debtor'],
      ['c', -18333, 'debtor'], // paid 10,000 of the 28,333 they consumed
      ['d', -25000, 'debtor'], // paid 99,999 but consumed it all plus a quarter of e1
    ]);
  });

  test('only completed settlements move the ledger', () => {
    const base = {
      memberIds: ['a', 'b'],
      expenses: [expense('a', { a: 50000, b: 50000 })],
    };
    const pending = computeNetBalances({
      ...base,
      settlements: [{ id: 's1', payerId: 'b', receiverId: 'a', amountMinor: 50000, status: 'awaiting_confirmation' }],
    });
    expect(totalNet(pending)).toBe(0);
    expect(pending.find((row) => row.userId === 'b').netMinor).toBe(-50000);

    const completed = computeNetBalances({
      ...base,
      settlements: [{ id: 's2', payerId: 'b', receiverId: 'a', amountMinor: 50000, status: 'completed' }],
    });
    expect(completed.every((row) => row.netMinor === 0)).toBe(true);
    expect(completed.every((row) => row.status === 'settled')).toBe(true);
  });

  test('soft-deleted expenses are excluded', () => {
    const balances = computeNetBalances({
      memberIds: ['a', 'b'],
      expenses: [expense('a', { a: 50000, b: 50000 }, { isDeleted: true })],
      settlements: [],
    });
    expect(balances.every((row) => row.netMinor === 0)).toBe(true);
  });

  test('inactive members appear with a zero balance', () => {
    const balances = computeNetBalances({
      memberIds: ['a', 'b', 'wallflower'],
      expenses: [expense('a', { a: 10000, b: 10000 })],
      settlements: [],
    });
    expect(balances).toHaveLength(3);
    expect(balances.find((row) => row.userId === 'wallflower')).toMatchObject({
      netMinor: 0,
      status: 'settled',
    });
  });

  test('a ledger row pointing at a non-member is surfaced, not swallowed', () => {
    expect(() =>
      computeNetBalances({ memberIds: ['a'], expenses: [expense('a', { ghost: 100 })], settlements: [] }),
    ).toThrow(/not an active member/);
    expect(() =>
      computeNetBalances({ id: 'x', memberIds: ['a'], expenses: [{ id: 'x', paidBy: 'a', groupAmountMinor: 100, participants: [] }], settlements: [] }),
    ).toThrow(/no participants/);
    expect(() =>
      computeNetBalances({
        memberIds: ['a', 'b'],
        expenses: [{ id: 'bad', paidBy: 'a', groupAmountMinor: 100, participants: [{ userId: 'b', shareMinor: 99 }] }],
        settlements: [],
      }),
    ).toThrow(/do not sum to its total/);
  });

  test('strict=false keeps a removed member in the view so their debt is visible', () => {
    const balances = computeNetBalances({
      memberIds: ['a'],
      expenses: [expense('a', { a: 10000, ex: 10000 })],
      settlements: [],
      strict: false,
    });
    expect(balances.find((row) => row.userId === 'ex').netMinor).toBe(-10000);
  });

  test('pairwise debts collapse opposite IOUs into one line per pair', () => {
    const debts = computePairwiseDebts({
      memberIds: ['a', 'b'],
      expenses: [expense('a', { a: 1000, b: 5000 }), expense('b', { a: 2000, b: 3000 })],
      settlements: [],
    });
    // b owes a 5,000 and a owes b 2,000 -> one net line of 3,000 from b to a.
    expect(debts).toEqual([{ from: 'b', to: 'a', amountMinor: 3000 }]);
  });
});

describe('settlement solvers', () => {
  const settled = [
    { userId: 'a', netMinor: 0 },
    { userId: 'b', netMinor: 0 },
  ];

  test('already-settled groups produce no transfers', () => {
    expect(greedySettlement(settled)).toMatchObject({ transactionCount: 0, isSettledUp: true });
    expect(minimumSettlement(settled)).toMatchObject({ transactionCount: 0, isSettledUp: true });
  });

  test('one debtor, one creditor', () => {
    const plan = greedySettlement([
      { userId: 'a', netMinor: -100000 },
      { userId: 'b', netMinor: 100000 },
    ]);
    expect(plan.transactions).toEqual([{ fromId: 'a', toId: 'b', amountMinor: 100000 }]);
  });

  test('the spec example collapses three IOUs into one payment', () => {
    // Alice owes Bob ₹500 and Charlie ₹500; Bob owes Charlie ₹500.
    const balances = computeNetBalances({
      memberIds: ['alice', 'bob', 'charlie'],
      expenses: [
        expense('bob', { alice: 50000, bob: 50000 }),
        expense('charlie', { alice: 50000, charlie: 50000 }),
        expense('charlie', { bob: 50000 }),
      ],
      settlements: [],
    });
    expect(balances.map((row) => row.netMinor)).toEqual([-100000, 0, 100000]);

    const plan = minimumSettlement(toSolverInput(balances));
    expect(plan.transactions).toEqual([{ fromId: 'alice', toId: 'charlie', amountMinor: 100000 }]);
    expect(plan.transactionCount).toBe(1);
    expect(greedySettlement(toSolverInput(balances)).transactionCount).toBe(1);
  });

  test('greedy is valid but not always minimal; the exact solver is', () => {
    const balances = [
      { userId: 'w', netMinor: 700 },
      { userId: 'x', netMinor: -400 },
      { userId: 'y', netMinor: -300 },
      { userId: 'z', netMinor: 600 },
      { userId: 'p', netMinor: -500 },
      { userId: 'q', netMinor: -100 },
    ];
    const greedy = greedySettlement(balances);
    const minimum = minimumSettlement(balances);
    expect(totalNet(balances)).toBe(0);
    expect(greedy.transactionCount).toBe(5);
    expect(minimum.transactionCount).toBe(4); // (6 members - 2 independent zero-sum groups)
    expect(minimum.parts).toEqual([
      ['w', 'x', 'y'],
      ['z', 'p', 'q'],
    ]);
    expect(minimum.transactionCount).toBeLessThanOrEqual(greedy.transactionCount);
    expect(() => validateSettlement(balances, minimum.transactions)).not.toThrow();
  });

  test('every debtor pays exactly their share, every creditor receives theirs', () => {
    const balances = [
      { userId: 'a', netMinor: -25000 },
      { userId: 'b', netMinor: -75000 },
      { userId: 'c', netMinor: 40000 },
      { userId: 'd', netMinor: 60000 },
      { userId: 'e', netMinor: 0 },
    ];
    for (const solver of [greedySettlement, minimumSettlement]) {
      const plan = solver(balances);
      expect(() => validateSettlement(balances, plan.transactions)).not.toThrow();
      expect(plan.amountMinor).toBe(100000);
      expect(plan.transactions.every((row) => row.amountMinor > 0)).toBe(true);
      expect(plan.transactions.some((row) => row.fromId === row.toId)).toBe(false);
      expect(plan.transactions.every((row) => row.fromId !== 'e' && row.toId !== 'e')).toBe(true);
      expect(plan.transactionCount).toBeLessThanOrEqual(4);
    }
  });

  test('deterministic: the same ledger replays the same plan', () => {
    const balances = [
      { userId: 'a', netMinor: -30 },
      { userId: 'b', netMinor: -20 },
      { userId: 'c', netMinor: 50 },
      { userId: 'd', netMinor: -5 },
      { userId: 'e', netMinor: 5 },
    ];
    const first = JSON.stringify(minimumSettlement(balances).transactions);
    const shuffled = [balances[3], balances[0], balances[4], balances[1], balances[2]];
    expect(JSON.stringify(minimumSettlement(shuffled).transactions)).toBe(first);
  });

  test('falls back to greedy above the size threshold and says why', () => {
    const balances = [];
    for (let i = 0; i < 12; i += 1) balances.push({ userId: `d${i}`, netMinor: -(i + 1) * 1000 });
    for (let i = 0; i < 12; i += 1) balances.push({ userId: `c${i}`, netMinor: (i + 1) * 1000 });

    const large = minimumSettlement(balances, { maxSize: 12 });
    expect(large.algorithm).toBe('greedy');
    expect(large.fallbackReason).toBe('GROUP_TOO_LARGE');
    expect(() => validateSettlement(balances, large.transactions)).not.toThrow();

    const atThreshold = minimumSettlement(
      [balances[0], balances[12], balances[1], balances[13]],
      { maxSize: 12 },
    );
    expect(atThreshold.algorithm).toBe('minimum');
  });

  test('refuses to optimise an unbalanced ledger', () => {
    expect(() => minimumSettlement([{ userId: 'a', netMinor: -100 }, { userId: 'b', netMinor: 90 }])).toThrow(
      /does not net to zero/,
    );
    expect(() => greedySettlement([{ userId: 'a', netMinor: -100 }, { userId: 'b', netMinor: 90 }])).toThrow(
      /does not net to zero/,
    );
  });

  test('validator catches a hand-built broken plan', () => {
    const balances = [
      { userId: 'a', netMinor: -100 },
      { userId: 'b', netMinor: 100 },
    ];
    expect(() => validateSettlement(balances, [{ fromId: 'a', toId: 'a', amountMinor: 100 }])).toThrow(
      /self-transaction/,
    );
    expect(() => validateSettlement(balances, [{ fromId: 'a', toId: 'b', amountMinor: 99 }])).toThrow(
      /outstanding/,
    );
    expect(() => validateSettlement(balances, [{ fromId: 'a', toId: 'b', amountMinor: 1.5 }])).toThrow(
      /integer minor unit/,
    );
    expect(() => validateSettlement(balances, [{ fromId: 'a', toId: 'b', amountMinor: 0 }])).toThrow(/positive/);
  });

  test('solver output survives a large randomised invariant check', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const size = 3 + (seed % 9);
      const balances = [];
      let running = 0;
      for (let i = 0; i < size - 1; i += 1) {
        const net = ((seed * 37 + i * 91) % 501) - 250;
        running += net;
        balances.push({ userId: `u${i}`, netMinor: net });
      }
      balances.push({ userId: `u${size - 1}`, netMinor: -running });
      const minimum = minimumSettlement(balances);
      const greedy = greedySettlement(balances);
      expect(() => validateSettlement(balances, minimum.transactions)).not.toThrow();
      expect(minimum.transactionCount).toBeLessThanOrEqual(greedy.transactionCount);
      expect(minimum.transactionCount).toBeLessThanOrEqual(size - 1);
    }
  });
});
