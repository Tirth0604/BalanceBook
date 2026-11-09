import { ReceiptText } from 'lucide-react'
import EmptyState from '@/components/ui/empty-state'
import ErrorState from '@/components/ui/error-state'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import ExpenseRow from './ExpenseRow'

/**
 * Expense list with the three mandatory states (docs/06 UX rule 6) and a
 * right-aligned amount column whose header carries the currency once.
 */
export function ExpenseList({
  items = [],
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'No expenses here yet',
  emptyDescription = 'Every expense you add — in any group — lands in this list, split paisa by paisa.',
  emptyAction,
  onSelect,
  selectedId,
  showGroup = true,
  currency = 'INR',
  className,
}) {
  if (loading) {
    return (
      <div className={cn('p-3', className)} aria-busy="true" aria-label="Loading expenses">
        <SkeletonList rows={5} />
      </div>
    )
  }
  if (error) return <ErrorState error={error} onRetry={onRetry} className={className} />
  if (items.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={ReceiptText}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }

  return (
    <div className={className}>
      <p className="flex items-center justify-between px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-caption">
        <span>{items.length} shown{` · `}click a row for the full split</span>
        <span className="tabular">Amount ({currency})</span>
      </p>
      <ul className="divide-y divide-border">
        {items.map((expense) => (
          <ExpenseRow
            key={expense.id}
            expense={expense}
            selected={expense.id === selectedId}
            onSelect={onSelect}
            showGroup={showGroup}
          />
        ))}
      </ul>
    </div>
  )
}

export default ExpenseList
