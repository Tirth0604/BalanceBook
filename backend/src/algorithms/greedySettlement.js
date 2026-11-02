'use strict';

/**
 * Greedy creditor/debtor matching.
 *
 * Always produces a valid plan in at most n-1 transfers and runs in O(n log n).
 * It does not guarantee the globally minimum transaction count — that is what
 * `minimumSettlement.js` is for; greedy is the reference and the large-group fallback.
 */

const { validateSettlement } = require('./settlementValidator');

function asRows(balances) {
  return (balances || [])
    .filter((row) => Number.isInteger(row.netMinor) && row.netMinor !== 0)
    .map((row) => ({ userId: String(row.userId), netMinor: row.netMinor }));
}

function sortDesc(rows) {
  return rows.sort((a, b) => {
    if (b.magnitude !== a.magnitude) return b.magnitude - a.magnitude;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });
}

/**
 * @param {Array} balances [{ userId, netMinor }] — assumed to sum to zero
 * @returns {Array} [{ fromId, toId, amountMinor }]
 */
function matchBalances(balances) {
  const rows = asRows(balances);

  const debtors = sortDesc(
    rows.filter((row) => row.netMinor < 0).map((row) => ({ userId: row.userId, magnitude: -row.netMinor })),
  );
  const creditors = sortDesc(
    rows.filter((row) => row.netMinor > 0).map((row) => ({ userId: row.userId, magnitude: row.netMinor })),
  );

  const totalDebt = debtors.reduce((sum, row) => sum + row.magnitude, 0);
  const totalCredit = creditors.reduce((sum, row) => sum + row.magnitude, 0);
  if (totalDebt !== totalCredit) {
    // A group whose balances do not net to zero is a data bug, not an optimisation input.
    throw Object.assign(
      new Error(`Group does not net to zero: debt ${totalDebt} vs credit ${totalCredit}`),
      { code: 'BALANCES_NOT_BALANCED' },
    );
  }

  const transactions = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].magnitude, creditors[j].magnitude);
    if (amount > 0) transactions.push({ fromId: debtors[i].userId, toId: creditors[j].userId, amountMinor: amount });
    debtors[i].magnitude -= amount;
    creditors[j].magnitude -= amount;
    if (debtors[i].magnitude === 0) i += 1;
    if (creditors[j].magnitude === 0) j += 1;
  }

  return transactions;
}

/**
 * Greedy settlement for a group.
 * @param {Array} balances [{ userId, netMinor }]
 * @returns {{ algorithm:'greedy', transactions, transactionCount, amountMinor, isSettledUp }}
 */
function greedySettlement(balances) {
  const rows = asRows(balances);
  const transactions = matchBalances(rows);
  if (transactions.length) {
    validateSettlement(
      rows.map((row) => ({ userId: row.userId, netMinor: row.netMinor })),
      transactions,
    );
  }
  return {
    algorithm: 'greedy',
    transactions,
    transactionCount: transactions.length,
    amountMinor: transactions.reduce((sum, row) => sum + row.amountMinor, 0),
    isSettledUp: transactions.length === 0,
  };
}

module.exports = { greedySettlement, matchBalances };
