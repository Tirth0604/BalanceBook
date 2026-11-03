import { Link } from 'react-router-dom'
import { CheckCircle2, HandCoins, Scale } from 'lucide-react'
import Avatar from '@/components/ui/avatar'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import EmptyState from '@/components/ui/empty-state'
import ErrorState from '@/components/ui/error-state'
import { SkeletonList } from '@/components/ui/skeleton'
import Money from '@/components/money/Money'
import { cn } from '@/lib/utils'

/**
 * Per-member net position, exactly as the server derived it (docs/03 Balance DTO).
 * Nothing here is recomputed: `netMinor`, `iOweMinor`, `owedToMeMinor` and `status`
 * all arrive from GET /groups/:id/balances.
 */
export function MemberBalanceTable({
  balances = [],
  meta = {},
  currency = 'INR',
  loading = false,
  error = null,
  onRetry,
  groupId,
  onSettle,
  className,
}) {
  if (loading) {
    return (
      <div className={cn('p-4', className)} aria-busy="true">
        <SkeletonList rows={4} className="[&>div]:p-3" />
      </div>
    )
  }
  if (error) return <ErrorState error={error} onRetry={onRetry} className={className} />
  if (balances.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={Scale}
        title="No balances yet"
        description="A balance appears as soon as somebody pays for something the group shares."
        action={
          groupId ? (
            <Button asChild size="sm">
              <Link to={`/groups/${groupId}/expenses/new`}>Add the first expense</Link>
            </Button>
          ) : null
        }
      />
    )
  }

  const sorted = [...balances].sort((a, b) => Math.abs(Number(b.netMinor) || 0) - Math.abs(Number(a.netMinor) || 0))

  return (
    <div className={className}>
      {meta.isSettledUp ? (
        <div className="mb-3 flex items-center gap-2 rounded-control border border-success/30 bg-success-muted px-3 py-2.5 text-[13px] font-medium text-success-foreground" role="status">
          <CheckCircle2 className="size-4" aria-hidden />
          Settled up — everybody's net position is zero.
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Net position per member, derived by the server</caption>
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-caption">
              <th scope="col" className="py-2 text-left font-medium">
                Member
              </th>
              <th scope="col" className="py-2 text-left font-medium">
                Position
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Owed to them ({currency})
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                They owe ({currency})
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Net
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((row) => {
              const net = Number(row.netMinor) || 0
              const words =
                row.status === 'settled' || net === 0
                  ? 'settled up'
                  : net > 0
                    ? row.isMe
                      ? 'you are owed'
                      : 'is owed'
                    : row.isMe
                      ? 'you owe'
                      : 'owes'
              return (
                <tr key={row.user?.id ?? row.displayName} className={cn('align-middle', row.isMe && 'bg-primary-muted/40')}>
                  <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                    <span className="flex items-center gap-2">
                      <Avatar name={row.displayName ?? row.user?.name} src={row.user?.avatarUrl} size="xs" />
                      <span className="truncate font-medium">{row.displayName ?? row.user?.name ?? 'Member'}</span>
                      {row.isMe ? <Badge tone="primary" className="py-0">you</Badge> : null}
                    </span>
                  </th>
                  <td className="py-2.5 pr-3 text-[13px] text-muted-foreground">{words}</td>
                  <td className="py-2.5 text-right tabular">
                    {Number(row.owedToMeMinor) > 0 ? <Money minor={row.owedToMeMinor} currency={row.currency || currency} /> : <span className="text-caption">—</span>}
                  </td>
                  <td className="py-2.5 text-right tabular">
                    {Number(row.iOweMinor) > 0 ? <Money minor={row.iOweMinor} currency={row.currency || currency} /> : <span className="text-caption">—</span>}
                  </td>
                  <td className="py-2.5 text-right">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 font-semibold tabular',
                        net > 0 ? 'text-success-foreground' : net < 0 ? 'text-danger-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {net === 0 ? '—' : net > 0 ? '+' : '−'}
                      {net === 0 ? <span>settled</span> : <Money minor={Math.abs(net)} currency={row.currency || currency} />}
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    {net < 0 && onSettle ? (
                      <Button size="sm" variant="outline" onClick={() => onSettle(row)}>
                        <HandCoins className="size-4" aria-hidden /> Settle
                      </Button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-caption">
        <span>
          Group total:{' '}
          <Money minor={meta.groupTotalMinor ?? 0} currency={meta.currency ?? currency} className="font-medium text-foreground" />
        </span>
        {groupId ? (
          <Link to={`/settlements?groupId=${groupId}`} className="font-medium text-primary underline-offset-4 hover:underline">
            Settlements for this group
          </Link>
        ) : null}
      </p>
    </div>
  )
}

export default MemberBalanceTable
