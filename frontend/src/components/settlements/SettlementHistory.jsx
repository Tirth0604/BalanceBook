import { CheckCircle2, History } from 'lucide-react'
import Avatar from '@/components/ui/avatar'
import Badge from '@/components/ui/badge'
import EmptyState from '@/components/ui/empty-state'
import ErrorState from '@/components/ui/error-state'
import { SkeletonList } from '@/components/ui/skeleton'
import Money from '@/components/money/Money'
import { formatDateTime, monthLabel } from '@/lib/dates'
import { useSettlementHistoryQuery } from '@/services/endpoints/settlementsApi'

/** GET /settlements/history — completed payments, newest first, bucketed by month. */
export function SettlementHistory({ groupId }) {
  const { data, isLoading, isError, error, refetch } = useSettlementHistoryQuery(groupId ? { groupId } : undefined)
  const buckets = Array.isArray(data) ? data : (data?.items ?? [])

  if (isLoading) {
    return (
      <div className="p-4" aria-busy="true">
        <SkeletonList rows={4} className="[&>div]:p-3" />
      </div>
    )
  }
  if (isError) return <ErrorState error={error} onRetry={refetch} className="m-4" />
  if (buckets.length === 0) {
    return (
      <EmptyState
        className="m-4"
        icon={History}
        title="No settled payments yet"
        description="Once a receiver confirms a payment it lands here with its timestamp and note."
      />
    )
  }

  return (
    <div className="divide-y divide-border">
      {buckets.map((bucket) => (
        <section key={bucket.month} aria-label={`Settlements in ${monthLabel(bucket.month)}`}>
          <h3 className="bg-muted/60 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-caption">
            {monthLabel(bucket.month)} · {bucket.settlements?.length ?? 0} confirmed
          </h3>
          <ul className="divide-y divide-border">
            {(bucket.settlements ?? []).map((settlement) => (
              <li key={settlement.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                <span className="flex items-center gap-1.5 text-sm">
                  <Avatar name={settlement.payer?.name} src={settlement.payer?.avatarUrl} size="xs" />
                  {settlement.payer?.name ?? 'Payer'}
                  <span className="text-caption">paid</span>
                  <Avatar name={settlement.receiver?.name} src={settlement.receiver?.avatarUrl} size="xs" />
                  {settlement.receiver?.name ?? 'Receiver'}
                </span>
                <Money
                  minor={settlement.amountMinor}
                  currency={settlement.currency || settlement.group?.baseCurrency || 'INR'}
                  className="ml-auto text-sm font-semibold"
                />
                <Badge tone="outline">{settlement.paymentMethod?.replace('_', ' ') ?? 'payment'}</Badge>
                {settlement.group?.name ? <span className="text-xs text-caption">{settlement.group.name}</span> : null}
                <span className="w-full text-xs text-caption" title={formatDateTime(settlement.confirmedAt ?? settlement.initiatedAt)}>
                  confirmed {formatDateTime(settlement.confirmedAt ?? settlement.initiatedAt)}
                  {settlement.confirmedBy?.name ? ` by ${settlement.confirmedBy.name}` : ''}
                  {settlement.note ? ` · “${settlement.note}”` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default SettlementHistory
