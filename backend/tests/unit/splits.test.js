'use strict';

const { split, splitEqual, splitPercentage, splitExact } = require('../../src/algorithms/splitter');
const money = require('../../src/utils/money');

const sum = (rows) => rows.reduce((total, row) => total + row.shareMinor, 0);

describe('equal split', () => {
  test('divides cleanly', () => {
    expect(splitEqual(300000, ['alice', 'bob', 'charlie'])).toEqual([
      { userId: 'alice', shareMinor: 100000, weight: 1 },
      { userId: 'bob', shareMinor: 100000, weight: 1 },
      { userId: 'charlie', shareMinor: 100000, weight: 1 },
    ]);
  });

  test('gives the indivisible paisa to the lowest id and conserves the total', () => {
    const rows = splitEqual(10000, ['a', 'b', 'c']);
    expect(sum(rows)).toBe(10000);
    expect(rows.map((row) => row.shareMinor)).toEqual([3334, 3333, 3333]);
  });

  test('one paisa between two people is never lost', () => {
    const rows = splitEqual(1, ['a', 'b']);
    expect(sum(rows)).toBe(1);
    expect(rows.map((row) => row.shareMinor)).toEqual([1, 0]);
  });

  test('is order-independent (participants arrive unsorted)', () => {
    expect(splitEqual(10000, ['c', 'a', 'b']).map((row) => row.userId).sort()).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(splitEqual(10000, ['c', 'b', 'a']).map((row) => row.shareMinor)).toEqual([
      3333,
      3333,
      3334,
    ]);
  });

  test('single participant carries the whole amount', () => {
    expect(splitEqual(999, ['solo'])).toEqual([{ userId: 'solo', shareMinor: 999, weight: 1 }]);
  });

  test('rejects empty or duplicated participants', () => {
    expect(() => splitEqual(100, [])).toThrow(/at least one participant/);
    expect(() => splitEqual(100, ['a', 'a'])).toThrow(/more than once/);
  });
});

describe('percentage split', () => {
  test('50 / 30 / 20 of ₹5,000', () => {
    const rows = splitPercentage(500000, [
      { userId: 'a', percentage: 50 },
      { userId: 'b', percentage: 30 },
      { userId: 'c', percentage: 20 },
    ]);
    expect(rows.map((row) => row.shareMinor)).toEqual([250000, 150000, 100000]);
    expect(rows.map((row) => row.percentage)).toEqual([50, 30, 20]);
  });

  test('33.33 / 33.33 / 33.34 still totals exactly', () => {
    const rows = splitPercentage(500000, [
      { userId: 'a', percentage: '33.33' },
      { userId: 'b', percentage: '33.33' },
      { userId: 'c', percentage: '33.34' },
    ]);
    expect(sum(rows)).toBe(500000);
    expect(rows.map((row) => row.shareMinor)).toEqual([166650, 166650, 166700]);
  });

  test('rejects a total that is not 100.00', () => {
    expect(() =>
      splitPercentage(500000, [
        { userId: 'a', percentage: 50 },
        { userId: 'b', percentage: 40 },
      ]),
    ).toThrow(/total exactly 100/);
  });

  test('rejects >2 decimals, zero and negative weights', () => {
    expect(() =>
      splitPercentage(1000, [
        { userId: 'a', percentage: 50.125 },
        { userId: 'b', percentage: 49.875 },
      ]),
    ).toThrow(/2 decimals/);
    expect(() => splitPercentage(1000, [{ userId: 'a', percentage: 100 }])).not.toThrow();
    expect(() =>
      splitPercentage(1000, [
        { userId: 'a', percentage: 0 },
        { userId: 'b', percentage: 100 },
      ]),
    ).toThrow(/greater than 0/);
  });

  test('odd paisa across percentages never breaks the total', () => {
    const rows = splitPercentage(1, [
      { userId: 'a', percentage: 50 },
      { userId: 'b', percentage: 50 },
    ]);
    expect(sum(rows)).toBe(1);
  });
});

describe('exact split', () => {
  test('accepts a valid assignment (₹1,500 / ₹1,000 / ₹500 of ₹3,000)', () => {
    const rows = splitExact(
      300000,
      [
        { userId: 'a', share: '1500.00' },
        { userId: 'b', share: '1000.00' },
        { userId: 'c', share: '500.00' },
      ],
      'INR',
    );
    expect(rows).toEqual([
      { userId: 'a', shareMinor: 150000 },
      { userId: 'b', shareMinor: 100000 },
      { userId: 'c', shareMinor: 50000 },
    ]);
  });

  test('rejects a one-paisa shortfall instead of silently redistributing', () => {
    expect(() =>
      splitExact(
        300000,
        [
          { userId: 'a', share: '1500.00' },
          { userId: 'b', share: '1000.00' },
          { userId: 'c', share: '499.99' },
        ],
        'INR',
      ),
    ).toThrow(/Shares total 299999 minor units but the expense is 300000/);
  });

  test('rejects over-allocation and negative shares', () => {
    expect(() => splitExact(100, [{ userId: 'a', shareMinor: 101 }], 'INR')).toThrow(/Shares total 101/);
    expect(() => splitExact(100, [{ userId: 'a', shareMinor: -100 }], 'INR')).toThrow(/negative/);
  });

  test('a zero share is legal (someone consumed nothing)', () => {
    expect(splitExact(1, [{ userId: 'a', shareMinor: 1 }, { userId: 'b', shareMinor: 0 }], 'INR')).toEqual([
      { userId: 'a', shareMinor: 1 },
      { userId: 'b', shareMinor: 0 },
    ]);
  });
});

describe('split() dispatcher', () => {
  test('derives shares per mode and always conserves the total', () => {
    const participants = [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }];
    for (const totalMinor of [1, 999, 10000, 300000, 7777777]) {
      const rows = split(totalMinor, { splitType: 'equal', participants, currency: 'INR' });
      expect(sum(rows)).toBe(totalMinor);
    }
  });

  test('ignores client-supplied shares for an equal split (server is authoritative)', () => {
    const rows = split(300000, {
      splitType: 'equal',
      participants: [
        { userId: 'a', share: '999999.00' },
        { userId: 'b' },
        { userId: 'c' },
      ],
      currency: 'INR',
    });
    expect(rows.map((row) => row.shareMinor)).toEqual([100000, 100000, 100000]);
  });

  test('unknown split type', () => {
    expect(() => split(100, { splitType: 'vibes', participants: [{ userId: 'a' }] })).toThrow(/Unsupported split/);
  });

  test('money.toMinor and splitter agree on precision', () => {
    expect(() =>
      split(money.toMinor('10.00', 'INR'), {
        splitType: 'exact',
        participants: [{ userId: 'a', share: '3.333' }],
        currency: 'INR',
      }),
    ).toThrow(/decimal place/);
  });
});
