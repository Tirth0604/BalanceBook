import { describe, expect, it } from 'vitest'
import { RANGE_PRESETS, monthKey, relativeTime, resolveRange } from '../dates'

const NOW = new Date('2026-11-15T10:00:00')

describe('resolveRange', () => {
  it('exposes the six preset keys from the API contract', () => {
    expect(RANGE_PRESETS.map((p) => p.key)).toEqual([
      '7d',
      '30d',
      'this_month',
      'last_month',
      'this_year',
      'custom',
    ])
  })

  it('7d = inclusive last 7 days', () => {
    const { from, to } = resolveRange('7d', {}, NOW)
    expect(from).toBe('2026-11-09')
    expect(to).toBe('2026-11-15')
  })

  it('this_month spans the calendar month to today', () => {
    const { from, to } = resolveRange('this_month', {}, NOW)
    expect(from).toBe('2026-11-01')
    expect(to).toBe('2026-11-15')
  })

  it('last_month spans the whole previous month', () => {
    const { from, to } = resolveRange('last_month', {}, NOW)
    expect(from).toBe('2026-10-01')
    expect(to).toBe('2026-10-31')
  })

  it('this_year starts at Jan 1', () => {
    const { from } = resolveRange('this_year', {}, NOW)
    expect(from).toBe('2026-01-01')
  })

  it('custom falls back sensibly when endpoints are missing', () => {
    expect(resolveRange('custom', { from: '2026-01-05', to: '2026-02-09' }, NOW)).toEqual({
      from: '2026-01-05',
      to: '2026-02-09',
    })
    const r = resolveRange('custom', {}, NOW)
    expect(r.from <= r.to).toBe(true)
  })

  it('from is always <= to for every preset', () => {
    for (const { key } of RANGE_PRESETS) {
      const { from, to } = resolveRange(key, {}, NOW)
      expect(from <= to).toBe(true)
    }
  })
})

describe('monthKey / relativeTime', () => {
  it('monthKey groups by yyyy-MM', () => {
    expect(monthKey('2026-11-02T09:30:00.000Z')).toBe('2026-11')
    expect(monthKey('2026-11-02')).toBe('2026-11')
  })

  it('relativeTime renders suffix and tolerates junk', () => {
    expect(relativeTime(new Date(Date.now() - 3600_000))).toMatch(/ago$/)
    expect(relativeTime(null)).toBe('—')
    expect(relativeTime('not-a-date')).toBe('—')
  })
})
