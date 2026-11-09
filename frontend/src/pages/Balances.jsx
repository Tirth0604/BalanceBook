import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, HandCoins, Scale } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/button'
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import ErrorState from '@/components/ui/error-state'
import EmptyState from '@/components/ui/empty-state'
import Money from '@/components/money/Money'
import { sumMinor } from '@/lib/money'
import BalancePill from '@/components/money/BalancePill'
import { SkeletonCard } from '@/components/ui/skeleton'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import useMinDuration from '@/hooks/useMinDuration'
import { useListGroupsQuery } from '@/services/endpoints/groupsApi'
import { useGetGroupBalancesQuery } from '@/services/endpoints/balancesApi'
import GroupPicker from '@/components/groups/GroupPicker'
import MemberBalanceTable from '@/components/groups/MemberBalanceTable'

/**
 * Balances are read, never recomputed: every number on this screen comes from
 * GET /groups/:id/balances (docs/03 Balance DTO + meta.isSettledUp).
 */
export default function Balances() {
  useDocumentTitle('Balances')
  const [search, setSearch] = useSearchParams()
  const navigate = useNavigate()
  const groupId = search.get('groupId') ?? ''
  const [sort, setSort] = useState('magnitude')

  const groupsQuery = useListGroupsQuery({ archived: 'false', limit: 50 })
  const groups = groupsQuery.data?.items ?? groupsQuery.data ?? []

  const balancesQuery = useGetGroupBalancesQuery(groupId, { skip: !groupId })
  const loading = useMinDuration(balancesQuery.isLoading || groupsQuery.isLoading, 300)

  const rows = balancesQuery.data?.items ?? (Array.isArray(balancesQuery.data) ? balancesQuery.data : [])
  const meta = balancesQuery.data?.meta ?? {}
  const currency = meta.currency ?? groups.find((g) => g.id === groupId)?.baseCurrency ?? 'INR'

  const sorted = useMemo(() => {
    const list = [...rows]
    if (sort === 'name') return list.sort((a, b) => (a.displayName ?? a.user?.name ?? '').localeCompare(b.displayName ?? b.user?.name ?? ''))
    return list.sort((a, b) => Math.abs(Number(b.netMinor) || 0) - Math.abs(Number(a.netMinor) || 0))
  }, [rows, sort])

  const mine = rows.find((row) => row.isMe)
  const creditors = rows.filter((row) => Number(row.netMinor) > 0)
  const debtors = rows.filter((row) => Number(row.netMinor) < 0)

  const settleWith = (row) => {
    const params = new URLSearchParams({ groupId })
    params.set(row.isMe ? 'receiver' : 'payer', row.user?.id ?? '')
    navigate(`/settlements?${params.toString()}`)
  }

  const pickGroup = (next) => {
    const params = new URLSearchParams(search)
    if (next) params.set('groupId', next)
    else params.delete('groupId')
    setSearch(params, { replace: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Balances"
        subtitle="Who owes whom, per group. These positions are derived by the server's ledger engine — this screen only renders them."
        actions={
          groupId ? (
            <Button asChild variant="outline">
              <Link to={`/settlements?groupId=${groupId}`}>
                <HandCoins aria-hidden /> Suggested settlements
              </Link>
            </Button>
          ) : null
        }
      />

      <GroupPicker
        groups={groups}
        value={groupId}
        onChange={pickGroup}
        loading={groupsQuery.isLoading}
        allLabel="Pick a group to see balances"
        allowAll={false}
      />

      {!groupId ? (
        <Card>
          <EmptyState
            icon={Scale}
            title="No group selected"
            description="Balances only exist inside a group's ledger. Pick one above — your position, and everyone else's, appears instantly."
          />
        </Card>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : balancesQuery.isError ? (
        <ErrorState error={balancesQuery.error} onRetry={balancesQuery.refetch} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Scale}
            title="No balances in this group yet"
            description="The moment somebody pays for something shared, their position appears here."
            action={
              <Button asChild size="sm">
                <Link to={`/groups/${groupId}/expenses/new`}>Add the first expense</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wide text-caption">Your position</p>
                <div className="mt-2">
                  {mine ? (
                    <BalancePill
                      netMinor={mine.netMinor}
                      currency={currency}
                      label={mine.netMinor > 0 ? 'owed to you' : mine.netMinor < 0 ? 'you owe' : 'settled up'}
                    />
                  ) : (
                    <Badge tone="neutral">not in this group</Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-caption">
                  {mine?.netMinor > 0
                    ? 'Money you put in that others still owe you.'
                    : mine?.netMinor < 0
                      ? 'Pay the people listed under “owed to them”.'
                      : 'You have nothing outstanding here.'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-caption">
                  <ArrowDownLeft className="size-3.5" aria-hidden /> Owed to {creditors.length} member{creditors.length === 1 ? '' : 's'}
                </p>
                <Money minor={sumMinor(creditors.map((r) => Math.abs(Number(r.netMinor) || 0)))} currency={currency} className="font-display text-[30px] font-semibold text-success-foreground" />
                <p className="text-xs text-caption">sum of positive nets, as the server reports them</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-caption">
                  <ArrowUpRight className="size-3.5" aria-hidden /> Owed by {debtors.length} member{debtors.length === 1 ? '' : 's'}
                </p>
                <Money minor={sumMinor(debtors.map((r) => Math.abs(Number(r.netMinor) || 0)))} currency={currency} className="font-display text-[30px] font-semibold text-danger-foreground" />
                <p className="text-xs text-caption">sum of negative nets, shown as a positive amount</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wide text-caption">Group total spent</p>
                <Money minor={meta.groupTotalMinor ?? 0} currency={currency} className="font-display text-[30px] font-semibold" />
                {meta.isSettledUp ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-success-foreground" role="status">
                    <CheckCircle2 className="size-3.5" aria-hidden /> settled up
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-caption">not settled — {creditors.length + debtors.length} positions open</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Every member</CardTitle>
                <CardDescription>
                  Positive net = they are owed. Negative = they owe. Amounts are right-aligned and in {currency}.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {sort === 'name' ? (
                  <Button size="sm" variant="outline" onClick={() => setSort('magnitude')}>
                    Sort by size
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setSort('name')}>
                    Sort A–Z
                  </Button>
                )}
                <Button asChild size="sm">
                  <Link to={`/settlements?groupId=${groupId}`}>
                    <HandCoins className="size-4" aria-hidden /> Settle up
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <MemberBalanceTable
                balances={sorted}
                meta={meta}
                currency={currency}
                groupId={groupId}
                onSettle={(row) => settleWith(row)}
              />
            </CardContent>
          </Card>

          <p className="text-xs text-caption">
            The “Settle” button opens the payment form pre-filled with that member — recording a payment does not move
            money, it asks the receiver to confirm what already happened.
          </p>
        </>
      )}
    </div>
  )
}
