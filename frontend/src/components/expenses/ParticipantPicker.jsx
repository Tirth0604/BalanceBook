import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import Checkbox from '@/components/ui/checkbox'
import Avatar from '@/components/ui/avatar'
import Badge from '@/components/ui/badge'
import Input from '@/components/ui/input'
import Button from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Participant multi-select over the group's active members.
 * `value` is an array of userIds in selection order (display order of the split).
 */
export function ParticipantPicker({
  members = [],
  value = [],
  onChange,
  paidBy = null,
  onPaidByChange,
  disabled = false,
  error,
  id = 'participant-picker',
}) {
  const [query, setQuery] = useState('')
  const selected = useMemo(() => new Set(value), [value])

  const filtered = members.filter((m) => {
    const name = m.user?.name ?? ''
    const email = m.user?.email ?? ''
    const q = query.trim().toLowerCase()
    return !q || name.toLowerCase().includes(q) || email.toLowerCase().includes(q)
  })

  const toggle = (userId) => {
    if (disabled) return
    onChange(selected.has(userId) ? value.filter((v) => v !== userId) : [...value, userId])
  }

  const allActive = members.map((m) => m.user?.id).filter(Boolean)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground" id={`${id}-count`} aria-live="polite">
          {value.length} of {members.length} members share this
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || value.length === allActive.length}
            onClick={() => onChange(allActive)}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || value.length === 0}
            onClick={() => onChange(paidBy ? [paidBy] : [])}
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-caption" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a member"
          aria-label="Filter members"
          className="pl-9"
        />
      </div>

      <ul
        id={id}
        className="divide-y divide-border overflow-hidden rounded-control border border-border bg-card"
        aria-describedby={error ? `${id}-error` : `${id}-count`}
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-4 text-center text-[13px] text-muted-foreground">
            {members.length ? 'No member matches that name.' : 'This group has no active members yet.'}
          </li>
        ) : (
          filtered.map((member) => {
            const userId = member.user?.id
            const isOn = selected.has(userId)
            return (
              <li key={userId}>
                <label
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-muted',
                    isOn && 'bg-primary-muted/60',
                    disabled && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <Checkbox
                    checked={isOn}
                    onCheckedChange={() => toggle(userId)}
                    disabled={disabled}
                    aria-label={`Include ${member.user?.name ?? 'member'}`}
                  />
                  <Avatar name={member.user?.name} src={member.user?.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{member.user?.name ?? 'Member'}</span>
                    <span className="block truncate text-xs text-caption">{member.user?.email ?? member.role}</span>
                  </span>
                  {userId === paidBy ? <Badge tone="primary">paid</Badge> : null}
                  {isOn ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
                </label>
              </li>
            )
          })
        )}
      </ul>
      {error ? (
        <p id={`${id}-error`} role="status" className="text-xs text-danger-foreground">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default ParticipantPicker
