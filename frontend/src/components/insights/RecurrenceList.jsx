import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Pause, Play, Plus, RefreshCw, Repeat, Trash2 } from 'lucide-react'
import Avatar from '@/components/ui/avatar'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import EmptyState from '@/components/ui/empty-state'
import ErrorState from '@/components/ui/error-state'
import Money from '@/components/money/Money'
import { SkeletonList } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { formatDate, relativeTime } from '@/lib/dates'
import { useMetaCategoriesQuery } from '@/services/endpoints/expensesApi'
import {
  useDeleteRecurringMutation,
  useListRecurringQuery,
  usePauseRecurringMutation,
  useResumeRecurringMutation,
} from '@/services/endpoints/recurringApi'
import RecurringFormDialog from './RecurringFormDialog'
import { describeCadence, nextDueLabel } from './nextDue'

/**
 * Recurring rules for one group. The header states the guarantee the server
 * makes: creating a rule charges nobody — an expense is written on the due date.
 */
export function RecurrenceList({ group, members = [], canManage = false }) {
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [pendingCancel, setPendingCancel] = useState(null)

  const groupId = group?.id
  const { data, isLoading, isError, error, refetch } = useListRecurringQuery(groupId, { skip: !groupId })
  const categoriesQuery = useMetaCategoriesQuery(undefined)
  const [pause, pauseState] = usePauseRecurringMutation()
  const [resume, resumeState] = useResumeRecurringMutation()
  const [cancelRule] = useDeleteRecurringMutation()

  const rules = data?.items ?? (Array.isArray(data) ? data : [])
  const busy = pauseState.isLoading || resumeState.isLoading

  const togglePause = async (rule) => {
    try {
      if (rule.isPaused) {
        const result = await resume({ recurringId: rule.id, groupId }).unwrap()
        const skipped = result?.skippedOccurrences?.length ?? 0
        toast.success('Rule resumed', skipped ? `${skipped} missed date(s) were dropped — not billed retroactively.` : 'Due dates continue.')
      } else {
        await pause({ recurringId: rule.id, groupId }).unwrap()
        toast.info('Rule paused', 'No expenses will be generated until it resumes.')
      }
    } catch (err) {
      toast.error('Could not change the rule', err?.message)
    }
  }

  const cancel = async (rule) => {
    try {
      await cancelRule({ recurringId: rule.id, groupId }).unwrap()
      toast.success('Rule cancelled', 'Expenses already generated stay in the ledger.')
      setPendingCancel(null)
    } catch (err) {
      toast.error('Could not cancel the rule', err?.message)
      throw err
    }
  }

  if (isLoading) {
    return (
      <div className="p-4" aria-busy="true">
        <SkeletonList rows={2} className="[&>div]:p-3" />
      </div>
    )
  }
  if (isError) return <ErrorState error={error} onRetry={refetch} className="m-4" />

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="flex items-center gap-1.5 text-xs text-caption">
          <Repeat className="size-3.5" aria-hidden />
          A rule is a promise about the future — it never charges anyone today.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => refetch()}>
            <RefreshCw className="size-3.5" aria-hidden /> Refresh
          </Button>
          <Button size="sm" onClick={() => setFormOpen(true)} disabled={!canManage || group?.isArchived}>
            <Plus className="size-4" aria-hidden /> New rule
          </Button>
        </div>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          className="m-4"
          icon={CalendarClock}
          title="No recurring rules"
          description="Rent, streaming subscriptions, the monthly cleaning — set the cadence once and each due date becomes a normal, splittable expense."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="size-4" aria-hidden /> Create a rule
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link to={`/groups/${groupId}/expenses/new`}>Add a one-off expense</Link>
              </Button>
            )
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {rules.map((rule) => (
            <li key={rule.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="text-sm font-medium">{rule.title}</p>
                <Badge tone="outline">{rule.categoryLabel ?? rule.category}</Badge>
                {rule.isPaused ? <Badge tone="warning">paused</Badge> : <Badge tone="success">active</Badge>}
                {rule.remainingOccurrences != null ? <Badge tone="neutral">{rule.remainingOccurrences} left</Badge> : null}
                <Money
                  minor={rule.totalMinor}
                  currency={rule.currency}
                  className="ml-auto text-sm font-semibold"
                />
              </div>

              <p className="mt-1 text-xs text-caption">
                {describeCadence({ frequency: rule.frequency, interval: rule.interval, startDate: rule.startDate, endDate: rule.endDate, maxOccurrences: rule.maxOccurrences })}
                {' · next due '}
                <span className="font-medium text-foreground">{nextDueLabel(rule.nextDueDate)}</span>
                {rule.lastGeneratedAt ? ` · last generated ${relativeTime(rule.lastGeneratedAt)}` : ' · nothing generated yet'}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {rule.paidBy ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Avatar name={rule.paidBy.name} src={rule.paidBy.avatarUrl} size="xs" /> pays each time
                  </span>
                ) : null}
                <span className="text-xs text-caption">split {rule.splitType} between {rule.participants?.length ?? 0}</span>
                {canManage ? (
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => togglePause(rule)} disabled={busy}>
                      {rule.isPaused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
                      {rule.isPaused ? 'Resume' : 'Pause'}
                    </Button>
                    <Button size="sm" variant="danger-outline" onClick={() => setPendingCancel(rule)} disabled={busy}>
                      <Trash2 className="size-4" aria-hidden /> Cancel rule
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <RecurringFormDialog
        group={group}
        members={members.length ? members : group?.members ?? []}
        categories={categoriesQuery.data?.categories ?? []}
        open={formOpen}
        onOpenChange={setFormOpen}
      />

      <ConfirmDialog
        open={Boolean(pendingCancel)}
        onOpenChange={(open) => {
          if (!open) setPendingCancel(null)
        }}
        title={pendingCancel ? `Cancel “${pendingCancel.title}”?` : 'Cancel this rule?'}
        description="No further expenses will be generated. Anything already written to the ledger stays exactly as it is."
        confirmLabel="Cancel rule"
        onConfirm={() => cancel(pendingCancel)}
      />

      <p className="px-4 pb-4 pt-2 text-xs text-caption">
        {formatDate(new Date())} · pausing a rule drops the dates that passed while it was off — the server does not bill
        them retroactively.
      </p>
    </div>
  )
}

export default RecurrenceList
