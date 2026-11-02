'use strict';

/** Post-condition checks shared by every settlement solver. */

const { MoneyError, assertMinor } = require('../utils/money');

/**
 * Verifies a settlement plan against the balances it was built from:
 *  - every amount is a positive integer minor unit
 *  - nobody pays themselves
 *  - each debtor pays exactly their outstanding amount, each creditor receives exactly theirs
 *  - money is conserved (Σ out === Σ in === Σ positive balances)
 * Throws `SETTLEMENT_INVALID` describing the first violation found.
 */
function validateSettlement(balances, transactions) {
  const problems = [];
  const paid = new Map();
  const received = new Map();

  if (!Array.isArray(transactions)) {
    throw new MoneyError('SETTLEMENT_INVALID', 'Settlement plan must be an array');
  }

  for (const [index, transaction] of transactions.entries()) {
    const from = String(transaction.fromId ?? transaction.from ?? '');
    const to = String(transaction.toId ?? transaction.to ?? '');
    const amountMinor = transaction.amountMinor;

    if (!Number.isInteger(amountMinor)) {
      problems.push(`#${index} amount ${amountMinor} is not an integer minor unit`);
      continue;
    }
    if (amountMinor <= 0) problems.push(`#${index} amount must be positive, got ${amountMinor}`);
    if (!from || !to) problems.push(`#${index} is missing a payer or receiver`);
    if (from && from === to) problems.push(`#${index} is a self-transaction for ${from}`);

    paid.set(from, (paid.get(from) || 0) + amountMinor);
    received.set(to, (received.get(to) || 0) + amountMinor);
  }

  let expectedTotal = 0;
  for (const balance of balances) {
    assertMinor(balance.netMinor);
    const userId = String(balance.userId);
    const outgoing = paid.get(userId) || 0;
    const incoming = received.get(userId) || 0;
    if (balance.netMinor < 0) {
      expectedTotal += -balance.netMinor;
      if (outgoing !== -balance.netMinor) {
        problems.push(`${userId} owes ${-balance.netMinor} but the plan makes them pay ${outgoing}`);
      }
      if (incoming !== 0) problems.push(`${userId} is a debtor yet the plan also credits them ${incoming}`);
    } else if (balance.netMinor > 0) {
      if (incoming !== balance.netMinor) {
        problems.push(`${userId} is owed ${balance.netMinor} but the plan pays them ${incoming}`);
      }
      if (outgoing !== 0) problems.push(`${userId} is a creditor yet the plan makes them pay ${outgoing}`);
    } else if (outgoing !== 0 || incoming !== 0) {
      problems.push(`${userId} has a zero balance but appears in the plan`);
    }
  }

  const totalOut = [...paid.values()].reduce((sum, value) => sum + value, 0);
  const totalIn = [...received.values()].reduce((sum, value) => sum + value, 0);
  if (totalOut !== totalIn) problems.push(`plan moves ${totalOut} out but ${totalIn} in`);
  if (totalIn !== expectedTotal) problems.push(`plan moves ${totalIn} but ${expectedTotal} is outstanding`);

  if (problems.length) {
    throw new MoneyError('SETTLEMENT_INVALID', `Invalid settlement plan: ${problems.join('; ')}`, { problems });
  }

  return { valid: true, transactionCount: transactions.length, amountMinor: totalIn };
}

module.exports = { validateSettlement };
