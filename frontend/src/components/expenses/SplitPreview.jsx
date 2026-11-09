import { Coins, Info } from 'lucide-react'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import Money from '@/components/money/Money'
import SplitBar from '@/components/money/SplitBar'
import AmountInput from '@/components/money/AmountInput'
import Input from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { basisPointsToText, SPLIT_EQUAL, SPLIT_EXACT, SPLIT_PERCENTAGE } from './splitModel'

/**
 * LIVE split preview (docs/06 UX rule 8): one row per participant showing the
 * exact paisa they carry, the derived percentage, and a flag on every row that
 * absorbed a remainder paisa. Amounts are right-aligned tabular; colour is
 * never the only signal (words + icons carry the state).
 */
export function SplitPreview({
  plan,
  currency = 'INR',
  shareValues = {},
  percentValues = {},
  onShareChange,
  onPercentageChange,
  onAssignRemainder,
  disabled = false,
  className,
}) {
  const { splitType, rows, totalMinor, sumMinor, deltaMinor, remainderMinor, remainderCarriers, reconciled, errors } = plan
  const editable = splitType === SPLIT_EXACT ? Boolean(onShareChange) : splitType === SPLIT_PERCENTAGE ? Boolean(onPercentageChange) : false

  if (totalMinor === null || rows.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-control border border-dashed border-border bg-muted/50 px-4 py-5 text-[13px] text-muted-foreground',
          className,
        )}
      >
        <Info className="size-4 shrink-0" aria-hidden />
        {rows.length === 0
          ? 'Pick who shares this expense and the split appears here, paisa by paisa.'
          : 'Enter the amount and the split appears here, paisa by paisa.'}
      </div>
    )
  }

  const barEntries = rows
    .filter((r) => Number.isInteger(r.shareMinor))
    .map((r) => ({ label: r.name || 'Member', shareMinor: r.shareMinor }))

  return (
    <div className={cn('rounded-card border border-border bg-card', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-primary" aria-hidden />
          <h3 className="font-display text-sm font-semibold">Split preview</h3>
        </div>
        <Badge tone={reconciled ? 'success' : 'warning'}>
          {reconciled ? 'reconciled' : 'needs attention'}
        </Badge>
      </div>

      <div className="px-4 py-3">
        <SplitBar entries={barEntries} currency={currency} />

        <table className="mt-3 w-full border-collapse text-sm">
          <caption className="sr-only">Who carries which share of this expense</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-caption">
              <th scope="col" className="py-1.5 text-left font-medium">
                Person
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {editable ? (splitType === SPLIT_PERCENTAGE ? '% you set' : 'you enter') : 'share'}
              </th>
              <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                Carries ({currency})
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.userId} className="align-middle">
                <td className="py-2 pr-2">
                  <span className="block truncate font-medium">{row.name || 'Member'}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {row.isPayer ? <Badge tone="outline" className="py-0">paid this</Badge> : null}
                    {row.carriesRemainderPenny ? (
                      <Badge tone="info" className="py-0" title="Absorbed one remainder paisa">
                        +1 paisa remainder
                      </Badge>
                    ) : null}
                  </span>
                  {row.error ? (
                    <span className="mt-1 block text-xs text-danger-foreground" role="status">
                      {row.error}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 text-right">
                  {editable && splitType === SPLIT_EXACT ? (
                    <AmountInput
                      value={shareValues[row.userId] ?? ''}
                      onValueChange={(next) => onShareChange(row.userId, next)}
                      currency={currency}
                      disabled={disabled}
                      align="right"
                      showSymbol={false}
                      invalid={Boolean(row.error)}
                      className="w-28 justify-end"
                      aria-label={`Exact share for ${row.name || 'member'}`}
                    />
                  ) : editable && splitType === SPLIT_PERCENTAGE ? (
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={percentValues[row.userId] ?? ''}
                      onChange={(e) => onPercentageChange(row.userId, e.target.value)}
                      disabled={disabled}
                      invalid={Boolean(row.error)}
                      className="ml-auto h-9 w-24 text-right tabular"
                      aria-label={`Percentage for ${row.name || 'member'}`}
                    />
                  ) : (
                    <span className="tabular text-[13px] text-muted-foreground">
                      {row.percentBasisPoints === null ? '—' : `${basisPointsToText(row.percentBasisPoints)}%`}
                    </span>
                  )}
                </td>
                <td className="py-2 pl-3 text-right">
                  {Number.isInteger(row.shareMinor) ? (
                    <Money
                      minor={row.shareMinor}
                      currency={currency}
                      className={cn('font-medium', row.carriesRemainderPenny && 'text-info')}
                    />
                  ) : (
                    <span className="tabular text-caption">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-3 space-y-1.5 rounded-control bg-muted px-3 py-2.5 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Expense total</dt>
            <dd>
              <Money minor={totalMinor} currency={currency} className="font-semibold" />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Assigned</dt>
            <dd className="flex items-center gap-2">
              <Money minor={sumMinor} currency={currency} className="font-semibold" />
              {!reconciled && splitType !== SPLIT_EQUAL ? (
                <span
                  className={cn(
                    'tabular text-xs',
                    deltaMinor > 0 ? 'text-danger-foreground' : 'text-warning',
                  )}
                  role="status"
                >
                  {deltaMinor > 0 ? `${absText(deltaMinor, currency)} over` : `${absText(-deltaMinor, currency)} left`}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>

        {splitType === SPLIT_EQUAL && remainderMinor > 0 ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {totalMinor} paisa ÷ {rows.length} people leaves {remainderMinor} paisa.{' '}
            {remainderCarriers} {remainderCarriers === 1 ? 'person carries' : 'people each carry'} one extra paisa —
            the same deterministic rule the server applies.
          </p>
        ) : null}

        {splitType === SPLIT_PERCENTAGE && !reconciled && plan.percentBasisPoints !== 10000 ? (
          <p className="mt-2 text-xs text-warning" role="status">
            Currently {basisPointsToText(plan.percentBasisPoints)}% — the total must be exactly 100.00% before you can
            save.
          </p>
        ) : null}

        {errors.shares && splitType === SPLIT_EXACT && plan.distributeRemainderTo && onAssignRemainder ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={disabled}
            onClick={() => onAssignRemainder(plan.distributeRemainderTo, deltaMinor)}
          >
            {deltaMinor > 0 ? 'Take the difference off the largest share' : 'Give the rest to the largest share'}
          </Button>
        ) : null}

        {Object.values(errors).filter(Boolean).length > 0 ? (
          <ul className="mt-2 space-y-1" role="status" aria-live="polite">
            {Object.values(errors)
              .filter(Boolean)
              .map((message) => (
                <li key={message} className="text-xs text-danger-foreground">
                  {message}
                </li>
              ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

function decimalOf(minor, currency) {
  const factor = 10 ** 2
  return `${Math.floor(minor / factor)}.${String(minor % factor).padStart(2, '0')}`
}

function absText(minor, currency) {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  return `${sign}${decimalOf(abs, currency)}`
}

export { SPLIT_EQUAL, SPLIT_EXACT, SPLIT_PERCENTAGE }
export default SplitPreview
