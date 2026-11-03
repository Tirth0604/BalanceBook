/**
 * Next-due preview for a recurring rule. Dates only — no money is computed here,
 * and nothing on this screen charges anybody: the server materialises an expense
 * when a due date actually arrives (docs/03 recurring).
 */
import { addDays, addMonths, addWeeks, isValid, parseISO, format } from 'date-fns'

export const FREQUENCIES = ['daily', 'weekly', 'monthly']

function addOne(date, frequency, interval) {
  const step = Math.max(1, Math.trunc(Number(interval) || 1))
  if (frequency === 'daily') return addDays(date, step)
  if (frequency === 'weekly') return addWeeks(date, step)
  if (frequency === 'monthly') return addMonths(date, step)
  return null
}

/**
 * @param {string} frequency daily | weekly | monthly
 * @param {number|string} interval every N units
 * @param {string} startDate ISO date (date-only accepted)
 * @param {string|null} endDate optional inclusive bound
 * @param {number} count how many dates to return
 * @param {Date} now injectable for tests
 */
export function upcomingDates({ frequency, interval = 1, startDate, endDate = null, count = 3, now = new Date() }) {
  const start = parseISO(String(startDate ?? ''))
  if (!isValid(start)) return []
  const bound = endDate ? parseISO(String(endDate)) : null
  const out = []
  let cursor = start
  let guard = 0

  while (isValid(cursor) && guard < 5000) {
    if (cursor >= now && (!isValid(bound) || cursor <= bound)) out.push(format(cursor, 'yyyy-MM-dd'))
    if (out.length >= count) break
    const next = addOne(cursor, frequency, interval)
    if (!isValid(next)) break
    if (isValid(bound) && next > bound) break
    cursor = next
    guard += 1
  }
  return out
}

/** "Every 2 weeks, next on 14 Nov 2026" — plain words for the rule preview. */
export function describeCadence({ frequency, interval = 1, startDate, endDate, maxOccurrences }) {
  const step = Math.max(1, Math.trunc(Number(interval) || 1))
  const unit = step > 1 ? `${frequency}s` : frequency.replace('ly', '')
  const per =
    frequency === 'daily' ? `day${step > 1 ? 's' : ''}` : frequency === 'weekly' ? `week${step > 1 ? 's' : ''}` : `month${step > 1 ? 's' : ''}`
  const parts = [`every ${step} ${per}`]
  if (startDate) parts.push(`starting ${format(parseISO(String(startDate)), 'd MMM yyyy')}`)
  if (endDate) parts.push(`until ${format(parseISO(String(endDate)), 'd MMM yyyy')}`)
  if (Number(maxOccurrences) > 0) parts.push(`${maxOccurrences} times`)
  return parts.join(', ')
}

/** Next due date a group member should expect, formatted for the rule card. */
export function nextDueLabel(nextDueDate) {
  const date = parseISO(String(nextDueDate ?? ''))
  return isValid(date) ? format(date, 'EEE d MMM yyyy') : '—'
}
