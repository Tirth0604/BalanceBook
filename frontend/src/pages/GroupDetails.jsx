import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Archive,
  CalendarClock,
  HandCoins,
  Lightbulb,
  Plus,
  Settings2,
  Users,
  Wallet,
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import ErrorState from '@/components/ui/error-state'
import EmptyState from '@/components/ui/empty-state'
import Money from '@/components/money/Money'
import BalancePill from '@/components/money/BalancePill'
import { SkeletonCard, SkeletonList } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import useGroupAccess from '@/hooks/useGroupAccess'
import useMinDuration from '@/hooks/useMinDuration'
import { useAppSelector } from '@/store/hooks'
import { formatDate } from '@/lib/dates'
import { useGetGroupQuery } from '@/services/endpoints/groupsApi'
import { useGetGroupBalancesQuery } from '@/services/endpoints/balancesApi'
import { useListExpensesQuery } from '@/services/endpoints/expensesApi'
import GroupDetailsHeader from '@/components/groups/GroupDetailsHeader'
import MemberList from '@/components/groups/MemberList'
import MemberBalanceTable from '@/components/groups/MemberBalanceTable'
import ExpenseList from '@/components/expenses/ExpenseList'
import ExpenseDetailDrawer from '@/components/expenses/ExpenseDetailDrawer'
import InviteDialog from '@/components/groups/InviteDialog'
import EditGroupDialog from '@/components/groups/EditGroupDialog'
import RecurrenceList from '@/components/insights/RecurrenceList'
import BudgetProgress from '@/components/budgets/BudgetProgress'

/** Group workspace: identity, members, balances, recent ledger, recurring + budgets. */

export default function GroupDetails() {
  const params = useParams()
  const navigate = useNavigate()
  const groupId = params.groupId ?? params.id
  const [tab, setTab] = useState('overview')
  const [selectedExpenseId, setSelectedExpenseId] = useState(null)
  const myId = useAppSelector((state) => state.auth.user?.id)

  useDocumentTitle('Group')

  const groupQuery = useGetGroupQuery(groupId, { skip: !groupId })
  const group = groupQuery.data ?? null
  const access = useGroupAccess(group)
  const balancesQuery = useGetGroupBalancesQuery(groupId, { skip: !groupId })
  const expensesQuery = useListExpensesQuery({ groupId, limit: 10, sort: '-expenseDate' })

  const loading = useMinDuration(groupQuery.isLoading, 300)
  const balancesLoading = useMinDuration(balancesQuery.isLoading, 300)
  const expensesLoading = useMinDuration(expensesQuery.isLoading, 300)
  const balances = balancesQuery.data?.items ?? (Array.isArray(balancesQuery.data) ? balancesQuery.data : [])
  const balanceMeta = balancesQuery.data?.meta ?? {}
  const myBalance = balances.find((b) => b.isMe)
  const items = expensesQuery.data?.items ?? (Array.isArray(expensesQuery.data) ? expensesQuery.data : [])

  /** Hand the settle flow to the Settlements screen, pre-filled with this member. */
  const settleWith = (row, id) => {
    const query = new URLSearchParams({ groupId: id })
    if (row.isMe) query.set('receiver', row.user?.id ?? '')
    else query.set('payer', row.user?.id ?? '')
    navigate(`/settlements?${query.toString()}`)
  }

  if (!groupId) {
    return (
      <div className="space-y-5">
        <PageHeader title="Group" />
        <EmptyState icon={Users} title="Which group?" description="Open a group from the Groups list." action={<Button asChild><Link to="/groups">Go to groups</Link></Button>} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Group" back="Groups" backTo="/groups" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonList rows={4} />
      </div>
    )
  }

  if (groupQuery.isError && !group) {
    return (
      <div className="space-y-5">
        <PageHeader title="Group" back="Groups" backTo="/groups" />
        <ErrorState error={groupQuery.error} onRetry={groupQuery.refetch} />
      </div>
    )
  }

  const currency = group.baseCurrency || 'INR'

  return (
    <div className="space-y-5">
      <GroupDetailsHeader
        group={group}
        access={access}
        onArchived={() => groupQuery.refetch()}
        inviteSlot={
          <InviteDialog
            canManage={access.canManage}
            group={group}
            trigger={
              <Button variant="outline" disabled={!access.canManage}>
                <Users aria-hidden /> Invite
              </Button>
            }
          />
        }
        settingsSlot={
          <EditGroupDialog
            group={group}
            canManage={access.canManage}
            onArchived={() => groupQuery.refetch()}
            trigger={
              <Button variant="ghost" size="icon" aria-label="Group settings" disabled={!access.canManage}>
                <Settings2 aria-hidden />
              </Button>
            }
          />
        }
      />

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-caption">Your position</p>
            <div className="mt-2">
              {balancesQuery.isLoading ? (
                <span className="inline-block h-6 w-28 skeleton" />
              ) : myBalance ? (
                <BalancePill netMinor={myBalance.netMinor} currency={currency} label={myBalance.netMinor > 0 ? 'you are owed' : myBalance.netMinor < 0 ? 'you owe' : 'settled up'} />
              ) : (
                <Badge tone="neutral">no balance yet</Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-caption">Group spend</p>
            <Money minor={balanceMeta.groupTotalMinor ?? 0} currency={currency} className="font-display text-[30px] font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-caption">Members</p>
            <p className="font-display text-[30px] font-semibold tabular">{group.memberCount ?? group.members?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-caption">Ledger state</p>
            <p className="mt-1.5">
              {balanceMeta.isSettledUp ? (
                <Badge tone="success">settled up</Badge>
              ) : (
                <Badge tone="warning">outstanding balances</Badge>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full overflow-x-auto" aria-label="Group sections">
          <TabsTrigger value="overview">Balances</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="recurring">Recurring</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Who owes what</CardTitle>
                <CardDescription>Computed by the server after every expense and settlement.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/settlements?groupId=${group.id}`}>
                    <HandCoins className="size-4" aria-hidden /> Suggested settlements
                  </Link>
                </Button>
                <Button asChild size="sm" disabled={group.isArchived}>
                  <Link to={`/groups/${group.id}/expenses/new`}>
                    <Plus className="size-4" aria-hidden /> Add expense
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <MemberBalanceTable
                balances={balances}
                meta={balanceMeta}
                currency={currency}
                loading={balancesLoading}
                error={balancesQuery.isError ? balancesQuery.error : null}
                onRetry={balancesQuery.refetch}
                groupId={group.id}
                onSettle={(row) => settleWith(row, group.id)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Members &amp; roles</CardTitle>
                <CardDescription>
                  Admins can invite, edit the group and remove members. Removal is blocked while a member still has a
                  balance.
                </CardDescription>
              </div>
              <InviteDialog
                canManage={access.canManage}
                group={group}
                trigger={
                  <Button size="sm" variant="outline" disabled={!access.canManage}>
                    <Users className="size-4" aria-hidden /> Invite by email
                  </Button>
                }
              />
            </CardHeader>
            <CardContent className="p-0">
              <MemberList group={group} canManage={access.canManage} myId={myId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <CardTitle>Ten most recent</CardTitle>
              <Button asChild variant="link" size="sm">
                <Link to={`/expenses?groupId=${group.id}`}>All expenses</Link>
              </Button>
            </div>
            <ExpenseList
              items={items}
              loading={expensesLoading}
              error={expensesQuery.isError ? expensesQuery.error : null}
              onRetry={expensesQuery.refetch}
              onSelect={(expense) => setSelectedExpenseId(expense.id)}
              selectedId={selectedExpenseId}
              showGroup={false}
              currency={currency}
              emptyTitle="This group has no expenses yet"
              emptyDescription="Add the first one — everyone in the group sees the split immediately."
              emptyAction={
                <Button asChild size="sm" disabled={group.isArchived}>
                  <Link to={`/groups/${group.id}/expenses/new`}>
                    <Plus className="size-4" aria-hidden /> Add expense
                  </Link>
                </Button>
              }
            />
          </Card>
        </TabsContent>

        <TabsContent value="recurring">
          <Card>
            <CardHeader>
              <CardTitle>Recurring rules</CardTitle>
              <CardDescription>
                <CalendarClock className="mr-1 inline size-3.5" aria-hidden />
                Creating a rule charges nobody — an expense is written only when a due date arrives.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <RecurrenceList group={group} canManage={access.canManage} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budgets">
          <Card>
            <CardHeader>
              <CardTitle>Budgets</CardTitle>
              <CardDescription>
                <Wallet className="mr-1 inline size-3.5" aria-hidden />
                Spending plans with 75 / 90 / 100% threshold warnings. A budget never moves money.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <BudgetProgress group={group} canManage={access.canManage} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="flex flex-wrap items-center gap-2 text-xs text-caption">
        <Archive className="size-3.5" aria-hidden />
        {group.isArchived ? 'Archived: read-only ledger.' : `Created ${formatDate(group.createdAt)} by ${group.createdBy?.name ?? 'a member'}.`}
        <Link to={`/insights?groupId=${group.id}`} className="ml-auto inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
          <Lightbulb className="size-3.5" aria-hidden /> Insights for this group
        </Link>
      </p>

      <ExpenseDetailDrawer
        expense={items.find((e) => e.id === selectedExpenseId) ?? null}
        open={Boolean(selectedExpenseId)}
        onOpenChange={(open) => {
          if (!open) setSelectedExpenseId(null)
        }}
        onDeleted={() => expensesQuery.refetch()}
      />
    </div>
  )
}
