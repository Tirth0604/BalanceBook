import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, ExternalLink, Pencil, ReceiptText, Trash2, UserCheck } from 'lucide-react'
import Button from '@/components/ui/button'
import Badge from '@/components/ui/badge'
import Avatar from '@/components/ui/avatar'
import Money from '@/components/money/Money'
import SplitBar from '@/components/money/SplitBar'
import { Sheet, SheetClose, SheetContent, SheetFooter } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import Skeleton from '@/components/ui/skeleton'
import ErrorState from '@/components/ui/error-state'
import { useToast } from '@/components/ui/toast'
import { formatDateTime } from '@/lib/dates'
import { basisPointsToText } from './splitModel'
import AuditTimeline from './AuditTimeline'
import { useDeleteExpenseMutation } from '@/services/endpoints/expensesApi'

/**
 * Right-hand drawer with the full expense: participants, receipt, audit trail,
 * and the two mutations the server says are allowed (`editable` / `deletable`).
 */
export function ExpenseDetailDrawer({ expense, open, onOpenChange, onDeleted }) {
  const toast = useToast()
  const [deleteExpense, deleteState] = useDeleteExpenseMutation()
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (!expense) return null
  const currency = expense.currency || expense.group?.baseCurrency || 'INR'
  const participants = expense.participants ?? []
  const totalMinor = Number(expense.totalMinor) || 0

  const remove = async () => {
    try {
      await deleteExpense({ expenseId: expense.id, groupId: expense.group?.id }).unwrap()
      toast.success('Expense deleted', 'Balances and suggestions were refreshed.')
      onOpenChange?.(false)
      onDeleted?.(expense)
    } catch (err) {
      toast.error('Could not delete', err?.message || 'The server refused this request.')
      throw err
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={expense.title || 'Expense'}
        description={`${expense.group?.name ?? 'Expense'} · ${formatDateTime(expense.expenseDate ?? expense.createdAt)}`}
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{expense.category}</Badge>
            <Badge tone="outline">{expense.splitType}</Badge>
            <Badge tone="outline">{currency}</Badge>
            {expense.recurrenceId ? <Badge tone="info">from a recurring rule</Badge> : null}
            {expense.isArchived || expense.deletedAt ? <Badge tone="danger">deleted</Badge> : null}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-caption">Total</p>
            <Money minor={totalMinor} currency={currency} className="font-display text-[30px] font-semibold" />
            {expense.groupAmountMinor != null && expense.exchangeRate ? (
              <p className="mt-1 text-xs text-muted-foreground">
                <Money minor={expense.groupAmountMinor} currency={expense.group?.baseCurrency || currency} /> at rate{' '}
                <span className="tabular">{expense.exchangeRate}</span>
              </p>
            ) : null}
          </div>

          {expense.description ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">{expense.description}</p>
          ) : null}

          <div className="rounded-card border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <h3 className="font-display text-sm font-semibold">Paid by</h3>
              <span className="flex items-center gap-2">
                <Avatar name={expense.paidBy?.name} src={expense.paidBy?.avatarUrl} size="xs" />
                <span className="text-sm font-medium">{expense.paidBy?.name ?? '—'}</span>
              </span>
            </div>
            <div className="px-3 py-3">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Shared with {participants.length}</span>
                <span className="tabular">Amount ({currency})</span>
              </div>
              <SplitBar
                className="mt-2"
                entries={participants.map((p) => ({
                  label: p.user?.name ?? 'Member',
                  shareMinor: p.shareMinor,
                }))}
                currency={currency}
              />
              <ul className="mt-2 divide-y divide-border">
                {participants.map((p) => (
                  <li key={p.user?.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar name={p.user?.name} src={p.user?.avatarUrl} size="xs" />
                      <span className="truncate">{p.user?.name ?? 'Member'}</span>
                      {p.isPayer ? (
                        <Badge tone="primary" className="py-0">
                          <UserCheck className="size-3" aria-hidden /> payer
                        </Badge>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2">
                      {p.percentage != null ? (
                        <span className="tabular text-xs text-caption">{basisPointsOf(p.percentage)}%</span>
                      ) : null}
                      <Money minor={p.shareMinor} currency={currency} className="font-medium" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Tabs defaultValue="receipt">
            <TabsList className="w-full">
              <TabsTrigger value="receipt" className="flex-1">
                Receipt
              </TabsTrigger>
              <TabsTrigger value="audit" className="flex-1">
                Audit trail
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex-1">
                Notes
              </TabsTrigger>
            </TabsList>
            <TabsContent value="receipt">
              {expense.receipt?.url ? (
                <div className="space-y-2">
                  {expense.receipt.mimeType?.startsWith('image/') ? (
                    <img
                      src={expense.receipt.url}
                      alt={`Receipt for ${expense.title}`}
                      className="max-h-64 w-full rounded-control border border-border object-contain bg-muted"
                    />
                  ) : (
                    <span className="flex size-16 items-center justify-center rounded-control border border-border bg-muted">
                      <ReceiptText className="size-6 text-caption" aria-hidden />
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {expense.receipt.fileName ?? 'receipt'} · {expense.receipt.mimeType}
                  </p>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={expense.receipt.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-4" aria-hidden /> Open
                      </a>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <a href={expense.receipt.url} download={expense.receipt.fileName ?? 'receipt'}>
                        <Download className="size-4" aria-hidden /> Download
                      </a>
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="rounded-control border border-dashed border-border bg-muted/40 px-3 py-4 text-[13px] text-muted-foreground">
                  No receipt attached. {expense.editable ? 'Edit the expense to add one.' : ''}
                </p>
              )}
            </TabsContent>
            <TabsContent value="audit">
              <AuditTimeline expenseId={expense.id} currency={currency} />
            </TabsContent>
            <TabsContent value="notes">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {expense.notes || 'No notes on this expense.'}
              </p>
              <dl className="mt-3 space-y-1 text-xs text-caption">
                <div className="flex justify-between gap-2">
                  <dt>Created by</dt>
                  <dd>{expense.createdBy?.name ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Created</dt>
                  <dd className="tabular">{formatDateTime(expense.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Last change</dt>
                  <dd className="tabular">{formatDateTime(expense.updatedAt)}</dd>
                </div>
              </dl>
            </TabsContent>
          </Tabs>
        </div>

        <SheetFooter className="flex-wrap">
          {deleteState.isLoading ? <Skeleton className="h-8 w-24" /> : null}
          {expense.editable ? (
            <SheetClose asChild>
              <Button asChild variant="outline">
                <Link to={`/expenses/${expense.id}/edit?groupId=${expense.group?.id ?? ''}`}>
                  <Pencil className="size-4" aria-hidden /> Edit
                </Link>
              </Button>
            </SheetClose>
          ) : null}
          {expense.deletable ? (
            <Button variant="danger-outline" onClick={() => setConfirmOpen(true)} loading={deleteState.isLoading}>
              <Trash2 aria-hidden /> Delete
            </Button>
          ) : null}
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete this expense?"
            description={`“${expense.title}” and its split will be removed from the ledger. Balances, suggested settlements and analytics recompute immediately — the audit trail keeps the record.`}
            confirmLabel="Delete expense"
            onConfirm={remove}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function basisPointsOf(percentage) {
  const n = Number(percentage)
  if (!Number.isFinite(n)) return '—'
  return basisPointsToText(Math.round(n * 100))
}

/** Standalone error surface for a failed detail fetch. */
export function ExpenseDetailError({ error, onRetry }) {
  return <ErrorState error={error} onRetry={onRetry} compact />
}

export default ExpenseDetailDrawer
