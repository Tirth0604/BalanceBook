import { cn } from '@/lib/utils'
import { clamp } from '@/lib/utils'

/** Token-driven progress bar (no native styling surprises in dark mode). */
export function Progress({
  value = 0,
  max = 100,
  tone = 'primary',
  className,
  indicatorClassName,
  label,
  ...props
}) {
  const pct = clamp(Math.round(((Number(value) || 0) / (Number(max) || 100)) * 100), 0, 100)
  const toneClass =
    tone === 'danger'
      ? 'bg-danger'
      : tone === 'warning'
        ? 'bg-warning'
        : tone === 'success'
          ? 'bg-success'
          : 'bg-primary'
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-pill bg-muted', className)}
      {...props}
    >
      <div
        className={cn('h-full rounded-pill transition-[width] duration-[var(--bb-motion-entrance)]', toneClass, indicatorClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default Progress
