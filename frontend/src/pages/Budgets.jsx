import { Link, useSearchParams } from 'react-router-dom'
import { Target, Wallet } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/button'
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import Badge from '@/components/ui/badge'
import Money from '@/components/money/Money'
import Skeleton from '@/components/ui/skeleton'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import useMinDuration from '@/hooks/useMinDuration'
import { useListGroupsQuery } from '@/services/endpoints/groupsApi'
import { useListBudgetsQuery } from '@/services/endpoints/budgetsApi'
import GroupPicker from '@/components/groups/GroupPicker'
import BudgetProgress from '@/components/budgets/BudgetProgress'

export default function Budgets() {
  useDocumentTitle('Budgets')
  const [search, setSearch] = useSearchParams()
  const groupId = search.get('groupId') ?? ''

  const groupsQuery = useListGroupsQuery({ archived: 'false', limit: 50 })
  const groups = groupsQuery.data?.items ?? groupsQuery.data ?? []

  const pickGroup = (next) => {
    const params = new URLSearchParams(search)
    if (next) params.set('groupId', next)
    else params.delete('groupId')
    setSearch(params, { replace: true })
  }

  const selected = groups.find((g) => g.id === groupId) ?? null
  const canManage = selected?.myRole === 'admin'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Budgets"
        subtitle="Spending plans for a group or a single category. A budget never moves money — it watches the ledger and warns you at 75%, 90% and 100%."
        actions={
          groupId ? (
            <Button asChild variant="outline">
              <Link to={`/analytics?groupId=${groupId}`}>See the spend behind it</Link>
            </Button>
          ) : null
        }
      />

      <GroupPicker
        groups={groups}
        value={groupId}
        onChange={pickGroup}
        loading={groupsQuery.isLoading}
        allLabel="Choose a group to manage budgets"
        allowAll={false}
      />

      {!groupId ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="Budgets live inside a group"
            description="Pick a group above to set a whole-group cap or a per-category plan. Nothing here charges anyone — it only compares the ledger to the limit you typed."
          />
        </Card>
      ) : (
        <>
          <GroupBudgetSummary groupId={groupId} currency={selected?.baseCurrency ?? 'INR'} />
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>{selected?.name ?? 'Budgets'}</CardTitle>
                <CardDescription>
                  Limits, spend and remaining come from the server; the bar colour marks the threshold band it fell into.
                </CardDescription>
              </div>
              <Badge tone="neutral">
                <Target className="size-3" aria-hidden /> 75 / 90 / 100 thresholds
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <BudgetProgress group={selected ?? { id: groupId }} canManage={canManage} />
            </CardContent>
          </Card>
          {!canManage ? (
            <p className="text-xs text-caption">
              You are a member here, so budgets are read-only for you. An admin can add, change or delete a plan.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

/** One-line server-derived summary (the list endpoint carries `summary`). */
function GroupBudgetSummary({ groupId, currency }) {
  const { data, isLoading, isError } = useListBudgetsQuery(groupId)
  const loading = useMinDuration(isLoading, 300)
  if (loading) return <Skeleton className="h-16 w-full rounded-card" />
  if (isError || !data?.summary) return null

  const summary = data.summary
  return (
    <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
      <StatCard label="Plans" value={<span className="tabular">{data.count ?? 0}</span>} hint="group and category budgets" />
      <StatCard
        label="Budgeted"
        value={<Money minor={summary.limitMinor ?? 0} currency={data.currency ?? currency} compact className="font-display text-[30px] font-semibold" />}
        hint="sum of limits, as the server reports"
      />
      <StatCard
        label="Spent against them"
        value={<Money minor={summary.spentMinor ?? 0} currency={data.currency ?? currency} compact className="font-display text-[30px] font-semibold" />}
        hint={`${summary.overBudgetCount ?? 0} over budget`}
        tone={summary.overBudgetCount ? 'danger' : 'neutral'}
      />
      <StatCard
        label="At a threshold"
        value={<span className="tabular">{summary.atThresholdCount ?? 0}</span>}
        hint="75% or 90% crossed"
        tone={summary.atThresholdCount ? 'warning' : 'neutral'}
      />
    </div>
  )
}

function StatCard({ label, value, hint, tone = 'neutral' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-caption">{label}</p>
        <div className={`mt-1 font-display text-[30px] font-semibold ${tone === 'danger' ? 'text-danger-foreground' : tone === 'warning' ? 'text-warning' : ''}`}>
          {value}
        </div>
        <p className="text-xs text-caption">{hint}</p>
      </CardContent>
    </Card>
  )
}
