import { describe, expect, it } from 'vitest'
import {
  MoneyError,
  fromMinor,
  previewEqualSplit,
  previewPercentageSplit,
  previewSplit,
  format,
  formatSigned,
  formatCompact,
  toMinor,
  validateExactShares,
} from '../money'

describe('toMinor / fromMinor', () => {
  it('converts decimal strings to integer paise', () => {
    expect(toMinor('3000.00', 'INR')).toBe(300000)
    expect(toMinor('0.01', 'INR')).toBe(1)
    expect(toMinor('-12.34', 'USD')).toBe(-1234)
    expect(toMinor('100', 'INR')).toBe(10000)
    expect(toMinor('.50', 'INR')).toBe(50)
  })

  it('throws MONEY_PRECISION beyond the currency decimals (never rounds input)', () => {
    expect(() => toMinor('3000.007', 'INR')).toThrowError(MoneyError)
    try {
      toMinor('1.234', 'INR')
    } catch (e) {
      expect(e.code).toBe('MONEY_PRECISION')
    }
  })

  it('rejects garbage and unknown currencies', () => {
    expect(() => toMinor('abc', 'INR')).toThrow()
    expect(() => toMinor('', 'INR')).toThrow()
    expect(() => toMinor('1.00', 'XXX')).toThrow(/currency/i)
  })

  it('fromMinor pads to 2 decimals', () => {
    expect(fromMinor(300000, 'INR')).toBe('3000.00')
    expect(fromMinor(-1, 'INR')).toBe('-0.01')
    expect(fromMinor(5, 'INR')).toBe('0.05')
  })
})

describe('format / formatSigned / formatCompact', () => {
  it('formats with the currency symbol and locale grouping', () => {
    expect(format(300000, 'INR')).toBe('₹3,000.00')
    expect(format(123456789, 'INR')).toBe('₹12,34,567.89') // en-IN lakh grouping
  })

  it('signed output always carries a sign for non-zero', () => {
    expect(formatSigned(50000, 'INR')).toBe('+₹500.00')
    expect(formatSigned(-50000, 'INR')).toContain('₹500.00')
    expect(formatSigned(-50000, 'INR')).not.toBe('₹500.00')
  })

  it('compact form is available for KPI tiles (₹3.4K / ₹1.2L)', () => {
    expect(formatCompact(340000, 'INR')).toBe('₹3.4K')
    expect(formatCompact(12000000, 'INR')).toBe('₹1.2L')
  })
})

describe('previewSplit — largest remainder, mirrors docs/04', () => {
  it('₹100.00 among 3 → 3334, 3333, 3333 (sum conserved)', () => {
    expect(previewSplit(10000, 3)).toEqual([3334, 3333, 3333])
  })

  it('₹0.01 among 2 → 1, 0 — zero share is legal', () => {
    expect(previewSplit(1, 2)).toEqual([1, 0])
  })

  it('single participant carries the whole amount', () => {
    expect(previewSplit(500000, 1)).toEqual([500000])
  })

  it('always conserves the total for any n', () => {
    for (const total of [0, 1, 7, 999, 10000, 123456789]) {
      for (const n of [1, 2, 3, 4, 7, 11]) {
        const shares = previewSplit(total, n)
        expect(shares).toHaveLength(n)
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total)
      }
    }
  })

  it('rejects empty participants', () => {
    expect(() => previewSplit(100, 0)).toThrow(/participants/i)
  })

  it('equal split by userId gives the paisa to the lowest ids first', () => {
    const shares = previewEqualSplit(10000, ['c-id', 'a-id', 'b-id'])
    expect(shares).toEqual([
      { userId: 'a-id', shareMinor: 3334 },
      { userId: 'b-id', shareMinor: 3333 },
      { userId: 'c-id', shareMinor: 3333 },
    ])
  })

  it('33.33 / 33.33 / 33.34 % of ₹5000 → 166650 + 166650 + 166700 = 500000', () => {
    const shares = previewPercentageSplit(500000, [
      { userId: 'u1', percentage: 33.33 },
      { userId: 'u2', percentage: 33.33 },
      { userId: 'u3', percentage: 33.34 },
    ])
    expect(shares.map((s) => s.shareMinor).sort((a, b) => b - a)).toEqual([166700, 166650, 166650])
    expect(shares.reduce((a, s) => a + s.shareMinor, 0)).toBe(500000)
  })

  it('percentage sum validation mirrors the backend', () => {
    expect(() =>
      previewPercentageSplit(500000, [
        { userId: 'u1', percentage: 50 },
        { userId: 'u2', percentage: 49.99 },
      ]),
    ).toThrow(/100.00/)
  })
})

describe('validateExactShares (splitExact semantics)', () => {
  it('passes when shares sum to the total', () => {
    expect(validateExactShares(10000, [4000, 3000, 3000])).toEqual([4000, 3000, 3000])
  })
  it('throws SHARE_SUM_MISMATCH otherwise', () => {
    try {
      validateExactShares(10000, [4000, 3000, 2999])
      expect.unreachable()
    } catch (e) {
      expect(e.code).toBe('SHARE_SUM_MISMATCH')
    }
  })
})
