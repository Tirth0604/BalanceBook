'use strict';

/**
 * Pure split allocation. No I/O, no mongoose, no floats in the result path.
 *
 * Allocation uses the largest-remainder (Hamilton) method over integer minor
 * units, with a deterministic tie-break on the participant id, so re-running a
 * split on the same ledger always reproduces the same paisa placement.
 */

const { MoneyError, assertMinor, toMinor } = require('../utils/money');

const HUNDREDTH = 100; // percentage values are carried as integer hundredths

function normaliseParticipants(participants) {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new MoneyError('NO_PARTICIPANTS', 'An expense needs at least one participant');
  }
  const seen = new Set();
  for (const participant of participants) {
    const id = participant && (participant.userId != null ? String(participant.userId) : null);
    if (!id) throw new MoneyError('INVALID_PARTICIPANT', 'Every participant needs a userId');
    if (seen.has(id)) throw new MoneyError('DUPLICATE_PARTICIPANT', `Participant ${id} appears more than once`);
    seen.add(id);
  }
  return participants.map((participant) => ({ ...participant, userId: String(participant.userId) }));
}

/**
 * @param {number} totalMinor  integer total, must be >= 0
 * @param {Array}  weighted    [{ userId, weight }] integer weights, all > 0
 * @returns {Array} [{ userId, shareMinor, weight }] summing exactly to totalMinor
 */
function allocateByLargestRemainder(totalMinor, weighted) {
  assertMinor(totalMinor);
  if (totalMinor < 0) throw new MoneyError('INVALID_AMOUNT', 'Total amount cannot be negative');

  const totalWeight = weighted.reduce((sum, item) => {
    if (!Number.isInteger(item.weight) || item.weight <= 0) {
      throw new MoneyError('INVALID_WEIGHT', `Weight for ${item.userId} must be a positive integer`);
    }
    return sum + item.weight;
  }, 0);

  const rows = weighted.map((item) => {
    const product = totalMinor * item.weight;
    // Keep the division in integers: quotient + remainder is exact for our range.
    const base = Math.floor(product / totalWeight);
    const residue = product - base * totalWeight;
    return { ...item, shareMinor: base, residue };
  });

  let allocated = rows.reduce((sum, row) => sum + row.shareMinor, 0);
  let outstanding = totalMinor - allocated;
  if (outstanding > rows.length) {
    // Defensive: cannot happen while weights are positive, but never emit a wrong ledger.
    throw new MoneyError('ALLOCATION_ERROR', 'Remainder exceeded the participant count');
  }

  const order = [...rows].sort((a, b) => {
    if (b.residue !== a.residue) return b.residue - a.residue;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });

  for (const row of order) {
    if (outstanding <= 0) break;
    row.shareMinor += 1;
    outstanding -= 1;
  }

  allocated = rows.reduce((sum, row) => sum + row.shareMinor, 0);
  if (allocated !== totalMinor) {
    throw new MoneyError('ALLOCATION_ERROR', `Allocated ${allocated} does not equal total ${totalMinor}`);
  }

  return rows.map((row) => ({ userId: row.userId, shareMinor: row.shareMinor, weight: row.weight }));
}

/** Equal split: the server always recomputes shares; client-sent shares are ignored. */
function splitEqual(totalMinor, participantIds) {
  const list = normaliseParticipants(
    participantIds.map((userId) => ({ userId })),
  );
  return allocateByLargestRemainder(
    totalMinor,
    list.map((item) => ({ userId: item.userId, weight: 1 })),
  );
}

/** Percentage split: percentages carry at most 2 decimals and must sum to exactly 100. */
function splitPercentage(totalMinor, entries) {
  const list = normaliseParticipants(entries);
  const hundredths = list.map((item) => {
    const raw = item.percentage;
    const asText = typeof raw === 'string' ? raw : String(raw);
    if (raw == null || asText === '' || !/^-?\d*(\.\d{1,2})?$/.test(asText)) {
      throw new MoneyError('PERCENTAGE_INVALID', `Percentage for ${item.userId} must have at most 2 decimals`);
    }
    const value = Number(asText);
    if (!Number.isFinite(value) || value <= 0) {
      throw new MoneyError('PERCENTAGE_INVALID', `Percentage for ${item.userId} must be greater than 0`);
    }
    return { userId: item.userId, weight: Math.round(value * HUNDREDTH) };
  });

  const sum = hundredths.reduce((total, item) => total + item.weight, 0);
  if (sum !== 100 * HUNDREDTH) {
    throw new MoneyError(
      'PERCENTAGE_SUM_INVALID',
      `Percentages must total exactly 100.00, got ${(sum / HUNDREDTH).toFixed(2)}`,
    );
  }

  return allocateByLargestRemainder(totalMinor, hundredths).map((row) => ({
    ...row,
    percentage: Number((row.weight / HUNDREDTH).toFixed(2)),
  }));
}

/**
 * Exact split: no redistribution. The caller supplies per-person decimal strings and
 * the sum must match the total to the paisa, otherwise the expense is rejected.
 */
function splitExact(totalMinor, entries, currencyCode) {
  const list = normaliseParticipants(entries);
  const rows = list.map((item) => {
    const source = item.shareMinor != null ? item.shareMinor : item.share;
    const shareMinor =
      item.shareMinor != null && Number.isInteger(item.shareMinor)
        ? assertMinor(item.shareMinor)
        : toMinor(source, currencyCode);
    if (shareMinor < 0) {
      throw new MoneyError('SHARE_INVALID', `Share for ${item.userId} cannot be negative`);
    }
    return { userId: item.userId, shareMinor };
  });

  const sum = rows.reduce((total, row) => total + row.shareMinor, 0);
  if (sum !== totalMinor) {
    throw new MoneyError(
      'SHARE_SUM_MISMATCH',
      `Shares total ${sum} minor units but the expense is ${totalMinor} minor units`,
      { expectedMinor: totalMinor, receivedMinor: sum, differenceMinor: totalMinor - sum },
    );
  }
  return rows;
}

function split(totalMinor, { splitType, participants, currency: currencyCode }) {
  const type = String(splitType || '').toLowerCase();
  if (type === 'equal') {
    return splitEqual(
      totalMinor,
      normaliseParticipants(participants).map((item) => item.userId),
    );
  }
  if (type === 'percentage') return splitPercentage(totalMinor, participants);
  if (type === 'exact') return splitExact(totalMinor, participants, currencyCode);
  throw new MoneyError('SPLIT_TYPE_INVALID', `Unsupported split type: ${splitType}`);
}

module.exports = {
  split,
  splitEqual,
  splitPercentage,
  splitExact,
  allocateByLargestRemainder,
  normaliseParticipants,
};
