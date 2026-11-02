'use strict';

/**
 * Minimum-transaction settlement solver.
 *
 * Key result: if a group's non-zero balances split into `p` independent zero-sum
 * subsets covering `n` people, the whole group settles in exactly `n - p` transfers,
 * and no plan can do better. So the problem reduces to maximising the number of
 * zero-sum parts, which is a subset-sum partition solved with bitmask DP
 * (O(3^n) worst case), then each part is settled internally with the greedy matcher
 * (provably optimal once a part has no proper zero-sum sub-partition).
 *
 * Beyond `maxSize` participants the solver falls back to greedy and reports why, so the
 * API never blocks on an exponential search for a 30-person flat.
 */

const { greedySettlement, matchBalances } = require('./greedySettlement');
const { validateSettlement } = require('./settlementValidator');

const DEFAULT_MAX_SIZE = 12;
const CACHE_LIMIT = 64;
const cache = new Map();

function fingerprint(rows) {
  return rows
    .map((row) => `${row.userId}:${row.netMinor}`)
    .sort()
    .join('|');
}

function memoised(key, compute) {
  if (cache.has(key)) {
    const cached = cache.get(key);
    // Refresh insertion order so hot ledgers stay resident.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const value = compute();
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return value;
}

/** Find the partition of `rows` into the largest number of disjoint zero-sum groups. */
function findZeroSumPartition(rows) {
  const n = rows.length;
  if (n === 0) return [];

  // Float64 keeps exact integer arithmetic up to 2^53, i.e. the whole minor-unit range
  // the money layer allows; Int32 would silently overflow a large group ledger.
  const sums = new Float64Array(1 << n);

  for (let mask = 1; mask < 1 << n; mask += 1) {
    const lowBit = mask & -mask;
    const index = Math.log2(lowBit);
    const rest = mask ^ lowBit;
    sums[mask] = sums[rest] + rows[index].netMinor;
  }

  const NEG = -1;
  const dp = new Int32Array(1 << n).fill(NEG);
  const choice = new Int32Array(1 << n).fill(0);
  dp[0] = 0;

  for (let mask = 1; mask < 1 << n; mask += 1) {
    if (sums[mask] !== 0) {
      // Only zero-sum masks can be fully partitioned; skip to keep the DP honest.
      continue;
    }
    const lowBit = mask & -mask;
    let best = NEG;
    let bestSub = 0;
    // Enumerate submasks that include the lowest remaining member (each partition is
    // considered once, which keeps this at O(3^n) rather than O(4^n)).
    for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
      if ((sub & lowBit) === 0) continue;
      if (sums[sub] !== 0) continue;
      const remainder = mask ^ sub;
      if (dp[remainder] === NEG) continue;
      const candidate = 1 + dp[remainder];
      if (candidate > best) {
        best = candidate;
        bestSub = sub;
      }
    }
    dp[mask] = best;
    choice[mask] = bestSub;
  }

  const full = (1 << n) - 1;
  if (dp[full] === NEG) {
    // Should not happen for a balanced ledger: the whole set is itself zero-sum.
    return [rows.map((_, index) => index)];
  }

  const parts = [];
  let remaining = full;
  while (remaining !== 0) {
    const sub = choice[remaining];
    const part = [];
    for (let index = 0; index < n; index += 1) {
      if (sub & (1 << index)) part.push(index);
    }
    parts.push(part);
    remaining ^= sub;
  }
  return parts;
}

/**
 * @param {Array}  balances  [{ userId, netMinor }]
 * @param {object} options   { maxSize = 12 }
 * @returns {{ algorithm, transactions, transactionCount, amountMinor, isSettledUp,
 *             parts, maxSize, fallbackReason? }}
 */
function minimumSettlement(balances, options = {}) {
  const maxSize = Number.isInteger(options.maxSize) && options.maxSize > 0 ? options.maxSize : DEFAULT_MAX_SIZE;
  const rows = (balances || [])
    .filter((row) => Number.isInteger(row.netMinor) && row.netMinor !== 0)
    .map((row) => ({ userId: String(row.userId), netMinor: row.netMinor }));

  if (rows.length === 0) {
    return {
      algorithm: 'minimum',
      transactions: [],
      transactionCount: 0,
      amountMinor: 0,
      isSettledUp: true,
      parts: [],
      maxSize,
    };
  }

  const totalNet = rows.reduce((sum, row) => sum + row.netMinor, 0);
  if (totalNet !== 0) {
    throw Object.assign(
      new Error(`Group does not net to zero (sum ${totalNet}); refusing to optimise a broken ledger`),
      { code: 'BALANCES_NOT_BALANCED' },
    );
  }

  if (rows.length > maxSize) {
    const greedy = greedySettlement(rows);
    return {
      ...greedy,
      algorithm: 'greedy',
      maxSize,
      fallbackReason: 'GROUP_TOO_LARGE',
      parts: null,
    };
  }

  const plan = memoised(fingerprint(rows), () => {
    const parts = findZeroSumPartition(rows);
    const transactions = [];
    for (const part of parts) {
      const partRows = part.map((index) => rows[index]);
      for (const transaction of matchBalances(partRows)) transactions.push(transaction);
    }
    return {
      parts: parts.map((part) => part.map((index) => rows[index].userId)),
      transactions: transactions.sort((a, b) =>
        a.fromId === b.fromId
          ? a.toId < b.toId
            ? -1
            : a.toId > b.toId
              ? 1
              : 0
          : a.fromId < b.fromId
            ? -1
            : 1,
      ),
    };
  });

  validateSettlement(rows, plan.transactions);

  return {
    algorithm: 'minimum',
    transactions: plan.transactions,
    transactionCount: plan.transactions.length,
    amountMinor: plan.transactions.reduce((sum, row) => sum + row.amountMinor, 0),
    isSettledUp: plan.transactions.length === 0,
    parts: plan.parts,
    theoreticalMinimum: rows.length - plan.parts.length,
    maxSize,
  };
}

module.exports = { minimumSettlement, findZeroSumPartition, DEFAULT_MAX_SIZE };
