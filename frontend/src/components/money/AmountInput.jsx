import { forwardRef, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { currencySymbol } from '@/lib/money'

/**
 * Decimal-only amount field: blocks '-', letters and >2 decimals, formats as
 * the user types and emits a plain decimal STRING ("1250.50").
 */
const clean = (raw) => {
  let s = raw.replace(/[^\d.]/g, '')
  const firstDot = s.indexOf('.')
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '')
    const [int, frac = ''] = s.split('.')
    s = frac.length > 2 ? `${int}.${frac.slice(0, 2)}` : s
  }
  if (s.startsWith('.')) s = `0${s}`
  // trim leading zeros but keep a single "0"
  s = s.replace(/^0+(\d)/, '$1')
  return s
}

export const AmountInput = forwardRef(function AmountInput(
  {
    value,
    onValueChange,
    currency = 'INR',
    id,
    className,
    invalid,
    placeholder = '0.00',
    showSymbol = true,
    align = 'left',
    ...props
  },
  ref,
) {
  const [displayValue, setDisplayValue] = useState(value ?? '')

  useEffect(() => {
    if (value !== undefined && value !== displayValue && value !== clean(displayValue)) {
      setDisplayValue(value === '' ? '' : clean(String(value)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const handleChange = (e) => {
    const next = clean(e.target.value)
    setDisplayValue(next)
    onValueChange?.(next)
  }

  return (
    <div className={cn('relative flex items-center', className)}>
      {showSymbol ? (
        <span className="pointer-events-none absolute left-3 text-sm tabular text-muted-foreground" aria-hidden>
          {currencySymbol(currency)}
        </span>
      ) : null}
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-label={`Amount in ${currency}`}
        className={cn(
          'h-10 w-full rounded-control border border-input bg-card text-sm tabular text-foreground shadow-sm transition-colors placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 aria-[invalid=true]:border-danger',
          showSymbol ? 'pl-8 pr-3' : 'px-3',
          align === 'right' && 'text-right',
        )}
        {...props}
      />
    </div>
  )
})

export default AmountInput
