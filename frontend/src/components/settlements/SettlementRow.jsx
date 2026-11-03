import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  HandCoins,
  Hourglass,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import Avatar from '@/components/ui/avatar'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import Money from '@/components/money/Money'
import { Field, Textarea } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { format } from '@/lib/money'
import { formatDateTime, relativeTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import {
  useCancelSettlementMutation,
  useConfirmSettlementMutation,
  useDisputeSettlementMutation,
  useRejectSettlementMutation,
} from '@/services/endpoints/settlementsApi'
import { resolveSettlementActions, statusPresentation } from './settlementActions'

const ICONS = { CheckCircle2, Hourglass, Clock: Hourglass, XCircle, ShieldAlert, Ban, Info: HandCoins }

/**
 * One settlement with the four lifecycle actions. Buttons render only when the
 * viewer's role in the transaction allows it; the reason a disabled action is
 * unavailable is exposed as a tooltip-free sentence for assistive tech.
 */
export function SettlementRow({ settlement, myId, onMutated }) {
  const toast = useToast()
  const [dialog, setDialog] = useState(null) // 'reject' | 'dispute' | 'cancel' | 'confirm'
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)

  const [confirm, confirmState] = useConfirmSettlementMutation()
  const [reject, rejectState] = useRejectSettlementMutation()
  const [dispute, disputeState] = useDisputeSettlementMutation()
  const [cancel, cancelState] = useCancelSettlementMutation()

  const { actions, reasons } = resolveSettlementActions(settlement, myId)
  const presentation = statusPresentation(settlement.status)
  const Icon = ICONS[presentation.Icon] ?? HandCoins
  const currency = settlement.currency || settlement.group?.baseCurrency || 'INR'
  const busy = confirmState.isLoading || rejectState.isLoading || disputeState.isLoading || cancelState.isLoading

  const run = async (kind) => {
    setError(null)
    const arg = { settlementId: settlement.id, groupId: settlement.group?.id }
    try {
      if (kind === 'confirm') await confirm(arg).unwrap()
      if (kind === 'reject') await reject({ ...arg, reason: reason.trim() }).unwrap()
      if (kind === 'dispute') await dispute({ ...arg, reason: reason.trim() || undefined }).unwrap()
      if (kind === 'cancel') await cancel(arg).unwrap()
      toast.success(
        kind === 'confirm' ? 'Payment confirmed' : kind === 'reject' ? 'Payment rejected' : kind === 'dispute' ? 'Marked as disputed' : 'Settlement cancelled',
        'Balances and suggested settlements refreshed.',
      )
      setDialog(null)
      setReason('')
      onMutated?.()
    } catch (err) {
      // 409 "already confirmed" etc. must not look like a crash
      setError(err?.message || 'The server refused this action.')
    }
  }

  const buttons = [
    actions.confirm ? { key: 'confirm', label: 'Confirm', variant: 'primary', Icon: CheckCircle2 } : null,
    actions.reject ? { key: 'reject', label: 'Reject', variant: 'danger-outline', Icon: XCircle } : null,
    actions.dispute ? { key: 'dispute', label: 'Dispute', variant: 'outline', Icon: ShieldAlert } : null,
    actions.cancel ? { key: 'cancel', label: 'Cancel', variant: 'ghost', Icon: Ban } : null,
  ].filter(Boolean)

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5">
          <Avatar name={settlement.payer?.name} src={settlement.payer?.avatarUrl} size="xs" />
          <span className="text-sm font-medium">{settlement.payer?.name ?? 'Payer'}</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-caption" aria-hidden />
        <span className="flex items-center gap-1.5">
          <Avatar name={settlement.receiver?.name} src={settlement.receiver?.avatarUrl} size="xs" />
          <span className="text-sm font-medium">{settlement.receiver?.name ?? 'Receiver'}</span>
        </span>

        <Money minor={settlement.amountMinor} currency={currency} className="ml-auto text-sm font-semibold" />

        <Badge tone={presentation.tone}>
          <Icon className="size-3" aria-hidden />
          {presentation.words}
        </Badge>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-caption">
        <span>{settlement.paymentMethod?.replace('_', ' ') ?? 'payment'}</span>
        {settlement.group?.name ? (
          <Link to={`/groups/${settlement.group.id}`} className="underline-offset-2 hover:text-primary hover:underline">
            {settlement.group.name}
          </Link>
        ) : null}
        <span title={formatDateTime(settlement.initiatedAt)}>recorded {relativeTime(settlement.initiatedAt)}</span>
        {settlement.initiatedBy?.id && settlement.initiatedBy.id !== settlement.payer?.id ? (
          <span>by {settlement.initiatedBy.name}</span>
        ) : null}
        {settlement.confirmedAt ? (
          <span className="text-success-foreground" title={formatDateTime(settlement.confirmedAt)}>
            confirmed {relativeTime(settlement.confirmedAt)} by {settlement.confirmedBy?.name ?? 'receiver'}
          </span>
        ) : null}
        {settlement.rejectedReason ? <span className="text-danger-foreground">reason: {settlement.rejectedReason}</span> : null}
      </div>

      {settlement.note ? (
        <p className={cn('mt-1.5 rounded-control bg-muted px-2.5 py-1.5 text-[13px] text-muted-foreground')}>
          {settlement.note}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 rounded-control bg-danger-muted px-2.5 py-1.5 text-xs text-danger-foreground">
          {error}
        </p>
      ) : null}

      {buttons.length ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {buttons.map((button) => (
            <Button
              key={button.key}
              size="sm"
              variant={button.variant}
              onClick={() => {
                setError(null)
                setDialog(button.key)
              }}
              disabled={busy}
            >
              <button.Icon className="size-4" aria-hidden />
              {button.label}
            </Button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-caption">
          No action for you here — {reasons.confirm ?? 'this settlement is settled'}.
        </p>
      )}

      {dialog ? (
        <Dialog open onOpenChange={(open) => { if (!open) setDialog(null) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {dialog === 'confirm' ? 'Confirm this payment?' : dialog === 'reject' ? 'Reject this payment?' : dialog === 'dispute' ? 'Dispute this settlement?' : 'Cancel this settlement?'}
              </DialogTitle>
              <DialogDescription>
                {dialog === 'confirm'
                  ? `You are saying ${settlement.payer?.name ?? 'they'} really paid you ${formatAmount(settlement.amountMinor, currency)}. The group's balances drop by exactly that.`
                  : dialog === 'reject'
                    ? 'Tell them what went wrong — the reason is stored on the settlement and shown to both sides.'
                    : dialog === 'dispute'
                      ? 'The amount stays out of the balances until the group resolves it.'
                      : `Nobody is charged. This removes the pending ${formatAmount(settlement.amountMinor, currency)} movement.`}
              </DialogDescription>
            </DialogHeader>

            {dialog !== 'confirm' ? (
              <Field
                label={dialog === 'reject' ? 'Reason (required)' : 'Notes'}
                htmlFor={`st-${dialog}`}
                required={dialog === 'reject'}
                error={dialog === 'reject' && reason.trim().length === 0 && busy ? 'A reason is required.' : null}
              >
                <Textarea id={`st-${dialog}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={dialog === 'reject' ? 'I never received this.' : 'Optional context for the group.'} />
              </Field>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Back
              </Button>
              <Button
                variant={dialog === 'reject' ? 'danger' : 'primary'}
                loading={busy}
                disabled={dialog === 'reject' && reason.trim().length === 0}
                onClick={() => run(dialog)}
              >
                {dialog === 'confirm' ? 'Confirm payment' : dialog === 'reject' ? 'Reject' : dialog === 'dispute' ? 'Dispute' : 'Cancel settlement'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </li>
  )
}

function formatAmount(minor, currency) {
  try {
    return format(Number(minor || 0), currency)
  } catch {
    return `${minor} paise`
  }
}

/** Compact list shell reused by the Settlements page. */
export function SettlementList({ children, empty }) {
  if (empty) return <div className="p-4">{empty}</div>
  return <ul className="divide-y divide-border">{children}</ul>
}
export default SettlementRow
