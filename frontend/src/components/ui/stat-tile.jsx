import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import Button from './button'

/**
 * KPI tile. Value should be rendered with <Money compact/> or a display-font
 * tabular string; trend delta is signed + arrow + word (never colour alone).
 */
export function StatTile({ label, value, hint, trend, icon: Icon, tone = 'neutral', to, className }) {
  const navigate = useNavigate()
  const toneCls =
    tone === 'success'
      ? 'text-success-foreground'
      : tone === 'danger'
        ? 'text-danger-foreground'
        : 'text-foreground'
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-card border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-4 text-caption" aria-hidden /> : null}
      </div>
      <p className={cn('font-display text-[30px] font-semibold leading-tight tabular', toneCls)}>{value}</p>
      <div className="flex items-center gap-2">
        {trend != null ? <TrendDelta value={trend} /> : null}
        {hint ? <p className="text-xs text-caption">{hint}</p> : null}
      </div>
      {to ? (
        <Button variant="link" size="sm" className="mt-1 self-start p-0" onClick={() => navigate(to)}>
          View details
        </Button>
      ) : null}
    </div>
  )
}

function TrendDelta({ value }) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return null
  const up = n > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium tabular',
        up ? 'text-success-foreground' : 'text-danger-foreground',
      )}
    >
      {up ? '▲' : '▼'} {Math.abs(n).toFixed(1)}% {up ? 'up' : 'down'}
    </span>
  )
}

export default StatTile
