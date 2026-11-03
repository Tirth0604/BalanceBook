import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Plus, Target, Trash2, Wallet } from 'lucide-react'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import EmptyState from '@/components/ui/empty-state'
import ErrorState from '@/components/ui/error-state'
import Progress from '@/components/ui/progress'
import Skeleton, { SkeletonList } from '@/components/ui/skeleton'
import Money from '@/components/money/Money'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { useDeleteBudgetMutation, useListBudgetsQuery } from '@/services/endpoints/budgetsApi'
import { useMetaCategoriesQuery } from '@/services/endpoints/expensesApi'
import BudgetFormDialog from './BudgetFormDialog'

/** Threshold bands the server warns at: 75 / 90 / 100 % (docs/03 budgets). */
export function thresholdState(budget) {
  const percent = Number(budget?.percentUsed) || 0
  if (budget?.isOverBudget || percent >= 100) return { tone: 'danger', words: 'over budget', indicator: 'danger' }
  if (percent >= 90) return { tone: 'danger', words: '90% used', indicator: 'danger' }
  if (percent >= 75) return { tone: 'warning', words: '75% used', indicator: 'warning' }
  return { tone: 'success', words: 'on track', indicator: 'primary' }
}

/** One budget: limit, spent, remaining and a threshold-coloured bar (never colour alone). */
export function BudgetBar({ budget, onDelete, canManage = false, busy = false }) {
  const state = thresholdState(budget)
  const currency = budget.currency || 'INR'
  const limitMinor = Number(budget.limitMinor) || 0
  const spentMinor = Number(budget.spentMinor) || 0
  const remainingMinor = Number(budget.remainingMinor ?? limitMinor - spentMinor)

  return (
    <li className="space-y-2 border-b border-border px-4 py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            <span className="truncate">{budget.title || budget.label || (budget.scope === 'category' ? `${budget.categoryLabel ?? budget.category} budget` : 'Group budget')}</span>
            {budget.scope === 'category' ? <Badge tone="outline" className="py-0">{budget.categoryLabel ?? budget.category}</Badge> : null}
            {budget.period === 'monthly' && budget.periodKey ? <Badge tone="neutral" className="py-0 tabular">{budget.periodKey}</Badge> : null}
          </p>
          <p className="text-xs text-caption">
            {budget.expenseCount ?? 0} expense{budget.expenseCount === 1 ? '' : 's'} counted · limit{' '}
            <span className="tabular">{budget.display ?? ''}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={state.tone}>
            {state.tone === 'success' ? <CheckCircle2 className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
            {state.words}
          </Badge>
          {canManage && onDelete ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete ${budget.title || 'budget'}`}
              loading={busy}
              onClick={() => onDelete(budget)}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      <Progress
        value={Math.min(percentSafe(budget), 100)}
        max={100}
        tone={state.indicator}
        label={`${budget.title || 'Budget'}: ${state.words}`}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          Spent <Money minor={spentMinor} currency={currency} className="font-semibold text-foreground" /> of{' '}
          <Money minor={limitMinor} currency={currency} className="font-semibold text-foreground" />
        </span>
        <span className={cn('flex items-baseline gap-1 text-[13px] tabular', remainingMinor < 0 ? 'text-danger-foreground' : 'text-success-foreground')}>
          {remainingMinor < 0 ? <span>over by</span> : <span>left</span>}
          <Money minor={Math.abs(remainingMinor)} currency={currency} className="font-semibold" />
        </span>
      </div>
    </li>
  )
}

/**
 * Group budgets section: server-derived spend against each plan. Creating or
 * editing a plan never moves money — the copy says so on the empty state and
 * in the dialog.
 */
export function BudgetProgress({ group, canManage = false, compact = false }) {
  const toast = useToast()
  const [dialog, setDialog] = useState({ open: false, budget: null })
  const [pendingDelete, setPendingDelete] = useState(null)

  const { data, isLoading, isError, error, refetch } = useListBudgetsQuery(group?.id, { skip: !group?.id })
  const categoriesQuery = useMetaCategoriesQuery(undefined)
  const categories = categoriesQuery.data?.categories ?? []
  const [deleteBudget, deleteState] = useDeleteBudgetMutation()

  const budgets = useMemo(() => data?.budgets ?? data?.items ?? (Array.isArray(data) ? data : []), [data])
  const summary = data?.summary

  if (isLoading) {
    return (
      <div className="p-4" aria-busy="true">
        <SkeletonList rows={compact ? 2 : 3} className="[&>div]:p-3" />
      </div>
    )
  }
  if (isError) return <ErrorState error={error} onRetry={refetch} className="m-4" />

  const remove = async (budget) => {
    try {
      await deleteBudget({ budgetId: budget.id, groupId: group.id }).unwrap()
      toast.success('Budget removed', 'Spending keeps being tracked; the plan and its alerts are gone.')
      setPendingDelete(null)
    } catch (err) {
      toast.error('Could not delete the budget', err?.message)
      throw err
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-caption">
          {summary ? (
            <>
              <Badge tone={summary.overBudgetCount ? 'danger' : 'neutral'}>{summary.overBudgetCount ?? 0} over budget</Badge>
              <Badge tone={summary.atThresholdCount ? 'warning' : 'neutral'}>{summary.atThresholdCount ?? 0} at a threshold</Badge>
            </>
          ) : null}
          <span>A budget only watches the ledger — it never pays anyone.</span>
        </div>
        <Button size="sm" onClick={() => setDialog({ open: true, budget: null })} disabled={!canManage || group?.isArchived}>
          <Plus className="size-4" aria-hidden /> {budgets.length ? 'Add another' : 'Set a budget'}
        </Button>
      </div>

      {budgets.length === 0 ? (
        <EmptyState
          className="m-4"
          icon={Wallet}
          title="No budget for this group yet"
          description="Cap the whole group or one category. You get warnings at 75%, 90% and 100% — and no charge is ever made for you."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setDialog({ open: true, budget: null })}>
                <Target className="size-4" aria-hidden /> Set the first budget
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link to={`/insights?groupId=${group?.id}`}>See insights instead</Link>
              </Button>
            )
          }
        />
      ) : (
        <ul>
          {budgets.map((budget) => (
            <BudgetBar key={budget.id} budget={budget} canManage={canManage} onDelete={setPendingDelete} busy={deleteState.isLoading} />
          ))}
        </ul>
      )}

      <BudgetFormDialog
        group={group}
        categories={categories}
        open={dialog.open}
        budget={dialog.budget}
        onOpenChange={(open) => setDialog((d) => ({ open, budget: d.budget }))}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="Delete this budget?"
        description="The plan and its threshold alerts disappear. Expenses and balances are untouched."
        confirmLabel="Delete budget"
        onConfirm={() => remove(pendingDelete)}
      />

      {!canManage && budgets.length ? (
        <p className="px-4 pb-3 pt-2 text-xs text-caption">Only admins can change budgets.</p>
      ) : null}

      {isLoading ? <Skeleton className="sr-only" /> : null}
    </div>
  )
}

function percentSafe(budget) {
  const value = Number(budget?.percentUsed)
  return Number.isFinite(value) ? value : 0
}

export default BudgetProgress
