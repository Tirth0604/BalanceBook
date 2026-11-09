import { describe, expect, it } from 'vitest'
import {
  basisPointsToText,
  buildSplitPayload,
  fieldErrorsFromApi,
  reconcileSplit,
  toBasisPoints,
  totalToMinor,
} from '../splitModel'

const PEOPLE = [
  { userId: 'u1', name: 'Ava' },
  { userId: 'u2', name: 'Bea' },
  { userId: 'u3', name: 'Cai' },
]

const sum = (rows) => rows.reduce((acc, r) => acc + (r.shareMinor ?? 0), 0)

describe('splitModel — equal split', () => {
  it('splits ₹100.00 across 3 and hands the remainder paisa to the lowest userId', () => {
    const { minor } = totalToMinor('100.00')
    const plan = reconcileSplit({ splitType: 'equal', totalMinor: minor, participants: PEOPLE, paidBy: 'u2' })

    expect(minor).toBe(10000)
    expect(plan.reconciled).toBe(true)
    expect(sum(plan.rows)).toBe(10000)
    expect(plan.rows.map((r) => r.shareMinor)).toEqual([3334, 3333, 3333])
    expect(plan.remainderMinor).toBe(1)
    expect(plan.rows.filter((r) => r.carriesRemainderPenny).map((r) => r.userId)).toEqual(['u1'])
    expect(plan.rows.find((r) => r.userId === 'u2').isPayer).toBe(true)
  })

  it('flags every carrier when two paisa are left over', () => {
    const plan = reconcileSplit({ splitType: 'equal', totalMinor: 10001, participants: PEOPLE })
    expect(plan.remainderMinor).toBe(2)
    expect(sum(plan.rows)).toBe(10001)
    expect(plan.rows.filter((r) => r.carriesRemainderPenny)).toHaveLength(2)
    expect(plan.reconciled).toBe(true)
  })

  it('never sends shares for an equal split — the server derives them', () => {
    const payload = buildSplitPayload({ splitType: 'equal', totalMinor: 10001, participants: PEOPLE })
    expect(payload.splitType).toBe('equal')
    expect(payload.participants).toEqual([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }])
  })
})

describe('splitModel — exact split', () => {
  it('reconciles only when the shares equal the total to the paisa', () => {
    const plan = reconcileSplit({
      splitType: 'exact',
      totalMinor: 10000,
      participants: PEOPLE,
      shares: { u1: '50.00', u2: '25.00', u3: '25.00' },
    })
    expect(plan.reconciled).toBe(true)
    expect(plan.sumMinor).toBe(10000)
    expect(plan.deltaMinor).toBe(0)
    expect(plan.errors.shares).toBeUndefined()
  })

  it('reports the unassigned remainder and offers the largest share to absorb it', () => {
    const plan = reconcileSplit({
      splitType: 'exact',
      totalMinor: 10000,
      participants: PEOPLE,
      shares: { u1: '60.00', u2: '20.00', u3: '19.90' },
    })
    expect(plan.reconciled).toBe(false)
    expect(plan.deltaMinor).toBe(-10)
    expect(plan.errors.shares).toMatch(/0\.10/)
    expect(plan.distributeRemainderTo).toBe('u1')
  })

  it('rejects over-assignment and sub-paisa input', () => {
    const over = reconcileSplit({
      splitType: 'exact',
      totalMinor: 10000,
      participants: [{ userId: 'u1' }],
      shares: { u1: '100.01' },
    })
    expect(over.deltaMinor).toBe(1)
    expect(over.reconciled).toBe(false)

    const tooPrecise = reconcileSplit({
      splitType: 'exact',
      totalMinor: 10000,
      participants: [{ userId: 'u1' }],
      shares: { u1: '99.999' },
    })
    expect(tooPrecise.rows[0].error).toMatch(/two decimals/)
    expect(tooPrecise.reconciled).toBe(false)
  })

  it('sends the typed decimal strings back to the server untouched', () => {
    const payload = buildSplitPayload({
      splitType: 'exact',
      totalMinor: 10000,
      participants: PEOPLE,
      shares: { u1: '50.00', u2: '25.00', u3: '25.01' },
    })
    expect(payload.participants.map((p) => p.share)).toEqual(['50.00', '25.00', '25.01'])
  })
})

describe('splitModel — percentage split', () => {
  it('needs exactly 100.00 before it reconciles', () => {
    const plan = reconcileSplit({
      splitType: 'percentage',
      totalMinor: 10000,
      participants: PEOPLE,
      percentages: { u1: '33.33', u2: '33.33', u3: '33.33' },
    })
    expect(plan.reconciled).toBe(false)
    expect(plan.errors.percentages).toMatch(/must total 100\.00% — currently 99\.99/)
    expect(plan.percentBasisPoints).toBe(9999)
  })

  it('derives integer shares with largest-remainder and flags the extra paisa', () => {
    const plan = reconcileSplit({
      splitType: 'percentage',
      totalMinor: 100000,
      participants: PEOPLE,
      percentages: { u1: '33.33', u2: '33.33', u3: '33.34' },
    })
    expect(plan.reconciled).toBe(true)
    expect(sum(plan.rows)).toBe(100000)
    expect(plan.rows.map((r) => r.shareMinor)).toEqual([33330, 33330, 33340])
    expect(plan.errors).toEqual({})
  })

  it('hands the remainder paisa to the row whose fraction was largest', () => {
    // ₹10.00 across 3 × 33.33/33.33/33.34 → 333.3 / 333.3 / 333.4 paise
    const plan = reconcileSplit({
      splitType: 'percentage',
      totalMinor: 1000,
      participants: PEOPLE,
      percentages: { u1: '33.33', u2: '33.33', u3: '33.34' },
    })
    expect(plan.rows.map((r) => r.shareMinor)).toEqual([333, 333, 334])
    // u3's fraction (.4) is the largest, so the single leftover paisa lands there
    expect(plan.rows.find((r) => r.userId === 'u3').carriesRemainderPenny).toBe(true)
    expect(sum(plan.rows)).toBe(1000)
  })

  it('rejects a percentage with three decimals', () => {
    const plan = reconcileSplit({
      splitType: 'percentage',
      totalMinor: 10000,
      participants: [{ userId: 'u1' }],
      percentages: { u1: '100.001' },
    })
    expect(plan.rows[0].error).toMatch(/max 2 decimals/)
  })

  it('parses basis points exactly', () => {
    expect(toBasisPoints('33.34')).toBe(3334)
    expect(toBasisPoints('3')).toBe(300)
    expect(toBasisPoints('')).toBeNull()
    expect(toBasisPoints('12.345')).toBeNull()
    expect(basisPointsToText(5)).toBe('0.05')
  })
})

describe('splitModel — guards', () => {
  it('refuses to split nothing', () => {
    const plan = reconcileSplit({ splitType: 'equal', totalMinor: 1000, participants: [] })
    expect(plan.reconciled).toBe(false)
    expect(plan.errors.participants).toMatch(/at least one person/)
  })

  it('surfaces an invalid amount instead of a silent zero', () => {
    const plan = reconcileSplit({ splitType: 'equal', totalMinor: null, participants: PEOPLE })
    expect(plan.errors.amount).toBeTruthy()
    expect(plan.rows).toHaveLength(0)
  })
})

describe('splitModel — API error mapping', () => {
  it('maps VALIDATION_ERROR details onto the field that showed them', () => {
    const errors = fieldErrorsFromApi({
      code: 'VALIDATION_ERROR',
      details: [
        { path: 'participants', message: 'Shares must sum to the total.' },
        { path: 'paidBy', message: 'paidBy must be an active member' },
      ],
    })
    expect(errors.participants).toBe('Shares must sum to the total.')
    expect(errors.paidBy).toBe('paidBy must be an active member')
  })
})
