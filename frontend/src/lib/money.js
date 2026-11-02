/**
 * BalanceBook money — mirrors backend rules (docs/04-financial-engine.md).
 * One unit: integer minor units (paise). Never do float arithmetic here.
 */

export const MAX_MINOR = Number.MAX_SAFE_INTEGER // |minor| < 2^53

export class MoneyError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'MoneyError'
    this.code = code
  }
}

/** CURRENCIES[currency].decimals — per docs/04 §1. */
export const CURRENCIES = {
  INR: { decimals: 2, locale: 'en-IN' },
  USD: { decimals: 2, locale: 'en-US' },
  EUR: { decimals: 2, locale: 'de-DE' },
  GBP: { decimals: 2, locale: 'en-GB' },
  AED: { decimals: 2, locale: 'ar-AE' },
  SGD: { decimals: 2, locale: 'en-SG' },
  AUD: { decimals: 2, locale: 'en-AU' },
  CAD: { decimals: 2, locale: 'en-CA' },
  CHF: { decimals: 2, locale: 'de-CH' },
  SAR: { decimals: 2, locale: 'ar-SA' },
  QAR: { decimals: 2, locale: 'ar-QA' },
}

export const CURRENCY_CODES = Object.keys(CURRENCIES)

export function currencySymbol(code) {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value || code
  } catch {
    return code
  }
}

function spec(currency) {
  const c = String(currency || 'INR').toUpperCase()
  const s = CURRENCIES[c]
  if (!s) throw new MoneyError('UNKNOWN_CURRENCY', `Unknown currency: ${currency}`)
  return { code: c, ...s }
}

const AMOUNT_RE = /^-?\d+(\.\d+)?$|^^-?\.\d+$/

/**
 * "3000.00" + "INR" → 300000. Throws MONEY_PRECISION when the string has more
 * decimals than the currency allows (input is never silently rounded).
 */
export function toMinor(amount, currency = 'INR') {
  const s = String(amount ?? '').trim().replace(/,/g, '')
  if (s === '' || !AMOUNT_RE.test(s)) {
    throw new MoneyError('MONEY_INVALID', `Not a valid amount: "${amount}"`)
  }
  const { decimals } = spec(currency)
  const negative = s.startsWith('-')
  const body = negative ? s.slice(1) : s
  const [intRaw = '0', fracRaw = ''] = body.split('.')
  if (fracRaw.length > decimals) {
    throw new MoneyError(
      'MONEY_PRECISION',
      `"${amount}" has more than ${decimals} decimal places`,
    )
  }
  const intClean = intRaw === '' ? '0' : intRaw
  const factor = 10 ** decimals
  const intPart = Number(intClean)
  const fracPart = Number(fracRaw.padEnd(decimals, '0') || 0)
  if (!Number.isFinite(intPart) || !Number.isFinite(fracPart)) {
    throw new MoneyError('MONEY_INVALID', `Not a finite amount: "${amount}"`)
  }
  const minor = intPart * factor + fracPart
  if (!Number.isSafeInteger(minor) || Math.abs(minor) >= MAX_MINOR) {
    throw new MoneyError('MONEY_OVERFLOW', `Amount exceeds safe range: "${amount}"`)
  }
  return negative ? -minor : minor
}

/** 300000 + "INR" → "3000.00" */
export function fromMinor(minor, currency = 'INR') {
  const { decimals } = spec(currency)
  const value = Number(minor)
  if (!Number.isFinite(value)) throw new MoneyError('MONEY_INVALID', 'NaN amount')
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(value))
  if (decimals === 0) return `${sign}${abs}`
  const factor = 10 ** decimals
  const whole = Math.floor(abs / factor)
  const frac = String(abs % factor).padStart(decimals, '0')
  return `${sign}${whole}.${frac}`
}

/** 300000 + "INR" → "₹3,000.00" (grouping per locale of the currency). */
export function format(minor, currency = 'INR') {
  const { code, decimals, locale } = spec(currency)
  const value = toMajor(minor, code)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/** Signed display: positive gets an explicit "+". */
export function formatSigned(minor, currency = 'INR') {
  const n = Number(minor) || 0
  const base = format(Math.abs(n), currency)
  if (n > 0) return `+${base}`
  if (n < 0) return `−${base}`
  return base
}

/** Compact KPI display: 12000000 paise → "₹1.2L". Tables must NOT use this. */
export function formatCompact(minor, currency = 'INR') {
  const { code, locale } = spec(currency)
  const value = toMajor(minor, code)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function toMajor(minor, currency = 'INR') {
  const { decimals } = spec(currency)
  return Number(minor || 0) / 10 ** decimals
}

/**
 * Largest-remainder (Hamilton) allocation — same rules as backend splitter.
 * previewSplit(10000, 3) → [3334, 3333, 3333]: remainder paisa go to the
 * first rows (lowest userId when ties, so callers must pass userId-sorted ids).
 */
export function previewSplit(totalMinor, n) {
  const total = Math.trunc(Number(totalMinor))
  if (!Number.isFinite(total) || total < 0) {
    throw new MoneyError('MONEY_INVALID', 'Split total must be a non-negative integer')
  }
  const count = Math.trunc(Number(n))
  if (count <= 0) throw new MoneyError('NO_PARTICIPANTS', 'Split needs participants')
  const base = Math.floor(total / count)
  const remainder = total - base * count
  const shares = Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
  assertConserves(shares, total)
  return shares
}

/**
 * Equal split across specific users, deterministic like the backend:
 * fractional parts always tie → remainder paisa go to userIds ascending.
 */
export function previewEqualSplit(totalMinor, userIds = []) {
  const ids = [...userIds].sort()
  const shares = previewSplit(totalMinor, ids.length)
  return ids.map((userId, i) => ({ userId, shareMinor: shares[i] }))
}

/**
 * Percentage split preview. percentages: [{userId, percentage}] (≤ 2 decimals,
 * sum must be 100.00). Shares derived by largest remainder with the same
 * tie-break as the backend (fraction desc, then userId asc).
 */
export function previewPercentageSplit(totalMinor, entries = []) {
  const total = Math.trunc(Number(totalMinor))
  if (entries.length === 0) throw new MoneyError('NO_PARTICIPANTS', 'Split needs participants')
  const sum = entries.reduce((acc, e) => acc + Math.round(Number(e.percentage) * 100), 0)
  if (sum !== 10000) {
    throw new MoneyError('PERCENTAGE_SUM_INVALID', `Percentages must sum to 100.00 (got ${(sum / 100).toFixed(2)})`)
  }
  return allocateLargestRemainder(
    total,
    entries.map((e) => ({ userId: e.userId, weight: Math.round(Number(e.percentage) * 100) })),
  )
}

/** Generic Hamilton allocation shared by percentage/custom weights. */
export function allocateLargestRemainder(totalMinor, weighted = []) {
  const total = Math.trunc(Number(totalMinor))
  if (weighted.length === 0) throw new MoneyError('NO_PARTICIPANTS', 'Split needs participants')
  const sumWeight = weighted.reduce((acc, w) => acc + w.weight, 0)
  if (sumWeight <= 0) throw new MoneyError('MONEY_INVALID', 'Weights must sum to a positive number')
  const rows = weighted.map(({ userId, weight }) => {
    const exact = (total * weight) / sumWeight
    const base = Math.floor(exact)
    return { userId, shareMinor: base, fraction: exact - base }
  })
  let remainder = total - rows.reduce((acc, r) => acc + r.shareMinor, 0)
  const order = [...rows].sort(
    (a, b) => b.fraction - a.fraction || String(a.userId).localeCompare(String(b.userId)),
  )
  for (let i = 0; i < remainder; i += 1) order[i].shareMinor += 1
  rows.sort((a, b) => String(a.userId).localeCompare(String(b.userId)))
  const shares = rows.map((r) => r.shareMinor)
  assertConserves(shares, total)
  return rows.map(({ userId, shareMinor }) => ({ userId, shareMinor }))
}

/** splitExact semantics: no redistribution — Σ share must equal total to the paisa. */
export function validateExactShares(totalMinor, shares = []) {
  if (shares.length === 0) throw new MoneyError('NO_PARTICIPANTS', 'Split needs participants')
  const minors = shares.map((s) => {
    const value = Math.trunc(Number(s))
    if (!Number.isFinite(value) || value < 0) {
      throw new MoneyError('MONEY_INVALID', 'Shares must be non-negative integers')
    }
    return value
  })
  const sum = minors.reduce((acc, v) => acc + v, 0)
  if (sum !== Math.trunc(Number(totalMinor))) {
    throw new MoneyError('SHARE_SUM_MISMATCH', 'Exact shares must sum to the total, to the paisa')
  }
  return minors
}

function assertConserves(shares, total) {
  const sum = shares.reduce((acc, v) => acc + v, 0)
  if (sum !== total) {
    throw new MoneyError('FINANCIAL_INVARIANT_VIOLATION', `Split ${sum} ≠ ${total}`)
  }
}

/** Sum an array of minor integers safely. */
export function sumMinor(values = []) {
  return values.reduce((acc, v) => acc + (Math.trunc(Number(v)) || 0), 0)
}
