import { CalendarDays, Download, RotateCcw } from 'lucide-react'
import Button from '@/components/ui/button'
import Input from '@/components/ui/input'
import Badge from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RANGE_PRESETS, resolveRange } from '@/lib/dates'

export const EMPTY_ANALYTICS_FILTERS = { groupId: '', range: '30d', from: '', to: '', granularity: 'month' }

/**
 * Range filter bar for the analytics endpoints (docs/03 `?range=7d|30d|this_month|
 * last_month|this_year|custom&from=&to=`). `resolveRange` turns the preset into the
 * date-only ISO pair the server expects.
 */
export function FilterBar({
  value,
  onChange,
  groups = [],
  showGroup = true,
  showGranularity = true,
  actions,
  className,
}) {
  const { from, to } = resolveRange(value.range, { from: value.from, to: value.to })

  const set = (patch) => onChange({ ...value, ...patch })

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        {showGroup ? (
          <Select value={value.groupId || '__all__'} onValueChange={(next) => set({ groupId: next === '__all__' ? '' : next })}>
            <SelectTrigger className="h-10 w-full sm:w-56" aria-label="Filter analytics by group">
              <SelectValue placeholder="All my groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All my groups</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select value={value.range} onValueChange={(range) => set({ range })}>
          <SelectTrigger className="h-10 w-full sm:w-40" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_PRESETS.map((preset) => (
              <SelectItem key={preset.key} value={preset.key}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showGranularity ? (
          <Select value={value.granularity} onValueChange={(granularity) => set({ granularity })}>
            <SelectTrigger className="h-10 w-full sm:w-36" aria-label="Chart granularity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {value.range === 'custom' ? (
            <>
              <Input
                type="date"
                aria-label="From date"
                value={value.from || from}
                max={value.to || to}
                onChange={(e) => set({ from: e.target.value })}
                className="h-10 w-40"
              />
              <Input
                type="date"
                aria-label="To date"
                value={value.to || to}
                min={value.from || from}
                onChange={(e) => set({ to: e.target.value })}
                className="h-10 w-40"
              />
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-caption">
              <CalendarDays className="size-3.5" aria-hidden />
              <span className="tabular">
                {from} → {to}
              </span>
            </span>
          )}
        </div>

        {value.range === 'custom' && (value.from || value.to) ? (
          <Button variant="ghost" size="sm" onClick={() => set({ from: '', to: '' })}>
            <RotateCcw className="size-3.5" aria-hidden /> Reset dates
          </Button>
        ) : null}

        <span className="ml-auto flex items-center gap-2">{actions}</span>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-caption">
        <Badge tone="outline">{value.granularity}</Badge>
        {value.groupId ? <Badge tone="primary">one group</Badge> : <Badge tone="neutral">all groups you belong to</Badge>}
        Every chart and the CSV export use exactly this window.
        <Download className="sr-only" aria-hidden />
      </p>
    </div>
  )
}

export default FilterBar
