import { Link, useSearchParams } from 'react-router-dom'
import { Lightbulb, RefreshCw } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/button'
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import ErrorState from '@/components/ui/error-state'
import { SkeletonCard } from '@/components/ui/skeleton'
import Badge from '@/components/ui/badge'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import useMinDuration from '@/hooks/useMinDuration'
import { useGetInsightsQuery } from '@/services/endpoints/insightsApi'
import { useGetGroupQuery, useListGroupsQuery } from '@/services/endpoints/groupsApi'
import GroupPicker from '@/components/groups/GroupPicker'
import InsightCard from '@/components/insights/InsightCard'
import RecurrenceList from '@/components/insights/RecurrenceList'
import BudgetProgress from '@/components/budgets/BudgetProgress'

export default function Insights() {
  useDocumentTitle('Insights')
  const [search, setSearch] = useSearchParams()
  const groupId = search.get('groupId') ?? ''

  const groupsQuery = useListGroupsQuery({ archived: 'false', limit: 50 })
  const groups = groupsQuery.data?.items ?? groupsQuery.data ?? []
  const groupQuery = useGetGroupQuery(groupId, { skip: !groupId })
  const group = groupQuery.data ?? groups.find((g) => g.id === groupId) ?? null
  const canManage = group?.myRole === 'admin'

  const insightsQuery = useGetInsightsQuery(groupId, { skip: !groupId })
  const loading = useMinDuration(insightsQuery.isLoading, 300)

  const payload = insightsQuery.data
  const insights = payload?.insights ?? (Array.isArray(payload) ? payload : payload?.items ?? [])
  const currency = payload?.currency ?? group?.baseCurrency ?? 'INR'

  const pickGroup = (next) => {
    const params = new URLSearchParams(search)
    if (next) params.set('groupId', next)
    else params.delete('groupId')
    setSearch(params, { replace: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Insights"
        subtitle="Deterministic, rule-based readings of one group's ledger — the same rules run on the server every time, so the same numbers always produce the same cards."
        actions={
          groupId ? (
            <Button variant="outline" onClick={() => insightsQuery.refetch()}>
              <RefreshCw aria-hidden /> Recompute
            </Button>
          ) : null
        }
      />

      <GroupPicker
        groups={groups}
        value={groupId}
        onChange={pickGroup}
        loading={groupsQuery.isLoading}
        allLabel="Pick a group for insights"
        allowAll={false}
      />

      {!groupId ? (
        <Card>
          <EmptyState
            icon={Lightbulb}
            title="Insights are per group"
            description="Pick a group above. The rules read that group's ledger — spending shape, who funds it, balances that have drifted and budgets about to break."
            action={
              groups.length ? (
                <Button asChild size="sm">
                  <Link to={`/groups/${groups[0].id}`}>Open {groups[0].name}</Link>
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <>
          <section aria-label="Insight cards" className="space-y-3">
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : insightsQuery.isError ? (
              <ErrorState
                error={insightsQuery.error}
                onRetry={insightsQuery.refetch}
                message={
                  insightsQuery.error?.status === 404
                    ? 'This group’s insight rules are not published by the server yet (GET /groups/:id/insights answered 404). Balances, budgets and recurring below still work.'
                    : undefined
                }
              />
            ) : insights.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Lightbulb}
                  title="No insights yet"
                  description="The rules need a little history: a few expenses across a couple of people. Add an expense and check back."
                  action={
                    <Button asChild size="sm">
                      <Link to={`/groups/${groupId}/expenses/new`}>Add an expense</Link>
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {insights.map((insight, index) => (
                  <InsightCard key={insight.id ?? `${insight.kind ?? 'insight'}-${index}`} insight={insight} currency={currency} />
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recurring rules</CardTitle>
                <CardDescription>
                  Cadence, next due date and pause/resume. <Badge tone="outline" className="align-middle">no charge on create</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <RecurrenceList group={group} members={group?.members ?? []} canManage={canManage} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Budget thresholds</CardTitle>
                <CardDescription>Warnings at 75%, 90% and 100% of a plan — the alerts are advice, not payments.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <BudgetProgress group={group} canManage={canManage} compact />
              </CardContent>
            </Card>
          </div>

        </>
      )}
    </div>
  )
}
