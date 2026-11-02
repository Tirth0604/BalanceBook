import { cn } from '@/lib/utils'
import { format, formatCompact, formatSigned, toMinor } from '@/lib/money'

/**
 * The ONLY way to render an amount (docs/05 §4).
 * <Money minor={300000} currency="INR" />  → ₹3,000.00
 * <Money amount="3000.00" currency="INR" /> → ₹3,000.00 (string → minor → format)
 * mutedWhenZero: zero renders a neutral em-dash, never green/red.
 */
export function Money({
  minor,
  amount,
  currency = 'INR',
  signed = false,
  compact = false,
  mutedWhenZero = false,
  display = null, // server-provided "₹3,000.00" wins when present
  className,
  as: Comp = 'span',
  title,
}) {
  const isZero =
    (minor !== undefined && Number(minor) === 0) ||
    (minor === undefined && amount !== undefined && Number(amount) === 0)

  if (isZero && mutedWhenZero && !signed) {
    return (
      <Comp className={cn('tabular text-caption', className)} title={title}>
        —
      </Comp>
    )
  }

  let text = display
  if (!text) {
    try {
      const m = minor !== undefined ? Number(minor) : toMinor(amount, currency)
      if (!Number.isFinite(m)) throw new Error('bad amount')
      if (compact) text = formatCompact(m, currency)
      else if (signed) text = formatSigned(m, currency)
      else text = format(m, currency)
    } catch {
      text = String(amount ?? minor ?? '—')
    }
  }

  return (
    <Comp className={cn('tabular', className)} title={title}>
      {text}
    </Comp>
  )
}

export default Money
