import { memo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ReceiptText } from 'lucide-react'
import Avatar, { AvatarStack } from '@/components/ui/avatar'
import Badge from '@/components/ui/badge'
import Money from '@/components/money/Money'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'

/**
 * One ledger row. Left = who paid, middle = who shares, right = the amount
 * (right-aligned tabular, currency explicit in the list header).
 */
function ExpenseRowBase({ expense, selected = false, onSelect, showGroup = true }) {
  const currency = expense.currency || expense.group?.baseCurrency || 'INR'
  const payer = expense.paidBy
  const sharers = expense.participants ?? []
  const others = sharers.filter((p) => p.user?.id !== payer?.id)

  const open = () => onSelect?.(expense)

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            open()
          }
        }}
        aria-pressed={selected}
        className={cn(
          'group grid min-h-14 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto]',
          selected && 'bg-primary-muted/60',
        )}
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            {expense.title}
            {expense.receipt ? <ReceiptText className="size-3.5 shrink-0 text-caption" aria-label="Receipt attached" /> : null}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-caption">
            <span>{formatDate(expense.expenseDate)}</span>
            <span aria-hidden>·</span>
            <Badge tone="outline" className="py-0">
              {expense.category}
            </Badge>
            {showGroup && expense.group?.name ? (
              <>
                <span aria-hidden>·</span>
                <Link
                  to={`/groups/${expense.group.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="truncate underline-offset-2 hover:text-primary hover:underline"
                >
                  {expense.group.name}
                </Link>
              </>
            ) : null}
          </p>
        </div>

        {/* who paid → who shares, never colour alone */}
        <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
          {payer ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar name={payer.name} src={payer.avatarUrl} size="xs" />
              <span className="truncate text-xs text-muted-foreground">{payer.name}</span>
            </span>
          ) : null}
          <span className="text-xs text-caption" aria-hidden>
            splits with
          </span>
          {others.length ? (
            <>
              <AvatarStack members={others.map((p) => ({ user: p.user }))} max={3} size="xs" />
              <span className="text-xs text-caption">
                {others.length} other{others.length === 1 ? '' : 's'}
              </span>
            </>
          ) : (
            <span className="text-xs text-caption">only them</span>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Money
            minor={expense.totalMinor}
            currency={currency}
            className={cn('text-sm font-semibold', selected ? 'text-primary' : 'text-foreground')}
          />
          <ChevronRight className="size-4 shrink-0 text-caption transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>
      </div>
    </li>
  )
}

export const ExpenseRow = memo(ExpenseRowBase)
export default ExpenseRow
