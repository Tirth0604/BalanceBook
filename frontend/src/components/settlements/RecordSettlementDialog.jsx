import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, HandCoins, Info } from 'lucide-react'
import Button from '@/components/ui/button'
import Avatar from '@/components/ui/avatar'
import { Field, Textarea } from '@/components/ui/input'
import AmountInput from '@/components/money/AmountInput'
import Badge from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { useCreateSettlementMutation } from '@/services/endpoints/settlementsApi'
import { buildSettlementBody, makeIdempotencyKey } from './settlementActions'

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

/**
 * Record a payment (POST /settlements). One stable idempotency key per dialog
 * session, so a double click or a retry replays the original record instead of
 * creating a second payment.
 */
export function RecordSettlementDialog({ group, open, onOpenChange, initial = {}, onRecorded, members = [] }) {
  const toast = useToast()
  const [createSettlement, createState] = useCreateSettlementMutation()
  const currency = group?.baseCurrency || 'INR'

  const activeMembers = useMemo(
    () => members.filter((m) => (m.status ?? 'active') === 'active'),
    [members],
  )
  const [form, setForm] = useState({ payerId: '', receiverId: '', amount: '', paymentMethod: 'cash', note: '' })
  const [key, setKey] = useState(() => makeIdempotencyKey(group?.id ?? 'settlement'))
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    if (!open) return
    setForm({
      payerId: initial.payerId ?? '',
      receiverId: initial.receiverId ?? '',
      amount: initial.amount ? String(initial.amount) : '',
      paymentMethod: 'cash',
      note: '',
    })
    setFieldErrors({})
    setKey(makeIdempotencyKey(group?.id ?? 'settlement'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial.payerId, initial.receiverId, initial.amount])

  const payer = activeMembers.find((m) => m.user?.id === form.payerId)
  const receiver = activeMembers.find((m) => m.user?.id === form.receiverId)

  const submit = async (event) => {
    event.preventDefault()
    const errors = {}
    if (!form.payerId) errors.payerId = 'Who paid?'
    if (!form.receiverId) errors.receiverId = 'Who received it?'
    if (form.payerId && form.payerId === form.receiverId) errors.receiverId = 'Payer and receiver must be different people.'
    if (!form.amount || Number(form.amount) <= 0) errors.amount = 'Enter the amount actually handed over.'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return

    try {
      const body = buildSettlementBody({
        groupId: group.id,
        payerId: form.payerId,
        receiverId: form.receiverId,
        amount: form.amount,
        currency,
        paymentMethod: form.paymentMethod,
        note: form.note,
        idempotencyKey: key,
      })
      const created = await createSettlement(body).unwrap()
      toast.success(
        'Payment recorded',
        `${created?.status === 'completed' ? 'Settled immediately.' : 'Waiting for the receiver to confirm.'}`,
      )
      onOpenChange?.(false)
      onRecorded?.(created)
    } catch (err) {
      // 422 over-payment / self-payment, 403 non-member, 409 idempotency replay
      const message = err?.message || 'The server refused this payment.'
      if (err?.code === 'VALIDATION_ERROR' || err?.status === 422) {
        setFieldErrors({ amount: message })
      } else {
        setFieldErrors({ other: message })
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Money already moved outside the app. Recording it does not charge anyone — it asks the receiver to confirm
            so the ledger can drop the balance.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <Field label="Who paid" htmlFor="st-payer" required error={fieldErrors.payerId}>
              <Select value={form.payerId} onValueChange={(payerId) => setForm((f) => ({ ...f, payerId }))}>
                <SelectTrigger id="st-payer">
                  <SelectValue placeholder="Select a member" />
                </SelectTrigger>
                <SelectContent>
                  {activeMembers.map((m) => (
                    <SelectItem key={m.user.id} value={m.user.id}>
                      {m.user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <span className="hidden items-center justify-center pb-1 sm:flex">
              <ArrowRight className="size-4 text-caption" aria-hidden />
            </span>

            <Field label="Who received" htmlFor="st-receiver" required error={fieldErrors.receiverId}>
              <Select value={form.receiverId} onValueChange={(receiverId) => setForm((f) => ({ ...f, receiverId }))}>
                <SelectTrigger id="st-receiver">
                  <SelectValue placeholder="Select a member" />
                </SelectTrigger>
                <SelectContent>
                  {activeMembers
                    .filter((m) => m.user.id !== form.payerId)
                    .map((m) => (
                      <SelectItem key={m.user.id} value={m.user.id}>
                        {m.user.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {(payer || receiver) && (
            <p className="flex items-center gap-2 text-xs text-caption">
              <Avatar name={payer?.user?.name} src={payer?.user?.avatarUrl} size="xs" />
              pays
              <Avatar name={receiver?.user?.name} src={receiver?.user?.avatarUrl} size="xs" />
              <Badge tone="outline">{currency}</Badge>
            </p>
          )}

          <Field
            label={`Amount (${currency})`}
            htmlFor="st-amount"
            required
            error={fieldErrors.amount}
            hint="Capped by the server at what the payer actually owes that person — over-paying here is rejected, not silently trimmed."
          >
            <AmountInput
              id="st-amount"
              value={form.amount}
              onValueChange={(amount) => setForm((f) => ({ ...f, amount }))}
              currency={currency}
              invalid={Boolean(fieldErrors.amount)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Method" htmlFor="st-method">
              <Select value={form.paymentMethod} onValueChange={(paymentMethod) => setForm((f) => ({ ...f, paymentMethod }))}>
                <SelectTrigger id="st-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Idempotency key" htmlFor="st-key" hint="Reused if you retry — the server returns the original record.">
              <input
                id="st-key"
                value={key}
                readOnly
                className="h-10 w-full rounded-control border border-input bg-muted px-3 text-xs tabular text-muted-foreground"
              />
            </Field>
          </div>

          <Field label="Note" htmlFor="st-note">
            <Textarea
              id="st-note"
              rows={2}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Handed cash at the airport."
            />
          </Field>

          {fieldErrors.other ? (
            <p role="alert" className="flex items-start gap-1.5 rounded-control bg-danger-muted px-3 py-2 text-xs text-danger-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {fieldErrors.other}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createState.isLoading} disabled={Boolean(group?.isArchived)}>
              <HandCoins aria-hidden /> Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default RecordSettlementDialog
