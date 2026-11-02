import { cn } from '@/lib/utils'

/**
 * Custom Recharts tooltip: card surface, hairline border, series dots.
 * Pass `formatValue` (minor → string) to keep amounts token-driven.
 */
export function ChartTooltip({ active, payload, label, formatValue, className, ...props }) {
  if (!active || !payload?.length) return null
  return (
    <div
      className={cn(
        'rounded-control border border-border bg-card px-3 py-2 text-xs shadow-md',
        className,
      )}
      {...props}
    >
      {label != null ? <p className="mb-1 font-medium text-foreground">{label}</p> : null}
      <ul className="space-y-0.5">
        {payload.map((entry, i) => (
          <li key={entry.dataKey ?? i} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-pill"
              style={{ backgroundColor: entry.color || entry.fill }}
              aria-hidden
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto pl-3 tabular font-medium text-foreground">
              {formatValue ? formatValue(entry.value) : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Read chart palette tokens at runtime — no hex in components. */
export function useChartColors() {
  if (typeof window === 'undefined') return []
  const style = getComputedStyle(document.documentElement)
  return Array.from({ length: 10 }, (_, i) =>
    style.getPropertyValue(`--chart-${i + 1}`).trim() || '#64748B',
  )
}

export function chartColor(index) {
  const style = getComputedStyle(document.documentElement)
  return style.getPropertyValue(`--chart-${(index % 10) + 1}`).trim() || '#64748B'
}

export default ChartTooltip
