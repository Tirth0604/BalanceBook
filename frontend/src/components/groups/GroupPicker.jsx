import { Users } from 'lucide-react'
import Badge from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import EmptyState from '@/components/ui/empty-state'

/** Shared group selector for the group-scoped screens (balances, settlements, analytics…). */
export function GroupPicker({ groups = [], value, onChange, loading = false, allLabel = 'All my groups', allowAll = true }) {
  if (loading) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-56" />
      </div>
    )
  }
  if (groups.length === 0) {
    return (
      <EmptyState
        compact
        icon={Users}
        title="You are not in a group yet"
        description="These screens work on a group's ledger. Create one, or join with the code from an invitation."
      />
    )
  }

  const current = groups.find((g) => g.id === value)

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={value || (allowAll ? '__all__' : '')} onValueChange={(next) => onChange(next === '__all__' ? '' : next)}>
        <SelectTrigger className="h-10 w-full sm:w-64" aria-label="Choose a group">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          {allowAll ? <SelectItem value="__all__">{allLabel}</SelectItem> : null}
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {current ? (
        <span className="flex flex-wrap items-center gap-2 text-xs text-caption">
          <Badge tone="outline">{current.baseCurrency}</Badge>
          {current.memberCount ?? current.members?.length ?? 0} members
          {current.isArchived ? <Badge tone="warning">archived</Badge> : null}
        </span>
      ) : (
        <span className="text-xs text-caption">Nothing is scoped to a group — these are your totals across all ledgers.</span>
      )}
    </div>
  )
}

export default GroupPicker
