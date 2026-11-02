'use strict';

/**
 * Derives member balances from the expense ledger and completed settlements.
 *
 * There is no stored balance: this pure function is the single place a net position is
 * computed, which is what lets an edited or deleted expense rebuild the ledger correctly.
 */

const { MoneyError, assertMinor } = require('../utils/money');

const COMPLETED = 'completed';

const COMPLETION_STATUSES = new Set(['completed']);

function toId(value) {
  if (value == null) return null;
  return String(value);
}

/**
 * @param {object}   input
 * @param {string[]} input.memberIds     active group members
 * @param {Array}    input.expenses      [{ paidBy, groupAmountMinor|totalMinor, participants:[{userId, shareMinor}], isDeleted }]
 * @param {Array}    input.settlements   [{ payerId, receiverId, amountMinor, status }]
 * @param {boolean}  [input.strict=true] throw when the ledger references a non-member
 * @returns {Array} [{ userId, netMinor, paidMinor, consumedMinor, settledInMinor, settledOutMinor, status }]
 */
function computeNetBalances({ memberIds = [], expenses = [], settlements = [], strict = true } = {}) {
  const members = new Set(memberIds.map(toId).filter(Boolean));
  const ledger = new Map();

  const ensure = (userId) => {
    if (!members.has(userId)) {
      if (strict) {
        throw new MoneyError('LEDGER_MEMBER_MISMATCH', `Ledger references ${userId} who is not an active member`);
      }
      members.add(userId);
    }
    if (!ledger.has(userId)) {
      ledger.set(userId, {
        userId,
        paidMinor: 0,
        consumedMinor: 0,
        settledInMinor: 0,
        settledOutMinor: 0,
        netMinor: 0,
      });
    }
    return ledger.get(userId);
  };

  for (const userId of members) ensure(userId);

  for (const expense of expenses) {
    if (expense.isDeleted) continue;
    const totalMinor = assertMinor(expense.groupAmountMinor ?? expense.totalMinor);
    const payer = ensure(toId(expense.paidBy));
    payer.paidMinor += totalMinor;

    const participants = expense.participants || [];
    if (participants.length === 0) {
      throw new MoneyError('MALFORMED_EXPENSE', `Expense ${expense.id || ''} has no participants`);
    }
    let shareSum = 0;
    for (const participant of participants) {
      const row = ensure(toId(participant.userId));
      const share = assertMinor(participant.shareMinor);
      row.consumedMinor += share;
      shareSum += share;
    }
    if (shareSum !== totalMinor) {
      throw new MoneyError(
        'MALFORMED_EXPENSE',
        `Expense ${expense.id || ''} shares (${shareSum}) do not sum to its total (${totalMinor})`,
      );
    }
  }

  for (const settlement of settlements) {
    if (settlement.status !== COMPLETED) continue;
    const amountMinor = assertMinor(settlement.amountMinor);
    if (amountMinor <= 0) {
      throw new MoneyError('MALFORMED_SETTLEMENT', `Settlement ${settlement.id || ''} must be a positive amount`);
    }
    const payer = ensure(toId(settlement.payerId));
    const receiver = ensure(toId(settlement.receiverId));
    if (payer.userId === receiver.userId) {
      throw new MoneyError('MALFORMED_SETTLEMENT', `Settlement ${settlement.id || ''} pays itself`);
    }
    payer.settledOutMinor += amountMinor;
    receiver.settledInMinor += amountMinor;
  }

  const balances = [...ledger.values()].map((row) => {
    // Receiving a repayment reduces what you are owed; making one reduces what you owe.
    const netMinor = row.paidMinor - row.consumedMinor - row.settledInMinor + row.settledOutMinor;
    assertMinor(netMinor);
    return {
      ...row,
      netMinor,
      status: netMinor > 0 ? 'creditor' : netMinor < 0 ? 'debtor' : 'settled',
    };
  });

  return balances.sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

/** Sum of every net balance. The group invariant is that this is exactly zero. */
function totalNet(balances) {
  return balances.reduce((sum, row) => sum + row.netMinor, 0);
}

/**
 * Naive pairwise debts (who owes whom, before optimisation) — used to show the user how
 * many direct IOUs exist compared with the optimised plan.
 */
function computePairwiseDebts({ memberIds = [], expenses = [], settlements = [] } = {}) {
  const debts = new Map();
  const add = (from, to, amount) => {
    if (from === to || amount === 0) return;
    const key = `${from}->${to}`;
    debts.set(key, (debts.get(key) || 0) + amount);
  };

  for (const expense of expenses) {
    if (expense.isDeleted) continue;
    const totalMinor = expense.groupAmountMinor ?? expense.totalMinor;
    for (const participant of expense.participants || []) {
      const share = participant.shareMinor;
      const payerIsParticipant = toId(participant.userId) === toId(expense.paidBy);
      if (payerIsParticipant) continue;
      add(toId(participant.userId), toId(expense.paidBy), share);
    }
    // A payer who is also a participant has already netted their own share out.
    void totalMinor;
  }

  for (const settlement of settlements) {
    if (settlement.status !== COMPLETED) continue;
    add(toId(settlement.receiverId), toId(settlement.payerId), settlement.amountMinor);
  }

  const rows = [...debts.entries()].map(([key, amountMinor]) => {
    const [from, to] = key.split('->');
    // Cancel opposite-direction IOUs down to one net line per pair.
    const reverseKey = `${to}->${from}`;
    const reverse = debts.get(reverseKey) || 0;
    const net = amountMinor - reverse;
    if (net <= 0) return null;
    return { from, to, amountMinor: net };
  });

  const seen = new Set();
  const deduped = [];
  for (const row of rows.filter(Boolean)) {
    const pairKey = [row.from, row.to].sort().join('~');
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);
    deduped.push(row);
  }
  void memberIds;
  return deduped.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : 1));
}

/**
 * Fold per-member totals into the creditor / debtor lists a settlement solver consumes.
 * Zero balances are dropped (the solver must never emit a 0-amount transfer) but the
 * caller keeps them for display.
 */
function toSolverInput(balances) {
  return balances
    .filter((row) => row.netMinor !== 0)
    .map((row) => ({ userId: row.userId, netMinor: row.netMinor }));
}

module.exports = {
  computeNetBalances,
  computePairwiseDebts,
  totalNet,
  toSolverInput,
  COMPLETED,
  COMPLETION_STATUSES,
};
