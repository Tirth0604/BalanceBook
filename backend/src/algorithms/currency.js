'use strict';

/**
 * Currency conversion for the ledger. A rate is captured at write time and stored on the
 * expense, so historical balances never drift when rates change later.
 */

const { MoneyError, assertMinor, currency } = require('../utils/money');

/**
 * Convert integer minor units of one currency into integer minor units of another.
 * `rate` means "1 unit of `from` = rate units of `to`".
 */
function convert(minorAmount, from, to, rate = 1) {
  assertMinor(minorAmount);
  const source = currency(from);
  const target = currency(to);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new MoneyError('INVALID_RATE', `Exchange rate must be a positive finite number, got ${rate}`);
  }
  if (source.code === target.code && rate === 1) return minorAmount;

  const scale = 10 ** (target.decimals - source.decimals);
  const converted = minorAmount * rate * scale;
  if (Math.abs(converted) > Number.MAX_SAFE_INTEGER) {
    throw new MoneyError('AMOUNT_OUT_OF_RANGE', `Converted amount ${converted} exceeds the safe integer range`);
  }
  // Round half away from zero, deterministically, then re-assert integrality.
  const rounded = Math.sign(converted) * Math.round(Math.abs(converted));
  assertMinor(rounded);
  return rounded;
}

/** Identity-safe helper used when a group and expense share one currency. */
function sameCurrency(a, b) {
  return String(a || '').toUpperCase() === String(b || '').toUpperCase();
}

module.exports = { convert, sameCurrency };
