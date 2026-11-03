import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import ErrorState from '@/components/ui/error-state'
import EmptyState from '@/components/ui/empty-state'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import useMinDuration from '@/hooks/useMinDuration'
import { resolveRange } from '@/lib/dates'
import { useListGroupsQuery } from '@/services/endpoints/groupsApi'
import { useCategoriesQuery, useMembersQuery, useOverviewQuery, useTrendQuery } from '@/services/endpoints/analyticsApi'
import FilterBar, { EMPTY_ANALYTICS_FILTERS } from '@/components/analytics/FilterBar'
import OverviewCharts from '@/components/analytics/OverviewCharts'
import CategoryBreakdown from '@/components/analytics/CategoryBreakdown'
import MemberContribution from '@/components/analytics/MemberContribution'
import TimeSeries from '@/components/analytics/TimeSeries'
import ExportButton from '@/components/analytics/ExportButton'
import MonthlyBars from '@/components/dashboard/MonthlyBars'

export default function Analytics() {
  useDocumentTitle('Analytics')
  const [search, setSearch] = useSearchParams()
  const [filters, setFilters] = useState(() => ({
    ...EMPTY_ANALYTICS_FILTERS,
    groupId: search.get('groupId') ?? '',
    range: search.get('range') ?? '30d',
  }))

  const groupsQuery = useListGroupsQuery({ archived: 'false', limit: 50 })
  const groups = groupsQuery.data?.items ?? groupsQuery.data ?? []

  const { from, to } = useMemo(
    () => resolveRange(filters.range, { from: filters.from, to: filters.to }),
    [filters.range, filters.from, filters.to],
  )

  const scoped = useMemo(
    () => ({ groupId: filters.groupId || undefined, from, to }),
    [filters.groupId, from, to],
  )
  const overviewArgs = useMemo(() => ({ ...scoped, range: filters.range }), [scoped, filters.range])
  const trendArgs = useMemo(() => ({ ...scoped, granularity: filters.granularity }), [scoped, filters.granularity])

  const overview = useOverviewQuery(overviewArgs)
  const categories = useCategoriesQuery(scoped)
  const members = useMembersQuery(scoped)
  const trend = useTrendQuery(trendArgs)

  const loading = useMinDuration(overview.isLoading || categories.isLoading || members.isLoading || trend.isLoading, 300)
  const currency =
    overview.data?.scope?.currency || categories.data?.currency || members.data?.currency || trend.data?.currency || 'INR'

  const monthly = useMemo(
    () =>
      (overview.data?.monthlySeries ?? []).map((row) => ({
        label: row.period ?? row.label ?? '',
        value: Number(row.totalMinor) || 0,
      })),
    [overview.data],
  )

  const updateFilters = (next) => {
    setFilters(next)
    const params = new URLSearchParams(search)
    if (next.groupId) params.set('groupId', next.groupId)
    else params.delete('groupId')
    params.set('range', next.range)
    setSearch(params, { replace: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        subtitle="Aggregations the server computed from the ledger — this screen never re-adds amounts, it renders what came back."
        actions={<ExportButton params={scoped} />}
      />

      <FilterBar
        value={filters}
        onChange={updateFilters}
        groups={groups}
        className="rounded-card border border-border bg-card p-4 shadow-sm"
      />

      {overview.isError && categories.isError && members.isError && trend.isError ? (
        <ErrorState error={overview.error} onRetry={() => {
          overview.refetch()
          categories.refetch()
          members.refetch()
          trend.refetch()
        }} />
      ) : groupsQuery.isSuccess && groups.length === 0 && !loading ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Nothing to analyse yet"
            description="Analytics need at least one group with expenses. Create a group and log a spend — the charts fill in as soon as the ledger exists."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <OverviewCharts
            overview={overview.data}
            currency={currency}
            loading={loading}
            error={overview.isError ? overview.error : null}
            onRetry={overview.refetch}
            rangeLabel={`${from} → ${to}`}
          />

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Monthly spend</CardTitle>
                <CardDescription>Bar chart, one bucket per calendar month</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-60 w-full skeleton" />
                ) : (
                  <MonthlyBars data={monthly} currency={currency} height={240} />
                )}
              </CardContent>
            </Card>

            <CategoryBreakdown
              data={categories.data}
              currency={currency}
              loading={loading || categories.isLoading}
              error={categories.isError ? categories.error : null}
              onRetry={categories.refetch}
            />
          </div>

          <TimeSeries
            data={trend.data}
            currency={currency}
            loading={loading || trend.isLoading}
            error={trend.isError ? trend.error : null}
            onRetry={trend.refetch}
          />

          <MemberContribution
            data={members.data}
            currency={currency}
            loading={loading || members.isLoading}
            error={members.isError ? members.error : null}
            onRetry={members.refetch}
          />

          <p className="text-xs text-caption">
            Need the raw rows? <ExportButton params={scoped} variant="link" label="Download CSV" /> — one line per expense,
            same window as these charts.
          </p>
        </div>
      )}
    </div>
  )
}
