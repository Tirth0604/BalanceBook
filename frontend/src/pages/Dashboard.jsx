import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  HandCoins,
  Plus,
  Scale,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import RangeSelector from '@/components/layout/RangeSelector'
import Button from '@/components/ui/button'
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import StatTile from '@/components/ui/stat-tile'
import Skeleton, { SkeletonCard, SkeletonList } from '@/components/ui/skeleton'
import ErrorState from '@/components/ui/error-state'
import EmptyState from '@/components/ui/empty-state'
import Badge from '@/components/ui/badge'
import Avatar from '@/components/ui/avatar'
import Money from '@/components/money/Money'
import BalancePill from '@/components/money/BalancePill'
import CategoryDonut from '@/components/dashboard/CategoryDonut'
import MonthlyBars from '@/components/dashboard/MonthlyBars'
import { useAppSelector } from '@/store/hooks'
import { resolveRange, formatDate, relativeTime, monthKey } from '@/lib/dates'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useGetMySummaryQuery } from '@/services/endpoints/balancesApi'
import { useOverviewQuery, useCategoriesQuery } from '@/services/endpoints/analyticsApi'
import { useListExpensesQuery } from '@/services/endpoints/expensesApi'
import { useListGroupsQuery } from '@/services/endpoints/groupsApi'
import { useListMySettlementsQuery } from '@/services/endpoints/settlementsApi'

export default function Dashboard() {
  useDocumentTitle('Dashboard')
  const range = useAppSelector((state) => state.ui.dashboardRange)
  const { from, to } = resolveRange(range.key, range)
  const rangeQuery = { range: range.key, from, to }

  const summary = useGetMySummaryQuery(undefined, { pollingInterval: 0 })
  const overview = useOverviewQuery(rangeQuery)
  const categoryQuery = useCategoriesQuery(rangeQuery)
  const recent = useListExpensesQuery({ limit: 5, sort: '-expenseDate' })
  const groups = useListGroupsQuery({ archived: 'false', limit: 4, sort: '-createdAt' })
  const pending = useListMySettlementsQuery({ status: 'awaiting_confirmation', direction: 'to_me', limit: 5 })

  const loading = useMinDuration(
    summary.isLoading || overview.isLoading || categoryQuery.isLoading || recent.isLoading || groups.isLoading,
    300,
  )

  const s = summary.data
  const o = overview.data ?? {}
  const totals = o?.totals ?? {}
  const currency = s?.currency || o?.scope?.currency || o?.currency || 'INR'
  const categories = normaliseCategories(categoryQuery.data ?? {})
  const monthly = normaliseMonthly(o, currency)
  // Minor units in different currencies cannot be added, so a viewer with groups in more
  // than one currency sees their own currency's slice instead of a silently wrong sum.
  const mixedCurrency = Boolean(o?.scope?.mixedCurrency)
  const ownCurrencySpend = mixedCurrency
    ? (totals.byCurrency ?? []).find((row) => row.currency === currency)
    : null
  const totalSpentMinor = ownCurrencySpend
    ? Number(ownCurrencySpend.totalMinor)
    : pickNumber(totals, ['spentMinor', 'totalSpentMinor', 'totalMinor'])

  if (summary.isError && overview.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" actions={<RangeSelector />} />
        <ErrorState
          error={summary.error}
          onRetry={() => {
            summary.refetch()
            overview.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Your money room — balances, recent activity and where the spending went."
        actions={<RangeSelector />}
      />

      {/* KPI tiles */}
      {loading ? (
        <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="You owe"
            value={<Money minor={s?.totalOwedMinor ?? 0} currency={currency} compact mutedWhenZero className="font-display text-[30px] font-semibold text-danger-foreground" />}
            hint={
              Number(s?.totalOwedMinor) > 0 ? (
                <span className="inline-flex items-center gap-1 text-danger-foreground">
                  <TrendingUp className="size-3" aria-hidden /> payable
                </span>
              ) : (
                'nothing outstanding'
              )
            }
            icon={ArrowUpRight}
            tone={Number(s?.totalOwedMinor) > 0 ? 'danger' : 'neutral'}
          />
          <StatTile
            label="Owed to you"
            value={<Money minor={s?.totalOwedToMeMinor ?? 0} currency={currency} compact mutedWhenZero className="font-display text-[30px] font-semibold text-success-foreground" />}
            hint={Number(s?.totalOwedToMeMinor) > 0 ? (
              <span className="inline-flex items-center gap-1 text-success-foreground">
                <TrendingDown className="size-3" aria-hidden /> receivable
              </span>
            ) : (
              'nothing pending'
            )}
            icon={ArrowDownLeft}
            tone={Number(s?.totalOwedToMeMinor) > 0 ? 'success' : 'neutral'}
          />
          <StatTile
            label="Net position"
            value={
              <span
                aria-live="polite"
                className={Number(s?.netMinor) > 0 ? 'text-success-foreground' : Number(s?.netMinor) < 0 ? 'text-danger-foreground' : ''}
              >
                <Money minor={s?.netMinor ?? 0} currency={currency} compact signed mutedWhenZero className="font-display text-[30px] font-semibold" />
              </span>
            }
            hint={<Scale className="size-3.5" aria-hidden />}
            icon={Scale}
          />
          <StatTile
            label="Spent in range"
            value={<Money minor={totalSpentMinor ?? 0} currency={currency} compact className="font-display text-[30px] font-semibold" />}
            hint={`${totals.expenseCount ?? '—'} expenses · ${rangeLabel(range.key)}${ownCurrencySpend ? ` · ${currency} groups` : ''}`}
            icon={Wallet}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* left: charts */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Monthly spend</CardTitle>
                <CardDescription>{rangeLabel(range.key)} · {from} → {to}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-60 w-full" />
              ) : overview.isError ? (
                <ErrorState error={overview.error} onRetry={overview.refetch} compact />
              ) : (
                <MonthlyBars data={monthly} currency={currency} height={240} />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Where it went</CardTitle>
                <CardDescription>
                  {mixedCurrency
                    ? `By category · combines ${(o?.scope?.currencies ?? []).join(' + ')} minor units`
                    : 'By category, in your range'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="mx-auto h-40 w-40 rounded-pill" />
                ) : overview.isError ? (
                  <ErrorState error={overview.error} onRetry={overview.refetch} compact />
                ) : (
                  <CategoryDonut slices={categories} currency={currency} height={200} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle>Active groups</CardTitle>
                <Button asChild variant="link" size="sm">
                  <Link to="/groups">All groups</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : (groups.data?.items ?? groups.data ?? []).length === 0 ? (
                  <EmptyState
                    compact
                    icon={Users}
                    title="No groups yet"
                    description="Create one to start splitting."
                    action={
                      <Button asChild size="sm">
                        <Link to="/groups?create=1">
                          <Plus className="size-4" aria-hidden /> New group
                        </Link>
                      </Button>
                    }
                  />
                ) : (
                  (groups.data?.items ?? groups.data ?? [])
                    .slice(0, 4)
                    .map((g) => (
                      <Link
                        key={g.id}
                        to={`/groups/${g.id}`}
                        className="flex h-14 items-center justify-between gap-3 rounded-control border border-border bg-card px-3 transition-colors hover:bg-muted"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{g.name}</span>
                          <span className="block text-xs text-caption">
                            {g.memberCount ?? g.members?.length ?? '—'} members · {g.category || 'general'}
                          </span>
                        </span>
                        {g.totals?.netMinor != null ? (
                          <BalancePill netMinor={g.totals.netMinor} currency={g.baseCurrency} size="sm" />
                        ) : (
                          <Badge tone="outline">{g.baseCurrency}</Badge>
                        )}
                      </Link>
                    ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* right: activity + settlements */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="size-9 rounded-pill" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recent.isError ? (
                <ErrorState error={recent.error} onRetry={recent.refetch} compact />
              ) : (recent.data?.items ?? recent.data ?? []).length === 0 ? (
                <EmptyState
                  compact
                  icon={Wallet}
                  title="No expenses yet"
                  description="Once you log a spend, it shows up here."
                  action={
                    <Button asChild size="sm">
                      <Link to="/groups">Start a group</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="space-y-1" aria-live="polite">
                  {(recent.data?.items ?? recent.data ?? []).slice(0, 6).map((exp) => (
                    <li key={exp.id}>
                      <div className="flex items-center gap-3 rounded-control px-2 py-2.5 transition-colors hover:bg-muted">
                        <Avatar name={exp.paidBy?.name ?? '?'} src={exp.paidBy?.avatarUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{exp.title}</p>
                          <p className="truncate text-xs text-caption">
                            {exp.group?.name} · {relativeTime(exp.expenseDate || exp.createdAt)}
                          </p>
                        </div>
                        <Money minor={exp.totalMinor} currency={exp.currency || exp.group?.baseCurrency} className="text-sm font-medium" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle>Pending settlements</CardTitle>
              <HandCoins className="size-4 text-caption" aria-hidden />
            </CardHeader>
            <CardContent>
              {pending.isLoading ? (
                <SkeletonList rows={2} className="[&>div]:p-3" />
              ) : pending.isError ? (
                <ErrorState error={pending.error} onRetry={pending.refetch} compact />
              ) : (pending.data?.items ?? pending.data ?? []).length === 0 ? (
                <EmptyState
                  compact
                  icon={HandCoins}
                  title="Nothing awaiting confirmation"
                  description="Settlements you propose or receive will wait for a tap here."
                />
              ) : (
                <ul className="space-y-2">
                  {(pending.data?.items ?? pending.data ?? []).slice(0, 5).map((st) => (
                    <li key={st.id} className="rounded-control border border-border bg-card px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {st.payer?.name ?? 'Someone'} → {st.receiver?.name ?? 'You'}
                        </p>
                        <Money minor={st.amountMinor} currency={st.currency} className="text-sm font-semibold" />
                      </div>
                      <p className="mt-0.5 text-xs text-caption">
                        {st.paymentMethod || 'payment'} · {formatDate(st.initiatedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ---- defensive normalisers: docs/03 does not pin the overview payload, so
       accept several plausible shapes instead of inventing one -------------- */
function pickNumber(obj, keys) {
  for (const k of keys) if (Number.isFinite(Number(obj?.[k]))) return Number(obj[k])
  return null
}

function normaliseCategories(o) {
  const raw = o?.categories ?? o?.categoryBreakdown ?? []
  if (!Array.isArray(raw)) return []
  return raw.map((c) => ({
    name: c.name ?? c.label ?? c.category ?? 'Other',
    value: Number(c.totalMinor ?? c.minor ?? c.value ?? 0),
  }))
}

function normaliseMonthly(o, _currency) {
  const raw = o?.monthlySeries ?? o?.monthly ?? o?.trend ?? []
  if (!Array.isArray(raw)) return []
  return raw
    .map((m) => ({
      label: m.label ?? m.period ?? m.month ?? monthKey(m.date ?? m.key) ?? '',
      value: Number(m.totalMinor ?? m.minor ?? m.value ?? 0),
    }))
    .filter((m) => m.label)
}

function rangeLabel(key) {
  return (
    { '7d': 'Last 7 days', '30d': 'Last 30 days', this_month: 'This month', last_month: 'Last month', this_year: 'This year', custom: 'Custom range' }[
      key
    ] ?? 'Last 30 days'
  )
}
