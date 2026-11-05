import { Link, useSearchParams } from 'react-router-dom'
import { Lightbulb, RefreshCw } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/button'
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import ErrorState from '@/components/ui/error-state'
import { SkeletonCard } from '@/components/ui/skeleton'
import Badge from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import useMinDuration from '@/hooks/useMinDuration'
import { useGetInsightsQuery, useGetMyInsightsQuery } from '@/services/endpoints/insightsApi'
import { useGetGroupQuery, useListGroupsQuery } from '@/services/endpoints/groupsApi'
import GroupPicker from '@/components/groups/GroupPicker'
import InsightCard from '@/components/insights/InsightCard'
import RecurrenceList from '@/components/insights/RecurrenceList'
import BudgetProgress from '@/components/budgets/BudgetProgress'

export default function Insights() {
  useDocumentTitle('Insights')
  const [search, setSearch] = useSearchParams()
  const groupId = search.get('groupId') ?? ''
  // `scope=me` is the account-wide run of the same rules (GET /insights); anything else keeps
  // the group in the path as the scope.
  const isPersonal = search.get('scope') === 'me'

  const groupsQuery = useListGroupsQuery({ archived: 'false', limit: 50 })
  const groups = groupsQuery.data?.items ?? groupsQuery.data ?? []
  const groupQuery = useGetGroupQuery(groupId, { skip: !groupId })
  const group = groupQuery.data ?? groups.find((g) => g.id === groupId) ?? null
  const canManage = group?.myRole === 'admin'

  const insightsQuery = useGetInsightsQuery(groupId, { skip: !groupId })
  const mineQuery = useGetMyInsightsQuery(undefined, { skip: !isPersonal })
  const activeQuery = isPersonal ? mineQuery : insightsQuery
  const loading = useMinDuration(activeQuery.isLoading, 300)

  const payload = activeQuery.data
  const insights = payload?.insights ?? (Array.isArray(payload) ? payload : payload?.items ?? [])
  // The server reports the unit of every number it sent at scope.currency; the group's own
  // base currency is only a fallback for when no payload has landed yet.
  const scopeInfo = payload?.scope ?? null
  const currency = scopeInfo?.currency ?? group?.baseCurrency ?? 'INR'

  const setParam = (key, next) => {
    const params = new URLSearchParams(search)
    if (next) params.set(key, next)
    else params.delete(key)
    setSearch(params, { replace: true })
  }

  const pickGroup = (next) => setParam('groupId', next)
  const pickScope = (next) => setParam('scope', next === 'me' ? 'me' : null)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Insights"
        subtitle="Deterministic, rule-based readings of one group's ledger — the same rules run on the server every time, so the same numbers always produce the same cards."
        actions={
          !isPersonal && groupId ? (
            <Button variant="outline" onClick={() => insightsQuery.refetch()}>
              <RefreshCw aria-hidden /> Recompute
            </Button>
          ) : isPersonal ? (
            <Button variant="outline" onClick={() => mineQuery.refetch()}>
              <RefreshCw aria-hidden /> Recompute
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={isPersonal ? 'me' : 'group'} onValueChange={pickScope}>
          <TabsList aria-label="Insight scope">
            <TabsTrigger value="group">One group</TabsTrigger>
            <TabsTrigger value="me">My whole account</TabsTrigger>
          </TabsList>
        </Tabs>
        {!isPersonal ? (
          <GroupPicker
            groups={groups}
            value={groupId}
            onChange={pickGroup}
            loading={groupsQuery.isLoading}
            allLabel="Pick a group for insights"
            allowAll={false}
          />
        ) : (
          <span className="text-xs text-caption">
            Every active group you are in, read as one scope. Amounts are reported in{' '}
            <Badge tone="outline" className="align-middle">{currency}</Badge> — a group in another
            currency is kept out of these figures rather than converted into it.
          </span>
        )}
      </div>

      {!isPersonal && !groupId ? (
        <Card>
          <EmptyState
            icon={Lightbulb}
            title="Insights are per group"
            description="Pick a group above, or switch to My whole account for the same rules over every ledger you are in."
            action={
              groups.length ? (
                <Button size="sm" onClick={() => pickGroup(groups[0].id)}>
                  Read {groups[0].name}
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
            ) : activeQuery.isError ? (
              <ErrorState
                error={activeQuery.error}
                onRetry={activeQuery.refetch}
                message={
                  activeQuery.error?.status === 404
                    ? isPersonal
                      ? 'The account-scope insight rules are not published by the server yet (GET /insights answered 404). Switch back to One group to read a single ledger.'
                      : 'This group’s insight rules are not published by the server yet (GET /groups/:id/insights answered 404). Balances, budgets and recurring below still work.'
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
                    !isPersonal && groupId ? (
                      <Button asChild size="sm">
                        <Link to={`/groups/${groupId}/expenses/new`}>Add an expense</Link>
                      </Button>
                    ) : (
                      groups.length ? (
                        <Button asChild size="sm">
                          <Link to={`/groups/${groups[0].id}/expenses/new`}>Add an expense</Link>
                        </Button>
                      ) : null
                    )
                  }
                />
              </Card>
            ) : (
              <>
                {scopeInfo?.mode === 'me' && scopeInfo.groupCount > 1 ? (
                  <p className="text-xs text-caption">
                    {scopeInfo.groupCount} groups · generated {new Date(payload.generatedAt).toLocaleString()}
                  </p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {insights.map((insight, index) => (
                    <InsightCard
                      key={insight.id ?? `${insight.type ?? 'insight'}-${index}`}
                      insight={insight}
                      currency={currency}
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          {!isPersonal && group ? (
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
          ) : null}
        </>
      )}
    </div>
  )
}
