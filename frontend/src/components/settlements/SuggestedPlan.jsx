import { ArrowRight, GitCompareArrows, HandCoins, Sparkles } from 'lucide-react'
import Avatar from '@/components/ui/avatar'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import Money from '@/components/money/Money'
import Skeleton from '@/components/ui/skeleton'
import ErrorState from '@/components/ui/error-state'
import EmptyState from '@/components/ui/empty-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useGetSuggestedPlanQuery } from '@/services/endpoints/settlementsApi'

/**
 * GET /groups/:id/settlements/suggested — the optimised plan plus the naive
 * pairwise IOU count, so the saving is visible instead of asserted.
 */
export function SuggestedPlan({ group, algorithm = 'minimum', onAlgorithmChange, onRecord, maxSize = 12, loading }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useGetSuggestedPlanQuery(
    { groupId: group?.id, algorithm, maxSize },
    { skip: !group?.id },
  )

  if (!group?.id) {
    return <EmptyState icon={Sparkles} title="Pick a group" description="The optimised plan is computed per group ledger." />
  }

  if (isLoading || loading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }
  if (isError) return <ErrorState error={error} onRetry={refetch} className="m-4" />

  const plan = data ?? {}
  const transactions = plan.transactions ?? []
  const naive = Number(plan.naiveTransactionCount ?? 0)
  const optimised = Number(plan.transactionCount ?? transactions.length)
  const reduction = Number(plan.reductionPercent ?? (naive > 0 ? ((naive - optimised) / naive) * 100 : 0))
  const currency = plan.currency || group.baseCurrency || 'INR'

  if (transactions.length === 0) {
    return (
      <EmptyState
        className="m-4"
        icon={HandCoins}
        title="Everybody is settled up"
        description="No net position in this group is nonzero — there is nothing to pay. This state is recomputed by the server after every expense."
      />
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-control border border-border bg-muted/50 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-caption">Naive IOUs</p>
          <p className="font-display text-xl font-semibold tabular">{naive}</p>
          <p className="text-xs text-muted-foreground">one payment per debtor–creditor pair</p>
        </div>
        <div className="rounded-control border border-primary/30 bg-primary-muted px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-caption">Optimised</p>
          <p className="font-display text-xl font-semibold tabular">{optimised}</p>
          <p className="text-xs text-muted-foreground">
            {plan.algorithm === 'greedy' ? 'greedy matching' : 'minimum transactions'}
          </p>
        </div>
        <div className="rounded-control border border-success/30 bg-success-muted px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-caption">Reduction</p>
          <p className="font-display text-xl font-semibold tabular text-success-foreground">{reduction.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">
            {naive - optimised} fewer transfer{naive - optimised === 1 ? '' : 's'} to make
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-caption">
          <GitCompareArrows className="size-3.5" aria-hidden /> Algorithm
        </span>
        <Select value={algorithm} onValueChange={onAlgorithmChange}>
          <SelectTrigger className="h-9 w-44" aria-label="Settlement algorithm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="minimum">Minimum transactions</SelectItem>
            <SelectItem value="greedy">Greedy pairing</SelectItem>
          </SelectContent>
        </Select>
        {isFetching ? <span className="text-xs text-caption" aria-live="polite">Recomputing…</span> : null}
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
        {transactions.map((transaction, index) => (
          <li key={`${transaction.from?.id}-${transaction.to?.id}-${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
            <span className="flex items-center gap-1.5">
              <Avatar name={transaction.from?.name} src={transaction.from?.avatarUrl} size="xs" />
              <span className="text-sm font-medium">{transaction.from?.name ?? 'Debtor'}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-caption" aria-hidden />
            <span className="flex items-center gap-1.5">
              <Avatar name={transaction.to?.name} src={transaction.to?.avatarUrl} size="xs" />
              <span className="text-sm font-medium">{transaction.to?.name ?? 'Creditor'}</span>
            </span>
            <Money minor={transaction.amountMinor} currency={currency} className="ml-auto text-sm font-semibold" />
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onRecord?.({
                  payerId: transaction.from?.id,
                  receiverId: transaction.to?.id,
                  amount: transaction.amount ?? (transaction.amountMinor / 100).toFixed(2),
                })
              }
            >
              <HandCoins className="size-4" aria-hidden /> Record
            </Button>
          </li>
        ))}
      </ul>

      <p className="flex flex-wrap items-center gap-2 text-xs text-caption">
        <Badge tone="outline">{currency}</Badge>
        Recording one of these opens the payment form pre-filled — nothing is charged until the receiver confirms.
      </p>
    </div>
  )
}

export default SuggestedPlan
