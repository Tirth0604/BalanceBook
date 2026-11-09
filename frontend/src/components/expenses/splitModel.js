/**
 * Add-Expense split reconciliation — the client mirror of the backend splitter
 * (docs/04 + docs/03 "Validation matrix"). Every number here is an integer
 * minor unit (paise); decimal strings only appear at the edges.
 *
 * The server stays the truth: this module exists to tell the user, while they
 * type, whether the split CAN be submitted and exactly which paisa each person
 * carries — including the remainder paisa.
 */
import {
  fromMinor,
  previewEqualSplit,
  previewPercentageSplit,
  sumMinor,
  toMinor,
  MoneyError,
} from '@/lib/money'

export const SPLIT_EQUAL = 'equal'
export const SPLIT_EXACT = 'exact'
export const SPLIT_PERCENTAGE = 'percentage'
export const SPLIT_TYPES = [SPLIT_EQUAL, SPLIT_EXACT, SPLIT_PERCENTAGE]

/** "33.33" → 3333 basis points; invalid input → null (never silently rounded). */
export function toBasisPoints(value) {
  const raw = String(value ?? '').trim()
  if (raw === '' || !/^\d{0,3}(\.\d{1,2})?$/.test(raw)) return null
  const [whole = '0', frac = ''] = raw.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0') || 0)
}

export function basisPointsToText(bps) {
  return `${Math.trunc(bps / 100)}.${String(Math.abs(bps % 100)).padStart(2, '0')}`
}

/** Decimal string → minor, tolerating the typing state ("", "12.", "abc"). */
export function shareToMinor(value) {
  const raw = String(value ?? '').trim()
  if (raw === '') return { minor: null, error: 'Enter an amount.' }
  try {
    const minor = toMinor(raw)
    if (minor < 0) return { minor: null, error: 'Shares cannot be negative.' }
    return { minor, error: null }
  } catch (err) {
    return { minor: null, error: err?.code === 'MONEY_PRECISION' ? 'Paise only — two decimals.' : 'Not a valid amount.' }
  }
}

export function totalToMinor(amount, currency) {
  try {
    const minor = toMinor(amount, currency)
    if (minor <= 0) return { minor: null, error: 'Amount must be more than zero.' }
    return { minor, error: null }
  } catch (err) {
    return {
      minor: null,
      error: err?.code === 'MONEY_PRECISION' ? 'Paise only — two decimals.' : 'Enter a valid amount.',
    }
  }
}

/**
 * THE reconciliation entry point.
 *
 * @param {object}  input
 * @param {string}  input.splitType              equal | exact | percentage
 * @param {number}  input.totalMinor             integer paise (null while the amount is invalid)
 * @param {Array}   input.participants           [{ userId, name }] — selection order is display order
 * @param {Object}  input.shares                 { [userId]: '1000.00' } for exact
 * @param {Object}  input.percentages            { [userId]: '33.33' } for percentage
 * @param {string}  [input.currency]
 * @param {string}  [input.paidBy]
 */
export function reconcileSplit({
  splitType = SPLIT_EQUAL,
  totalMinor = null,
  participants = [],
  shares = {},
  percentages = {},
  currency = 'INR',
  paidBy = null,
}) {
  const ids = participants.map((p) => p.userId)
  const nameOf = new Map(participants.map((p) => [p.userId, p.name ?? '']))

  const base = {
    splitType,
    currency,
    totalMinor,
    rows: [],
    sumMinor: 0,
    deltaMinor: 0,
    remainderMinor: 0,
    remainderCarriers: 0,
    percentBasisPoints: 0,
    reconciled: false,
    errors: {},
    warnings: [],
  }

  if (!Number.isInteger(totalMinor) || totalMinor === null) {
    return { ...base, errors: { amount: totalToMinorFromMinor(totalMinor).error || 'Enter a valid amount.' } }
  }
  if (ids.length === 0) {
    return { ...base, errors: { participants: 'Pick at least one person who shares this expense.' } }
  }

  /* -------------------------------------------------- equal: server computes shares */
  if (splitType === SPLIT_EQUAL) {
    // backend rule: remainder paisa go to userIds ascending (deterministic tie-break)
    const allocated = previewEqualSplit(totalMinor, ids)
    const byId = new Map(allocated.map((a) => [a.userId, a.shareMinor]))
    const baseShare = Math.floor(totalMinor / ids.length)
    const remainder = totalMinor - baseShare * ids.length
    const rows = ids.map((userId) => {
      const shareMinor = byId.get(userId) ?? baseShare
      return {
        userId,
        name: nameOf.get(userId) ?? '',
        shareMinor,
        share: fromMinor(shareMinor, currency),
        percentBasisPoints: Math.round((shareMinor / totalMinor) * 10000),
        carriesRemainderPenny: shareMinor > baseShare,
        isPayer: userId === paidBy,
      }
    })
    const sum = sumMinor(rows.map((r) => r.shareMinor))
    return {
      ...base,
      rows,
      sumMinor: sum,
      deltaMinor: sum - totalMinor,
      remainderMinor: remainder,
      remainderCarriers: remainder,
      reconciled: sum === totalMinor,
      errors: sum === totalMinor ? {} : { participants: 'Equal split does not reconcile — report this.' },
    }
  }

  /* -------------------------------------------------- exact: Σ share must equal total */
  if (splitType === SPLIT_EXACT) {
    let pending = 0
    const rows = ids.map((userId) => {
      const { minor, error } = shareToMinor(shares[userId])
      if (error) pending += 1
      return {
        userId,
        name: nameOf.get(userId) ?? '',
        shareMinor: minor,
        share: minor === null ? '' : fromMinor(minor, currency),
        percentBasisPoints: minor === null ? null : Math.round((minor / totalMinor) * 10000),
        carriesRemainderPenny: false,
        error,
        isPayer: userId === paidBy,
      }
    })

    const sum = sumMinor(rows.map((r) => r.shareMinor ?? 0))
    const delta = sum - totalMinor
    const incomplete = rows.some((r) => r.shareMinor === null)
    const errors = {}
    if (incomplete) errors.shares = 'Enter every share before saving.'
    else if (delta !== 0) {
      errors.shares =
        delta > 0
          ? `${fromMinor(delta, currency)} over the total — trim a share.`
          : `${fromMinor(-delta, currency)} still unassigned — add it to a share.`
    }
    return {
      ...base,
      rows,
      sumMinor: sum,
      deltaMinor: delta,
      // suggestion the user can apply explicitly (never applied silently)
      distributeRemainderTo: delta !== 0 && !incomplete ? largestRowId(rows) : null,
      reconciled: delta === 0 && !incomplete,
      errors,
    }
  }

  /* -------------------------------------------------- percentage: Σ must be 100.00 */
  const entries = ids.map((userId) => {
    const bps = toBasisPoints(percentages[userId])
    return { userId, bps, error: bps === null ? 'Enter a percentage (max 2 decimals).' : null }
  })
  const missing = entries.some((e) => e.bps === null)
  const bpsSum = entries.reduce((acc, e) => acc + (e.bps ?? 0), 0)

  const errors = {}
  if (missing) errors.percentages = 'Enter a percentage for every participant.'
  else if (bpsSum !== 10000) {
    errors.percentages = `Percentages must total 100.00% — currently ${basisPointsToText(bpsSum)}%.`
  }

  if (!missing && bpsSum === 10000) {
    let allocated = []
    try {
      allocated = previewPercentageSplit(
        totalMinor,
        entries.map((e) => ({ userId: e.userId, percentage: Number(basisPointsToText(e.bps)) })),
      )
    } catch (err) {
      return {
        ...base,
        percentBasisPoints: bpsSum,
        errors: { percentages: err instanceof MoneyError ? err.message : 'Split failed.' },
      }
    }
    const byId = new Map(allocated.map((a) => [a.userId, a.shareMinor]))
    const rows = ids.map((userId) => {
      const shareMinor = byId.get(userId) ?? 0
      const bps = entries.find((e) => e.userId === userId).bps
      const exactFloor = Math.floor((totalMinor * bps) / 10000)
      return {
        userId,
        name: nameOf.get(userId) ?? '',
        shareMinor,
        share: fromMinor(shareMinor, currency),
        percentBasisPoints: bps,
        // an extra paisa beyond the floor = this row absorbed a remainder penny
        carriesRemainderPenny: shareMinor > exactFloor,
        isPayer: userId === paidBy,
        error: null,
      }
    })
    const sum = sumMinor(rows.map((r) => r.shareMinor))
    return {
      ...base,
      rows,
      sumMinor: sum,
      deltaMinor: sum - totalMinor,
      percentBasisPoints: bpsSum,
      remainderCarriers: rows.filter((r) => r.carriesRemainderPenny).length,
      reconciled: sum === totalMinor,
      errors: sum === totalMinor ? {} : { percentages: 'Derived shares do not match the total.' },
    }
  }

  // percentages not yet at 100.00 → still preview the paisa each row would carry
  const rows = entries.map((e) => ({
    userId: e.userId,
    name: nameOf.get(e.userId) ?? '',
    shareMinor: e.bps === null ? null : Math.round((totalMinor * e.bps) / 10000),
    share: e.bps === null ? '' : fromMinor(Math.round((totalMinor * e.bps) / 10000), currency),
    percentBasisPoints: e.bps,
    carriesRemainderPenny: false,
    isPayer: e.userId === paidBy,
    error: e.error,
  }))
  return { ...base, rows, percentBasisPoints: bpsSum, errors }
}

function largestRowId(rows) {
  let best = null
  for (const row of rows) {
    if (row.shareMinor === null) continue
    if (!best || row.shareMinor > best.shareMinor) best = row
  }
  return best?.userId ?? null
}

function totalToMinorFromMinor(totalMinor) {
  if (totalMinor === null || totalMinor === undefined) return { error: 'Enter an amount.' }
  return { error: 'Enter a valid amount.' }
}

/**
 * Wire payload for POST/PATCH (docs/03 create body): shares travel as decimal
 * strings; `equal` sends no shares because the server derives them.
 */
export function buildSplitPayload({ splitType, totalMinor, participants, shares, percentages, currency }) {
  if (splitType === SPLIT_EQUAL) return { splitType, participants: participants.map((p) => ({ userId: p.userId })) }
  if (splitType === SPLIT_EXACT) {
    return {
      splitType,
      participants: participants.map((p) => ({
        userId: p.userId,
        share: String(shares[p.userId] ?? '').trim(),
      })),
    }
  }
  return {
    splitType,
    participants: participants.map((p) => ({
      userId: p.userId,
      percentage: Number(percentages[p.userId] ?? 0),
    })),
  }
}

/** Map a server VALIDATION_ERROR (`details[].path`) onto the field that should show it. */
export function fieldErrorsFromApi(error) {
  const out = {}
  for (const detail of error?.details ?? []) {
    const path = String(detail.path ?? '')
    if (path.startsWith('participants')) out.participants = detail.message
    else if (path.startsWith('amount') || path.startsWith('totalMinor')) out.amount = detail.message
    else if (path.startsWith('paidBy')) out.paidBy = detail.message
    else if (path.startsWith('receipt')) out.receipt = detail.message
    else if (path.startsWith('title')) out.title = detail.message
    else if (path.startsWith('currency')) out.currency = detail.message
    else out.other = detail.message
  }
  return out
}
