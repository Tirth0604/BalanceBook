import { cn } from '@/lib/utils'
import { format } from '@/lib/money'
import { chartColor } from '@/components/ui/chart-tooltip'

/**
 * Stacked share-proportion bar — used by split previews and category totals.
 * entries: [{ label, shareMinor }]
 */
export function SplitBar({ entries = [], currency = 'INR', className, height = 'h-2.5' }) {
  const total = entries.reduce((acc, e) => acc + (Number(e.shareMinor) || 0), 0)
  if (total <= 0) {
    return <div className={cn('w-full rounded-pill bg-muted', height, className)} aria-hidden />
  }
  return (
    <div
      className={cn('flex w-full overflow-hidden rounded-pill', height, className)}
      role="img"
      aria-label={`Split: ${entries.map((e) => `${e.label} ${format(e.shareMinor, currency)}`).join(', ')}`}
    >
      {entries.map((entry, i) => {
        const pct = ((Number(entry.shareMinor) || 0) / total) * 100
        if (pct <= 0) return null
        return (
          <div
            key={`${entry.label}-${i}`}
            className="h-full first:rounded-l-pill last:rounded-r-pill transition-[width] duration-[var(--bb-motion-entrance)]"
            style={{ width: `${pct}%`, backgroundColor: entry.color || chartColor(i) }}
            title={`${entry.label}: ${format(entry.shareMinor, currency)}`}
          />
        )
      })}
    </div>
  )
}

export default SplitBar
