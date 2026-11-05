import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { Plus, ReceiptText } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/button'
import Card from '@/components/ui/card'
import Pagination from '@/components/ui/pagination'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import useMinDuration from '@/hooks/useMinDuration'
import { format } from '@/lib/money'
import { sumMinor } from '@/lib/money'
import { useListExpensesQuery, useMetaCategoriesQuery, useGetExpenseQuery } from '@/services/endpoints/expensesApi'
import { useListGroupsQuery, useGetGroupQuery } from '@/services/endpoints/groupsApi'
import ExpenseFilters, { EMPTY_FILTERS } from '@/components/expenses/ExpenseFilters'
import ExpenseList from '@/components/expenses/ExpenseList'
import ExpenseDetailDrawer from '@/components/expenses/ExpenseDetailDrawer'

const LIMIT = 20

export default function Expenses() {
  useDocumentTitle('Expenses')
  const [search, setSearch] = useSearchParams()

  const [filters, setFilters] = useState(() => ({
    ...EMPTY_FILTERS,
    groupId: search.get('groupId') ?? '',
    category: search.get('category') ?? '',
  }))
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(search.get('detail') ?? null)

  const groupsQuery = useListGroupsQuery({ archived: 'false', limit: 50 })
  const groups = groupsQuery.data?.items ?? groupsQuery.data ?? []
  const categoriesQuery = useMetaCategoriesQuery(undefined)
  const categories = categoriesQuery.data?.categories ?? []

  // member list for the payer filter — the group's own roster when one is picked
  const groupQuery = useGetGroupQuery(filters.groupId, { skip: !filters.groupId })
  const groupMembers = groupQuery.data?.members ?? []

  const queryArgs = useMemo(
    () => ({
      page,
      limit: LIMIT,
      sort: filters.sort,
      search: filters.search || undefined,
      category: filters.category || undefined,
      groupId: filters.groupId || undefined,
      paidBy: filters.paidBy || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      minAmount: filters.minAmount || undefined,
      maxAmount: filters.maxAmount || undefined,
    }),
    [page, filters],
  )

  const listQuery = useListExpensesQuery(queryArgs)
  const items = listQuery.data?.items ?? (Array.isArray(listQuery.data) ? listQuery.data : [])
  const meta = listQuery.data?.meta ?? {}
  const detailQuery = useGetExpenseQuery(selectedId, { skip: !selectedId })
  const detail = detailQuery.data ?? items.find((e) => e.id === selectedId) ?? null

  const loading = useMinDuration(listQuery.isLoading, 300)

  // page resets whenever anything but the page itself changes
  useEffect(() => {
    setPage(1)
  }, [filters])

  useEffect(() => {
    const next = new URLSearchParams(search)
    if (filters.groupId) next.set('groupId', filters.groupId)
    else next.delete('groupId')
    if (selectedId) next.set('detail', selectedId)
    else next.delete('detail')
    if (next.toString() !== search.toString()) setSearch(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.groupId, selectedId])

  const payerOptions = useMemo(() => {
    if (groupMembers.length) return groupMembers
    const byId = new Map()
    for (const expense of items) {
      if (expense.paidBy?.id) byId.set(expense.paidBy.id, { user: expense.paidBy })
    }
    return [...byId.values()]
  }, [groupMembers, items])

  const shownTotalMinor = sumMinor(items.map((e) => e.totalMinor))
  const currency = items[0]?.currency || groupQuery.data?.baseCurrency || 'INR'
  // the count the reader sees is the server's count of matching rows, not this page's length
  const matchedCount = meta.total ?? items.length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Expenses"
        subtitle="Every split you are part of, across all groups. Amounts come straight from the ledger — nothing here is re-computed in the browser."
        actions={
          <Button asChild>
            <Link to={filters.groupId ? `/groups/${filters.groupId}/expenses/new` : '/expenses/new'}>
              <Plus aria-hidden /> Add expense
            </Link>
          </Button>
        }
      />

      <ExpenseFilters
        value={filters}
        onChange={setFilters}
        groups={groups}
        categories={categories}
        members={payerOptions}
        className="rounded-card border border-border bg-card p-4 shadow-sm"
      />

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
          <span aria-live="polite">
            {loading || listQuery.isError
              ? 'Loading your ledger…'
              : `${matchedCount} expense${matchedCount === 1 ? '' : 's'} match these filters`}
          </span>
          {!loading && !listQuery.isError && items.length ? (
            <span className="tabular">
              On this page: {format(shownTotalMinor, currency)}
            </span>
          ) : null}
        </div>

        <ExpenseList
          items={items}
          loading={loading}
          error={listQuery.isError ? listQuery.error : null}
          onRetry={listQuery.refetch}
          onSelect={(expense) => setSelectedId(expense.id)}
          selectedId={selectedId}
          currency={currency}
          emptyTitle={
            filters.search || filters.category || filters.groupId || filters.paidBy ? 'Nothing matches those filters' : 'No expenses yet'
          }
          emptyDescription={
            filters.search || filters.category || filters.groupId || filters.paidBy
              ? 'Loosen a filter — or clear them all — to see the rest of the ledger.'
              : 'Add the first expense and this list becomes the shared ledger for your group.'
          }
          emptyAction={
            filters.search || filters.category || filters.groupId || filters.paidBy ? (
              <Button size="sm" variant="outline" onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}>
                Clear filters
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link to="/groups">
                  <ReceiptText className="size-4" aria-hidden /> Start a group
                </Link>
              </Button>
            )
          }
        />

        <div className="border-t border-border px-4 py-3">
          <Pagination page={meta.page ?? page} totalPages={meta.totalPages ?? 1} onPageChange={setPage} />
        </div>
      </Card>

      <ExpenseDetailDrawer
        expense={detail}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
        onDeleted={() => setSelectedId(null)}
      />
    </div>
  )
}
