import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Repeat } from 'lucide-react'
import Button from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
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
import { formatDate } from '@/lib/dates'
import { useCreateRecurringMutation } from '@/services/endpoints/recurringApi'
import { describeCadence, FREQUENCIES, upcomingDates } from './nextDue'

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * Create a recurring rule. The preview shows the dates the server will bill on —
 * creating the rule charges nobody today, and the dialog says so twice.
 */
export function RecurringFormDialog({ group, members = [], categories = [], open, onOpenChange, myId }) {
  const toast = useToast()
  const [createRecurring, createState] = useCreateRecurringMutation()
  const currency = group?.baseCurrency || 'INR'

  const [form, setForm] = useState(() => ({
    title: '',
    description: '',
    category: 'others',
    amount: '',
    frequency: 'monthly',
    interval: '1',
    startDate: todayIso(),
    endDate: '',
    maxOccurrences: '',
    paidBy: myId ?? '',
  }))
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, paidBy: f.paidBy || myId || '', endDate: '', maxOccurrences: '' }))
      setErrors({})
    }
  }, [open, myId])

  const activeMembers = useMemo(() => members.filter((m) => (m.status ?? 'active') === 'active'), [members])
  const preview = useMemo(
    () =>
      upcomingDates({
        frequency: form.frequency,
        interval: form.interval,
        startDate: form.startDate,
        endDate: form.endDate || null,
        count: 3,
      }),
    [form.frequency, form.interval, form.startDate, form.endDate],
  )

  const validate = () => {
    const next = {}
    if (!form.title.trim()) next.title = 'Name the rule — it becomes each expense title.'
    if (!form.amount || Number(form.amount) <= 0) next.amount = 'Enter the amount each occurrence carries.'
    if (!form.startDate) next.startDate = 'Pick the first due date.'
    if (form.endDate && form.endDate < form.startDate) next.endDate = 'The end date is before the start date.'
    if (form.maxOccurrences && !/^\d+$/.test(form.maxOccurrences)) next.maxOccurrences = 'Use a whole number of times.'
    if (!form.paidBy) next.paidBy = 'Who pays each time?'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!validate()) return
    try {
      const created = await createRecurring({
        groupId: group.id,
        body: {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          category: form.category,
          amount: String(form.amount).trim(),
          currency,
          splitType: 'equal',
          paidBy: form.paidBy,
          participants: activeMembers.map((m) => ({ userId: m.user.id })),
          frequency: form.frequency,
          interval: Math.max(1, Number(form.interval) || 1),
          startDate: form.startDate,
          ...(form.endDate ? { endDate: form.endDate } : {}),
          ...(form.maxOccurrences ? { maxOccurrences: Number(form.maxOccurrences) } : {}),
        },
      }).unwrap()
      toast.success('Recurring rule created', `Nothing was charged. First entry lands on ${formatDate(created?.nextDueDate ?? preview[0] ?? form.startDate)}.`)
      onOpenChange?.(false)
      setForm((f) => ({ ...f, title: '', description: '', amount: '' }))
    } catch (err) {
      setErrors({ other: err?.message || 'The server refused this rule.' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New recurring rule</DialogTitle>
          <DialogDescription>
            A rule is a template. It writes an expense only when a due date arrives — creating it charges nobody today.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Title" htmlFor="rc-title" required error={errors.title}>
            <Input id="rc-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Flat rent" invalid={Boolean(errors.title)} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Amount each time (${currency})`} htmlFor="rc-amount" required error={errors.amount}>
              <AmountInput id="rc-amount" value={form.amount} onValueChange={(amount) => setForm((f) => ({ ...f, amount }))} currency={currency} invalid={Boolean(errors.amount)} />
            </Field>
            <Field label="Category" htmlFor="rc-category">
              <Select value={form.category} onValueChange={(category) => setForm((f) => ({ ...f, category }))}>
                <SelectTrigger id="rc-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(categories.length ? categories : [{ value: 'others', label: 'Others' }]).map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label ?? c.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Repeats" htmlFor="rc-frequency">
              <Select value={form.frequency} onValueChange={(frequency) => setForm((f) => ({ ...f, frequency }))}>
                <SelectTrigger id="rc-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value[0].toUpperCase() + value.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Every" htmlFor="rc-interval" hint="Whole number of units">
              <Input
                id="rc-interval"
                inputMode="numeric"
                value={form.interval}
                onChange={(e) => setForm((f) => ({ ...f, interval: e.target.value.replace(/[^\d]/g, '') }))}
                className="tabular"
              />
            </Field>
            <Field label="Paid by" htmlFor="rc-paidby" required error={errors.paidBy}>
              <Select value={form.paidBy} onValueChange={(paidBy) => setForm((f) => ({ ...f, paidBy }))}>
                <SelectTrigger id="rc-paidby">
                  <SelectValue placeholder="Who pays?" />
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
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="First due date" htmlFor="rc-start" required error={errors.startDate}>
              <Input id="rc-start" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </Field>
            <Field label="Last due date" htmlFor="rc-end" hint="Optional" error={errors.endDate}>
              <Input id="rc-end" type="date" value={form.endDate} min={form.startDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </Field>
            <Field label="Times" htmlFor="rc-max" hint="Optional cap" error={errors.maxOccurrences}>
              <Input
                id="rc-max"
                inputMode="numeric"
                value={form.maxOccurrences}
                onChange={(e) => setForm((f) => ({ ...f, maxOccurrences: e.target.value.replace(/[^\d]/g, '') }))}
                placeholder="12"
                className="tabular"
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="rc-desc">
            <Textarea id="rc-desc" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Split equally among whoever is in the group that month." />
          </Field>

          <div className="rounded-control border border-info/30 bg-info-muted px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
              <Repeat className="size-3.5" aria-hidden /> Preview: {describeCadence(form)}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden />
              {preview.length ? (
                preview.map((date) => (
                  <Badge key={date} tone="info" className="tabular">
                    {formatDate(date)}
                  </Badge>
                ))
              ) : (
                <span>Start the rule on a future or today’s date to see the first due dates.</span>
              )}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Each of those dates becomes an expense split equally between {activeMembers.length} members — nothing happens
              before then.
            </p>
          </div>

          {errors.other ? (
            <p role="alert" className="rounded-control bg-danger-muted px-3 py-2 text-xs text-danger-foreground">
              {errors.other}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createState.isLoading} disabled={group?.isArchived}>
              Create rule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default RecurringFormDialog
