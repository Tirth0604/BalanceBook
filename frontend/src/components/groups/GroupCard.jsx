import { Link } from 'react-router-dom'
import { Archive, Users } from 'lucide-react'
import Avatar, { AvatarStack } from '@/components/ui/avatar'
import Badge from '@/components/ui/badge'
import Card, { CardContent } from '@/components/ui/card'
import Money from '@/components/money/Money'
import BalancePill from '@/components/money/BalancePill'
import Skeleton from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'
import { useGetGroupBalancesQuery } from '@/services/endpoints/balancesApi'

/**
 * Group card for the Groups grid. The "your position" summary is the group's own
 * balances endpoint — the client never derives a net from cached expenses.
 */
export function GroupCard({ group, onOpenMenu }) {
  const members = group.members ?? []
  return (
    <Card className={cn('flex h-full flex-col transition-shadow hover:shadow-md', group.isArchived && 'opacity-80')}>
      <CardContent className="flex-1 space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to={`/groups/${group.id}`} className="block truncate font-display text-base font-semibold hover:text-primary">
              {group.name}
            </Link>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-caption">
              <Badge tone="outline" className="py-0">
                {group.category ?? 'general'}
              </Badge>
              <span className="tabular">{group.baseCurrency}</span>
              <span aria-hidden>·</span>
              <span>{group.memberCount ?? members.length} members</span>
              <span aria-hidden>·</span>
              <span>since {formatDate(group.createdAt)}</span>
            </p>
          </div>
          {onOpenMenu ? onOpenMenu(group) : null}
        </div>

        {group.description ? (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{group.description}</p>
        ) : null}

        <div className="flex items-center gap-2">
          {members.length ? (
            <AvatarStack members={members} max={5} size="xs" />
          ) : (
            <span className="flex items-center gap-1 text-xs text-caption">
              <Users className="size-3.5" aria-hidden /> no members
            </span>
          )}
          {group.isArchived ? (
            <Badge tone="warning" className="ml-auto">
              <Archive className="size-3" aria-hidden /> archived
            </Badge>
          ) : null}
        </div>

        <GroupPosition group={group} />
      </CardContent>
    </Card>
  )
}

/** Your net position + what the whole group has spent, both read from the server. */
export function GroupPosition({ group, className }) {
  const { data, isLoading, isError } = useGetGroupBalancesQuery(group.id, {
    skip: Boolean(group.totals?.netMinor != null),
  })
  const meta = data?.meta ?? {}
  const balances = data?.items ?? (Array.isArray(data) ? data : [])
  const mine = balances.find((b) => b.isMe)

  if (group.totals?.netMinor != null) {
    return (
      <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
        <span className="text-xs text-caption">
          Spent <Money minor={group.totals.expenseMinor} currency={group.baseCurrency} className="tabular font-medium text-foreground" />
        </span>
        <BalancePill netMinor={group.totals.netMinor} currency={group.baseCurrency} size="sm" />
      </div>
    )
  }
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-between gap-2', className)}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-24 rounded-pill" />
      </div>
    )
  }
  if (isError) {
    return (
      <p className={cn('text-xs text-caption', className)}>
        Balance summary unavailable — open the group to retry.
      </p>
    )
  }
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
      <span className="text-xs text-caption">
        Spent{' '}
        <Money
          minor={meta.groupTotalMinor ?? 0}
          currency={meta.currency ?? group.baseCurrency}
          className="tabular font-medium text-foreground"
        />
      </span>
      {mine ? (
        <BalancePill
          netMinor={mine.netMinor}
          currency={mine.currency ?? group.baseCurrency}
          size="sm"
          label={meta.isSettledUp ? 'settled up' : undefined}
        />
      ) : (
        <Badge tone="neutral">{balances.length} balances</Badge>
      )}
    </div>
  )
}

export default GroupCard
