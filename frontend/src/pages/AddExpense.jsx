import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, PlusCircle } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Button from '@/components/ui/button'
import EmptyState from '@/components/ui/empty-state'
import ErrorState from '@/components/ui/error-state'
import Skeleton, { SkeletonCard } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import useMinDuration from '@/hooks/useMinDuration'
import { useGetGroupQuery, useListGroupsQuery } from '@/services/endpoints/groupsApi'
import { useGetExpenseQuery } from '@/services/endpoints/expensesApi'
import ExpenseForm from '@/components/expenses/ExpenseForm'

/**
 * Add / edit expense screen. Routes may arrive as
 *   /groups/:groupId/expenses/new, /groups/:groupId/expenses/:expenseId/edit
 * or bare /add-expense — in the last case a group picker takes over.
 */
export default function AddExpense() {
  const params = useParams()
  const [search, setSearch] = useSearchParams()
  const navigate = useNavigate()
  const pathGroupId = params.groupId ?? params.id ?? search.get('groupId') ?? null
  const expenseId = params.expenseId ?? search.get('expenseId') ?? null

  const [pickedGroup, setPickedGroup] = useState(search.get('groupId') ?? null)
  const groupId = pathGroupId ?? pickedGroup

  useDocumentTitle(expenseId ? 'Edit expense' : 'Add expense')

  const groupsQuery = useListGroupsQuery({ archived: 'false', limit: 50, sort: '-createdAt' })
  const groups = useMemo(() => groupsQuery.data?.items ?? groupsQuery.data ?? [], [groupsQuery.data])

  const groupQuery = useGetGroupQuery(groupId, { skip: !groupId })
  const expenseQuery = useGetExpenseQuery(expenseId, { skip: !expenseId })

  const group = groupQuery.data ?? null
  const expense = expenseQuery.data ?? null
  const loading = useMinDuration(groupQuery.isLoading || (Boolean(expenseId) && expenseQuery.isLoading), 300)

  if (!groupId) {
    if (groupsQuery.isLoading) {
      return (
        <div className="space-y-6">
          <PageHeader title="Add expense" />
          <SkeletonCard />
        </div>
      )
    }
    if (groupsQuery.isError) {
      return (
        <div className="space-y-6">
          <PageHeader title="Add expense" />
          <ErrorState error={groupsQuery.error} onRetry={groupsQuery.refetch} />
        </div>
      )
    }
    if (groups.length === 0) {
      return (
        <div className="space-y-6">
          <PageHeader title="Add expense" />
          <EmptyState
            icon={PlusCircle}
            title="No group to spend in yet"
            description="Expenses always belong to a group. Create one — or join with an invitation code — and the form opens up."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link to="/groups?create=1">Create a group</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/groups">Join with a code</Link>
                </Button>
              </div>
            }
          />
        </div>
      )
    }
    return (
      <div className="space-y-6">
        <PageHeader
          title="Add expense"
          subtitle="Pick the group this spend belongs to — the split, balances and receipts all hang off it."
        />
        <Card>
          <CardHeader>
            <CardTitle>Which group?</CardTitle>
            <CardDescription>Only groups you are an active member of are listed.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Select
              value={pickedGroup ?? ''}
              onValueChange={(value) => {
                setPickedGroup(value)
                search.set('groupId', value)
                setSearch(search, { replace: true })
              }}
            >
              <SelectTrigger className="w-full sm:w-72" aria-label="Choose a group">
                <SelectValue placeholder="Choose a group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name} · {g.baseCurrency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={!pickedGroup} onClick={() => pickedGroup && navigate(`/groups/${pickedGroup}/expenses/new`)}>
              Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={expenseId ? 'Edit expense' : 'Add expense'} back="Groups" backTo="/groups" />
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonCard />
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-60 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (groupQuery.isError && !group) {
    return (
      <div className="space-y-6">
        <PageHeader title="Add expense" back="Groups" backTo="/groups" />
        <ErrorState error={groupQuery.error} onRetry={groupQuery.refetch} />
      </div>
    )
  }

  if (expenseId && expenseQuery.isError && !expense) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit expense" back="Expense" />
        <ErrorState error={expenseQuery.error} onRetry={expenseQuery.refetch} />
      </div>
    )
  }

  const goBack = () => {
    if (expenseId) navigate(`/expenses?groupId=${groupId}&detail=${expenseId}`)
    else navigate(`/groups/${groupId}`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={expenseId ? 'Edit expense' : 'Add expense'}
        subtitle={
          group?.name
            ? `${group.name} · amounts in ${group.baseCurrency || 'INR'} · the preview below uses the server's own rounding rules`
            : 'Amounts are whole paisa end to end — the preview and the server agree by construction.'
        }
        back="Groups"
        backTo="/groups"
        actions={
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft aria-hidden />
            {expenseId ? 'View expense' : 'Group overview'}
          </Button>
        }
      />
      {expense && expense.editable === false ? (
        <ErrorState compact message="Only the payer or a group admin can edit this expense." />
      ) : null}
      <ExpenseForm
        groupId={groupId}
        group={group}
        expense={expenseId ? expense : null}
        onCancel={goBack}
        onSaved={(saved) => {
          if (saved?.id) navigate(`/expenses?groupId=${saved?.group?.id ?? groupId}&detail=${saved.id}`)
          else navigate(`/groups/${groupId}`)
        }}
      />
    </div>
  )
}
