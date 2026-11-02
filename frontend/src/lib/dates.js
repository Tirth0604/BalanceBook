import {
  format,
  formatDistanceToNow,
  isValid,
  parseISO,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  subDays,
  lastDayOfMonth,
  subMonths,
} from 'date-fns'

/**
 * Range presets — same keys the API accepts on `?range=`.
 * from/to are date-only ISO strings (accepted by expenseDate-style filters).
 */
export const RANGE_PRESETS = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_year', label: 'This year' },
  { key: 'custom', label: 'Custom' },
]

export function resolveRange(key, custom = {}, now = new Date()) {
  const today = endOfDay(now)
  switch (key) {
    case '7d':
      return { from: iso(startOfDay(subDays(now, 6))), to: iso(today) }
    case '30d':
      return { from: iso(startOfDay(subDays(now, 29))), to: iso(today) }
    case 'this_month':
      return { from: iso(startOfMonth(now)), to: iso(today) }
    case 'last_month':
      return { from: iso(startOfMonth(subMonths(now, 1))), to: iso(lastDayOfMonth(subMonths(now, 1))) }
    case 'this_year':
      return { from: iso(startOfYear(now)), to: iso(today) }
    case 'custom':
      return { from: custom.from || iso(startOfMonth(now)), to: custom.to || iso(today) }
    default:
      return { from: iso(startOfDay(subDays(now, 29))), to: iso(today) }
  }
}

const iso = (d) => format(d, 'yyyy-MM-dd')

/** Parse an API date ("2026-11-02" or ISO UTC) into a Date, defensively. */
export function parseDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : parseISO(String(value))
  return isValid(d) ? d : null
}

/** "2026-11-02T..." / Date → display string, e.g. "2 Nov 2026". */
export function formatDate(value, pattern = 'd MMM yyyy') {
  const d = parseDate(value)
  return d ? format(d, pattern) : '—'
}

export function formatDateTime(value) {
  return formatDate(value, 'd MMM yyyy · HH:mm')
}

/** Relative time for activity feeds: "2 hours ago". */
export function relativeTime(value) {
  const d = parseDate(value)
  if (!d) return '—'
  return formatDistanceToNow(d, { addSuffix: true })
}

/** Group-by-month key: "2026-11". */
export function monthKey(value) {
  const d = parseDate(value)
  return d ? format(d, 'yyyy-MM') : 'unknown'
}

export function monthLabel(key, fallbackDate) {
  const d = parseDate(`${key}-01`) || parseDate(fallbackDate)
  return d ? format(d, 'MMM yyyy') : key || '—'
}
