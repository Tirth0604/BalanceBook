'use strict';

const money = require('../../src/utils/money');
const { convert, sameCurrency } = require('../../src/algorithms/currency');

describe('money: integer minor units', () => {
  test('parses decimal strings into paise without float drift', () => {
    expect(money.toMinor('3000.00', 'INR')).toBe(300000);
    expect(money.toMinor('0.01', 'INR')).toBe(1);
    expect(money.toMinor('10', 'INR')).toBe(1000);
    expect(money.toMinor('1,234.56', 'USD')).toBe(123456);
    expect(money.toMinor('-45.50', 'INR')).toBe(-4550);
    expect(money.toMinor('0', 'INR')).toBe(0);
    expect(Object.is(money.toMinor('-0.00', 'INR'), -0)).toBe(false);
  });

  test('honours zero-decimal currencies', () => {
    expect(money.toMinor('1000', 'JPY')).toBe(1000);
    expect(money.fromMinor(1000, 'JPY')).toBe('1000');
  });

  test('rejects amounts more precise than the currency allows', () => {
    expect(() => money.toMinor('10.005', 'INR')).toThrow(money.MoneyError);
    try {
      money.toMinor('10.005', 'INR');
    } catch (error) {
      expect(error.code).toBe('MONEY_PRECISION');
    }
  });

  test('rejects junk input rather than coercing it', () => {
    for (const bad of ['', '   ', 'abc', '12.3.4', 'NaN', '1e5', null, undefined]) {
      expect(() => money.toMinor(bad, 'INR')).toThrow(/Amount/);
    }
    expect(() => money.toMinor(10.005, 'INR')).toThrow(/MONEY_PRECISION|cannot be represented/);
    expect(() => money.toMinor(Infinity, 'INR')).toThrow(/finite/);
  });

  test('round-trips exactly', () => {
    for (const value of ['0.01', '9.99', '100.00', '1234567.89', '-0.10']) {
      expect(money.fromMinor(money.toMinor(value, 'INR'), 'INR')).toBe(value);
    }
  });

  test('formats for display', () => {
    expect(money.format(300000, 'INR')).toBe('₹3,000.00');
    expect(money.format(-100500, 'INR')).toBe('-₹1,005.00');
    expect(money.format(300000, 'INR', { signed: true })).toBe('+₹3,000.00');
    expect(money.format(-100500, 'INR', { signed: true })).toBe('-₹1,005.00');
    expect(money.format(0, 'INR')).toBe('₹0.00');
    expect(money.formatCompact(4500000, 'USD')).toBe('$45K');
  });

  test('unknown currency is a hard error', () => {
    expect(() => money.toMinor('10', 'XYZ')).toThrow(/Unsupported currency/);
    expect(() => money.currency('inr')).not.toThrow(); // case-insensitive
  });

  test('guards the safe integer range', () => {
    expect(() => money.toMinor('99999999999999999999', 'INR')).toThrow(/exceeds/);
    expect(() => money.assertMinor(3.5)).toThrow(/integer minor units/);
  });

  test('add() keeps everything integral', () => {
    expect(money.add(1, 2, 3)).toBe(6);
    expect(() => money.add(1, 2.5)).toThrow();
  });
});

describe('currency conversion', () => {
  test('same currency is an exact identity', () => {
    expect(convert(123456, 'INR', 'INR', 1)).toBe(123456);
    expect(sameCurrency('inr', 'INR')).toBe(true);
  });

  test('converts with a snapshot rate and rounds deterministically', () => {
    expect(convert(100000, 'USD', 'INR', 83.5)).toBe(8350000);
    expect(convert(8350000, 'INR', 'USD', 1 / 83.5)).toBeCloseTo(100000, 0);
    // JPY has 0 decimals, USD 2: 1000 JPY -> minor units must be scaled
    expect(convert(1000, 'JPY', 'USD', 0.0068)).toBe(680);
  });

  test('rejects absurd rates', () => {
    expect(() => convert(100, 'USD', 'INR', 0)).toThrow(/positive/);
    expect(() => convert(100, 'USD', 'INR', -2)).toThrow(/positive/);
    expect(() => convert(100, 'USD', 'INR', NaN)).toThrow(/positive/);
    expect(() => convert(100, 'USD', 'XXX')).toThrow(/Unsupported currency/);
  });
});
