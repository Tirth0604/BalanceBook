import { Popover, PopoverContent, PopoverTrigger } from '@radix-ui/react-popover'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setDashboardRange } from '@/store/uiSlice'
import { RANGE_PRESETS, resolveRange } from '@/lib/dates'
import Button from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Range selector (7d / 30d / this month / last month / this year / custom). */
export function RangeSelector({ className }) {
  const dispatch = useAppDispatch()
  const range = useAppSelector((state) => state.ui.dashboardRange)
  const activeLabel = RANGE_PRESETS.find((p) => p.key === range.key)?.label ?? '30 days'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-2', className)}>
          <CalendarDays className="size-4" aria-hidden />
          {activeLabel}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-50 w-72 rounded-card border border-border bg-card p-4 shadow-lg animate-scale-in">
        <div role="group" aria-label="Date range presets" className="grid grid-cols-2 gap-1.5">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => dispatch(setDashboardRange({ key: preset.key }))}
              className={cn(
                'h-9 rounded-control border px-2 text-[13px] font-medium transition-colors',
                range.key === preset.key
                  ? 'border-primary bg-primary-muted text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              aria-pressed={range.key === preset.key}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {range.key === 'custom' ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              From
              <input
                type="date"
                value={range.from ?? ''}
                onChange={(e) => {
                  const next = { ...range, from: e.target.value, to: range.to }
                  const r = resolveRange('custom', next)
                  dispatch(setDashboardRange({ from: e.target.value || r.from, to: next.to }))
                }}
                className="h-9 rounded-control border border-input bg-card px-2 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              To
              <input
                type="date"
                value={range.to ?? ''}
                onChange={(e) => dispatch(setDashboardRange({ to: e.target.value }))}
                className="h-9 rounded-control border border-input bg-card px-2 text-sm text-foreground"
              />
            </label>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export default RangeSelector
