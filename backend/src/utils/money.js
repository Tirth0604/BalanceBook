'use strict';

/**
 * Integer minor-unit money handling. Every monetary value in BalanceBook is an
 * amount of minor units (paise / cents) held in a JS safe integer.
 */

const CURRENCIES = {
  INR: { decimals: 2, symbol: '₹', locale: 'en-IN', code: 'INR' },
  USD: { decimals: 2, symbol: '$', locale: 'en-US', code: 'USD' },
  EUR: { decimals: 2, symbol: '€', locale: 'de-DE', code: 'EUR' },
  GBP: { decimals: 2, symbol: '£', locale: 'en-GB', code: 'GBP' },
  AED: { decimals: 2, symbol: 'AED', locale: 'en-AE', code: 'AED' },
  SGD: { decimals: 2, symbol: 'S$', locale: 'en-SG', code: 'SGD' },
  AUD: { decimals: 2, symbol: 'A$', locale: 'en-AU', code: 'AUD' },
  CAD: { decimals: 2, symbol: 'C$', locale: 'en-CA', code: 'CAD' },
  CHF: { decimals: 2, symbol: 'CHF', locale: 'de-CH', code: 'CHF' },
  SAR: { decimals: 2, symbol: 'SAR', locale: 'en-SA', code: 'SAR' },
  QAR: { decimals: 2, symbol: 'QR', locale: 'en-QA', code: 'QAR' },
  JPY: { decimals: 0, symbol: '¥', locale: 'ja-JP', code: 'JPY' },
};

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

class MoneyError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'MoneyError';
    this.code = code;
    if (details) this.details = details;
  }
}

function currency(currencyCode) {
  const code = String(currencyCode || '').toUpperCase();
  const meta = CURRENCIES[code];
  if (!meta) throw new MoneyError('UNKNOWN_CURRENCY', `Unsupported currency: ${currencyCode}`);
  return meta;
}

/**
 * Decimal string | number -> integer minor units.
 * Rejects more fractional digits than the currency allows rather than silently
 * rounding user-entered amounts; a ₹10.005 expense is a data error, not a rounding case.
 */
function toMinor(amount, currencyCode) {
  const meta = currency(currencyCode);
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) throw new MoneyError('INVALID_AMOUNT', 'Amount must be a finite number');
    if (Number.isInteger(amount) && Math.abs(amount) < 1e15) {
      return toMinor(String(amount), currencyCode);
    }
    // Only accept floats that are already exact at this currency's precision.
    const asFixed = amount.toFixed(meta.decimals);
    if (Math.abs(Number(asFixed) - amount) > Number.EPSILON * Math.abs(amount)) {
      throw new MoneyError('MONEY_PRECISION', `Amount ${amount} cannot be represented exactly in ${meta.code}`);
    }
    return toMinor(asFixed, meta.code);
  }

  const raw = String(amount == null ? '' : amount).trim().replace(/,/g, '').replace(/\s/g, '');
  if (raw === '' || raw === '-' || raw === '+') throw new MoneyError('INVALID_AMOUNT', 'Amount is required');
  if (!/^[+-]?\d*(\.\d*)?$/.test(raw)) throw new MoneyError('INVALID_AMOUNT', `Amount is not a decimal number: ${amount}`);

  const negative = raw.startsWith('-');
  const unsigned = raw.replace(/^[+-]/, '');
  const [wholePart = '', fracPart = ''] = unsigned.split('.');
  if (fracPart.length > meta.decimals) {
    throw new MoneyError(
      'MONEY_PRECISION',
      `${meta.code} supports at most ${meta.decimals} decimal place(s), got "${amount}"`,
    );
  }
  const frac = fracPart.padEnd(meta.decimals, '0');
  const digits = `${wholePart || '0'}${frac}`;
  const minor = Number(digits);
  if (!Number.isInteger(minor) || Math.abs(minor) > MAX_SAFE) {
    throw new MoneyError('AMOUNT_OUT_OF_RANGE', `Amount ${amount} ${meta.code} exceeds the supported range`);
  }
  const signed = negative ? -minor : minor;
  if (Object.is(signed, -0)) return 0;
  return signed;
}

/** Integer minor units -> plain decimal string, always at the currency's precision. */
function fromMinor(minorAmount, currencyCode) {
  const meta = currency(currencyCode);
  const minor = assertMinor(minorAmount);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  if (meta.decimals === 0) return `${negative ? '-' : ''}${abs}`;
  const text = String(abs).padStart(meta.decimals + 1, '0');
  const whole = text.slice(0, text.length - meta.decimals);
  const frac = text.slice(text.length - meta.decimals);
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

function assertMinor(minorAmount) {
  if (typeof minorAmount !== 'number' || !Number.isInteger(minorAmount)) {
    throw new MoneyError('INVALID_MINOR', `Expected integer minor units, got ${JSON.stringify(minorAmount)}`);
  }
  if (Math.abs(minorAmount) > MAX_SAFE) {
    throw new MoneyError('AMOUNT_OUT_OF_RANGE', `Minor amount ${minorAmount} exceeds the safe integer range`);
  }
  return minorAmount;
}

/** Grouped display value, e.g. 300000 minor INR -> "₹3,000.00". */
function format(minorAmount, currencyCode, { signed = false, hideSymbol = false } = {}) {
  const meta = currency(currencyCode);
  const minor = assertMinor(minorAmount);
  const formatted = new Intl.NumberFormat(meta.locale, {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
    useGrouping: true,
  }).format(Math.abs(Number(fromMinor(minor, meta.code))));
  const prefix = hideSymbol ? '' : `${meta.symbol}${meta.symbol.length > 2 ? ' ' : ''}`;
  const sign = minor < 0 ? '-' : signed && minor > 0 ? '+' : '';
  return `${sign}${prefix}${formatted}`;
}

/** Compact display for KPI tiles only; tables always keep full precision. */
function formatCompact(minorAmount, currencyCode) {
  const meta = currency(currencyCode);
  const value = Number(fromMinor(minorAmount, meta.code));
  const formatted = new Intl.NumberFormat(meta.locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    Math.abs(value),
  );
  const sign = value < 0 ? '-' : '';
  return `${sign}${meta.symbol}${formatted}`;
}

function isValidAmountString(amount, currencyCode) {
  try {
    toMinor(amount, currencyCode);
    return true;
  } catch {
    return false;
  }
}

function add() {
  return [...arguments].reduce((sum, value) => {
    assertMinor(value);
    const next = sum + value;
    if (Math.abs(next) > MAX_SAFE) throw new MoneyError('AMOUNT_OUT_OF_RANGE', 'Sum exceeded the safe integer range');
    return next;
  }, 0);
}

module.exports = {
  CURRENCIES,
  MoneyError,
  currency,
  toMinor,
  fromMinor,
  assertMinor,
  format,
  formatCompact,
  isValidAmountString,
  add,
  MAX_SAFE,
};
