import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import StatTile from '@/components/ui/stat-tile'
import Money from '@/components/money/Money'
import BalancePill from '@/components/money/BalancePill'
import { SkeletonCard } from '@/components/ui/skeleton'
import ErrorState from '@/components/ui/error-state'
import { ArrowDownLeft, ArrowUpRight, HandCoins, Scale, Wallet } from 'lucide-react'

/**
 * KPI row from GET /analytics/overview. Every tile reads a server-computed
 * minor-unit field — the client adds and subtracts nothing.
 */
export function OverviewCharts({ overview, currency = 'INR', loading = false, error = null, onRetry, rangeLabel }) {
  if (loading) {
    return (
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }
  if (error) return <ErrorState error={error} onRetry={onRetry} />

  const o = overview ?? {}
  const totals = o.totals ?? {}
  const you = o.you ?? {}

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Spent in window"
          value={<Money minor={Number(totals.spentMinor) || 0} currency={currency} compact className="font-display text-[30px] font-semibold" />}
          hint={`${totals.expenseCount ?? 0} expenses${rangeLabel ? ` · ${rangeLabel}` : ''}`}
          icon={Wallet}
        />
        <StatTile
          label="You paid"
          value={<Money minor={Number(you.paidMinor) || 0} currency={currency} compact className="font-display text-[30px] font-semibold" />}
          hint={Number.isFinite(Number(you.fundedPercent)) ? `${Number(you.fundedPercent).toFixed(0)}% of the window funded by you` : 'across this scope'}
          icon={ArrowUpRight}
          tone="neutral"
        />
        <StatTile
          label="You consumed"
          value={<Money minor={Number(you.consumedMinor) || 0} currency={currency} compact className="font-display text-[30px] font-semibold" />}
          hint="your share of what the group bought"
          icon={ArrowDownLeft}
        />
        <Card>
          <CardContent className="flex h-full flex-col justify-between p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your net</p>
              <Scale className="size-4 text-caption" aria-hidden />
            </div>
            <div aria-live="polite" className="mt-2">
              <BalancePill
                netMinor={Number(you.netMinor) || 0}
                currency={currency}
                label={you.status === 'settled' ? 'settled up' : you.status === 'creditor' ? 'owed to you' : 'you owe'}
              />
            </div>
            <p className="mt-2 text-xs text-caption">
              {you.status === 'debtor'
                ? 'Pay the people who fronted the cash.'
                : you.status === 'creditor'
                  ? 'Others still owe you for this window.'
                  : 'Nothing outstanding in this window.'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top category</CardTitle>
          </CardHeader>
          <CardContent>
            {o.topCategory ? (
              <>
                <p className="font-display text-base font-semibold">{o.topCategory.label ?? o.topCategory.category}</p>
                <Money minor={Number(o.topCategory.totalMinor) || 0} currency={currency} className="text-sm font-medium" />
                {Number.isFinite(Number(o.topCategory.percentOfSpend)) ? (
                  <p className="text-xs text-caption">{Number(o.topCategory.percentOfSpend).toFixed(1)}% of the window</p>
                ) : null}
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">No spending in this window.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Biggest funder</CardTitle>
          </CardHeader>
          <CardContent>
            {o.topMember ? (
              <>
                <p className="font-display text-base font-semibold">{o.topMember.user?.name ?? 'Member'}</p>
                <Money minor={Number(o.topMember.paidMinor) || 0} currency={currency} className="text-sm font-medium" />
                {Number.isFinite(Number(o.topMember.sharePercent)) ? (
                  <p className="text-xs text-caption">funded {Number(o.topMember.sharePercent).toFixed(1)}%</p>
                ) : null}
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">Nobody has paid yet in this window.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pending settlements</CardTitle>
            <CardDescription>recorded, not yet confirmed</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="flex items-center gap-2">
              <HandCoins className="size-4 text-caption" aria-hidden />
              <Money minor={Number(o.pendingSettlements?.amountMinor) || 0} currency={currency} className="font-display text-lg font-semibold" />
            </p>
            <p className="mt-1 text-xs text-caption">{o.pendingSettlements?.count ?? 0} payment(s) waiting for a tap</p>
          </CardContent>
        </Card>
      </div>

      {o.scope?.mixedCurrency ? (
        <p className="rounded-control border border-warning/40 bg-warning-muted px-3 py-2 text-xs text-foreground" role="status">
          This window mixes several group currencies. Totals are reported in {o.scope.currency ?? currency}; the
          per-currency breakdown is in the CSV export.
        </p>
      ) : null}
    </div>
  )
}

export default OverviewCharts
