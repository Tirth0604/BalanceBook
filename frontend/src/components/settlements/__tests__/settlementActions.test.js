import { describe, expect, it } from 'vitest'
import {
  buildSettlementBody,
  makeIdempotencyKey,
  resolveSettlementActions,
  statusPresentation,
} from '../settlementActions'

const ME = 'user-me'
const OTHER = 'user-other'
const THIRD = 'user-third'

const base = {
  id: 's1',
  payer: { id: OTHER, name: 'Sam' },
  receiver: { id: ME, name: 'Me' },
  initiatedBy: { id: OTHER, name: 'Sam' },
  amountMinor: 50000,
  currency: 'INR',
  status: 'awaiting_confirmation',
  group: { id: 'g1', name: 'Goa' },
}

describe('resolveSettlementActions — the rules the API enforces', () => {
  it('lets the receiver confirm or reject while awaiting confirmation', () => {
    const { actions, reasons } = resolveSettlementActions(base, ME)
    expect(actions).toMatchObject({ confirm: true, reject: true, cancel: false })
    expect(actions.dispute).toBe(true) // receiver may dispute
    expect(reasons.confirm).toBeNull()
    expect(reasons.cancel).toMatch(/whoever recorded it/i)
  })

  it('does not let the payer confirm, but keeps dispute and cancel for the initiator', () => {
    const asPayer = resolveSettlementActions({ ...base, receiver: { id: THIRD } }, OTHER)
    expect(asPayer.actions.confirm).toBe(false)
    expect(asPayer.actions.reject).toBe(false)
    expect(asPayer.reasons.confirm).toMatch(/receiver can confirm/i)
    expect(asPayer.actions.dispute).toBe(true)
    expect(asPayer.actions.cancel).toBe(true)
  })

  it('gives a bystander nothing to click', () => {
    const { actions, canAct } = resolveSettlementActions(base, THIRD)
    expect(canAct).toBe(false)
    expect(Object.values(actions)).toEqual([false, false, false, false])
  })

  it('locks every action once the settlement is completed', () => {
    const done = resolveSettlementActions({ ...base, status: 'completed', confirmedAt: '2026-11-01T10:00:00Z' }, ME)
    expect(done.actions).toEqual({ confirm: false, reject: false, dispute: false, cancel: false })
    expect(done.reasons.confirm).toMatch(/already completed/)
  })

  it('refuses to dispute an already disputed settlement', () => {
    const disputed = resolveSettlementActions({ ...base, status: 'disputed' }, ME)
    expect(disputed.actions.dispute).toBe(false)
    expect(disputed.reasons.dispute).toMatch(/disputed settlement cannot/i)
  })

  it('trusts the server flags over the local guess', () => {
    const overridden = resolveSettlementActions(
      { ...base, canConfirm: false, canReject: false },
      ME,
    )
    expect(overridden.actions.confirm).toBe(false)
    expect(overridden.actions.reject).toBe(false)
    expect(overridden.reasons.confirm).toMatch(/server has closed/i)
    expect(overridden.reasons.reject).toMatch(/server has closed/i)
  })

  it('falls back to the payer as initiator when the field is absent', () => {
    // Sam paid and (implicitly) recorded it → Sam may cancel while unconfirmed
    expect(resolveSettlementActions({ ...base, initiatedBy: undefined }, OTHER).actions.cancel).toBe(true)
    // a receiver who never recorded it cannot cancel
    expect(resolveSettlementActions({ ...base, initiatedBy: undefined }, ME).actions.cancel).toBe(false)
  })
})

describe('settlement payload helpers', () => {
  it('carries an idempotency key and decimal-string amount', () => {
    const key = makeIdempotencyKey('g1')
    const body = buildSettlementBody({
      groupId: 'g1',
      payerId: OTHER,
      receiverId: ME,
      amount: '500.00',
      currency: 'INR',
      paymentMethod: 'upi',
      note: '  cash at the gate  ',
      idempotencyKey: key,
    })
    expect(body).toMatchObject({
      groupId: 'g1',
      payerId: OTHER,
      receiverId: ME,
      amount: '500.00',
      currency: 'INR',
      paymentMethod: 'upi',
      note: 'cash at the gate',
      idempotencyKey: key,
    })
    expect(typeof body.amount).toBe('string')
  })

  it('omits an empty note but keeps the method default', () => {
    const body = buildSettlementBody({
      groupId: 'g1',
      payerId: OTHER,
      receiverId: ME,
      amount: '10.00',
      currency: 'INR',
    })
    expect(body.note).toBeUndefined()
    expect(body.paymentMethod).toBe('cash')
  })

  it('makes keys unique per call but stable per value', () => {
    const a = makeIdempotencyKey('g1')
    const b = makeIdempotencyKey('g1')
    expect(a).not.toBe(b)
    expect(a.startsWith('g1-')).toBe(true)
  })

  it('pairs every status with words, not just colour', () => {
    expect(statusPresentation('awaiting_confirmation').words).toBe('awaiting confirmation')
    expect(statusPresentation('completed').tone).toBe('success')
    expect(statusPresentation('disputed').tone).toBe('danger')
    expect(statusPresentation('weird').words).toBe('weird')
  })
})
