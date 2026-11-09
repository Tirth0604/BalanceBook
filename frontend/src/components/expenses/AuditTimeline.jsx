import { History } from 'lucide-react'
import Badge from '@/components/ui/badge'
import Money from '@/components/money/Money'
import Skeleton from '@/components/ui/skeleton'
import ErrorState from '@/components/ui/error-state'
import EmptyState from '@/components/ui/empty-state'
import { formatDateTime, relativeTime } from '@/lib/dates'
import { useGetExpenseAuditQuery } from '@/services/endpoints/expensesApi'

const ACTION_COPY = {
  created: { label: 'created the expense', tone: 'success' },
  updated: { label: 'updated the expense', tone: 'info' },
  deleted: { label: 'deleted the expense', tone: 'danger' },
  restored: { label: 'restored the expense', tone: 'warning' },
  receipt_added: { label: 'attached a receipt', tone: 'neutral' },
  receipt_removed: { label: 'removed the receipt', tone: 'neutral' },
}

const DIFF_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'category', label: 'Category' },
  { key: 'splitType', label: 'Split type' },
  { key: 'expenseDate', label: 'Date', render: (v) => (v ? formatDateTime(v) : '—') },
  { key: 'totalMinor', label: 'Total', money: true },
  { key: 'groupAmountMinor', label: 'Group-currency total', money: true },
  { key: 'paidBy', label: 'Paid by', render: (v) => v?.name ?? (v?.id ? 'a member' : '—') },
  { key: 'participants', label: 'Shares', render: sharesSummary },
]

function sharesSummary(participants) {
  if (!Array.isArray(participants)) return '—'
  return `${participants.length} people · ${participants
    .map((p) => `${p.userId?.name ?? p.userId?.id ?? '?'} ${p.shareMinor}`)
    .join(', ')} paise`
}

/** GET /expenses/:id/audit — append-only trail; money diffs render via <Money>. */
export function AuditTimeline({ expenseId, skip = false, currency = 'INR' }) {
  const { data, isLoading, isError, error, refetch } = useGetExpenseAuditQuery(expenseId, { skip: !expenseId })

  if (skip) return null
  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }
  if (isError) return <ErrorState error={error} onRetry={refetch} compact />

  const entries = data?.items ?? (Array.isArray(data) ? data : [])
  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        icon={History}
        title="No changes recorded"
        description="The audit trail fills up as soon as this expense is edited or its receipt changes."
      />
    )
  }

  return (
    <ol className="relative space-y-4 pl-4">
      <span className="absolute inset-y-1 left-0 w-px bg-border" aria-hidden />
      {entries.map((entry) => {
        const copy = ACTION_COPY[entry.action] ?? { label: entry.action, tone: 'neutral' }
        const diffs = changedFields(entry, currency)
        return (
          <li key={entry.id ?? `${entry.action}-${entry.createdAt}`} className="relative">
            <span className="absolute -left-[13px] top-1.5 size-2 rounded-pill bg-primary" aria-hidden />
            <p className="text-[13px] leading-snug">
              <span className="font-medium">{entry.modifiedBy?.name ?? 'Someone'}</span>{' '}
              <Badge tone={copy.tone} className="mx-1 py-0 align-middle">
                {copy.label}
              </Badge>
              <span className="text-caption" title={formatDateTime(entry.createdAt)}>
                {relativeTime(entry.createdAt)}
              </span>
            </p>
            {entry.changeSummary ? (
              <p className="mt-1 text-xs text-muted-foreground">{entry.changeSummary}</p>
            ) : null}
            {entry.reason ? (
              <p className="mt-1 text-xs text-muted-foreground">Reason: {entry.reason}</p>
            ) : null}
            {diffs.length ? (
              <ul className="mt-1.5 space-y-1 rounded-control border border-border bg-muted/50 px-2.5 py-2">
                {diffs.map((diff) => (
                  <li key={diff.label} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-medium text-muted-foreground">{diff.label}</span>
                    <span className="tabular text-caption line-through decoration-danger/60">{diff.from}</span>
                    <span aria-hidden className="text-caption">
                      →
                    </span>
                    <span className="tabular font-medium">{diff.to}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function changedFields(entry, currency) {
  const prev = entry.previousData ?? {}
  const next = entry.updatedData ?? {}
  const out = []
  for (const field of DIFF_FIELDS) {
    const before = prev[field.key]
    const after = next[field.key]
    if (before === undefined && after === undefined) continue
    if (JSON.stringify(before) === JSON.stringify(after)) continue
    out.push({
      label: field.label,
      from: renderValue(before, field, currency),
      to: renderValue(after, field, currency),
    })
  }
  return out
}

function renderValue(value, field, currency) {
  if (value === undefined || value === null) return '—'
  if (field.money) return <Money minor={value} currency={currency ?? 'INR'} className="text-xs" />
  if (field.render) {
    const rendered = field.render(value)
    return rendered
  }
  return String(value)
}

export default AuditTimeline
