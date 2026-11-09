import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, Save } from 'lucide-react'
import Button from '@/components/ui/button'
import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import Input, { Field, Textarea } from '@/components/ui/input'
import Badge from '@/components/ui/badge'
import ErrorState from '@/components/ui/error-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Money from '@/components/money/Money'
import AmountInput from '@/components/money/AmountInput'
import useDebounce from '@/hooks/useDebounce'
import useMinDuration from '@/hooks/useMinDuration'
import { useToast } from '@/components/ui/toast'
import { currencySymbol, format, toMinor } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import {
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useUploadReceiptMutation,
  useDeleteReceiptMutation,
  useMetaCategoriesQuery,
} from '@/services/endpoints/expensesApi'
import ParticipantPicker from './ParticipantPicker'
import SplitModeTabs from './SplitModeTabs'
import SplitPreview from './SplitPreview'
import ReceiptUploader from './ReceiptUploader'
import {
  SPLIT_EQUAL,
  SPLIT_EXACT,
  buildSplitPayload,
  fieldErrorsFromApi,
  reconcileSplit,
  totalToMinor,
} from './splitModel'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * The Add/Edit expense form. One component serves both flows: `expense` present
 * means PATCH, absent means POST. The split preview is computed with the same
 * integer minor-unit rules as the backend (splitModel) and submit stays locked
 * until the shares reconcile.
 */
export function ExpenseForm({ groupId, group, expense = null, onSaved, onCancel, embedded = false }) {
  const toast = useToast()
  const isEdit = Boolean(expense?.id)
  const currency = expense?.currency || group?.baseCurrency || 'INR'
  const activeMembers = useMemo(
    () => (group?.members ?? []).filter((m) => (m.status ?? 'active') === 'active'),
    [group],
  )
  const { data: meta } = useMetaCategoriesQuery(undefined)
  const categories = meta?.categories ?? []

  const [createExpense, createState] = useCreateExpenseMutation()
  const [updateExpense, updateState] = useUpdateExpenseMutation()
  const [uploadReceipt, uploadState] = useUploadReceiptMutation()
  const [deleteReceipt] = useDeleteReceiptMutation()

  const [title, setTitle] = useState(expense?.title ?? '')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [category, setCategory] = useState(expense?.category ?? 'others')
  const [expenseDate, setExpenseDate] = useState(expenseDateOf(expense))
  const [amount, setAmount] = useState(expense?.amount ?? '')
  const [paidBy, setPaidBy] = useState(expense?.paidBy?.id ?? null)
  const [splitType, setSplitType] = useState(expense?.splitType ?? SPLIT_EQUAL)
  const [participantIds, setParticipantIds] = useState(() =>
    expense?.participants?.map((p) => p.user?.id).filter(Boolean) ?? [],
  )
  const [shares, setShares] = useState(() => sharesFromExpense(expense, 'exact'))
  const [percentages, setPercentages] = useState(() => sharesFromExpense(expense, 'percentage'))
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptRemoved, setReceiptRemoved] = useState(false)
  const [touched, setTouched] = useState({})
  const [apiErrors, setApiErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const topRef = useRef(null)

  // default participants = every active member, payer included
  useEffect(() => {
    if (isEdit || participantIds.length || activeMembers.length === 0) return
    setParticipantIds(activeMembers.map((m) => m.user.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMembers, isEdit])

  useEffect(() => {
    if (!paidBy && activeMembers.length) setPaidBy(activeMembers[0].user.id)
  }, [activeMembers, paidBy])

  const participants = useMemo(
    () =>
      participantIds
        .map((id) => {
          const member = activeMembers.find((m) => m.user.id === id)
          return member ? { userId: member.user.id, name: member.user.name } : null
        })
        .filter(Boolean),
    [participantIds, activeMembers],
  )

  /* ---- live reconciliation: recomputed 250 ms after the last keystroke (docs/06 §8) */
  const inputs = { splitType, amount, participants, shares, percentages, paidBy, currency }
  const debouncedInputs = useDebounce(inputs, 250)
  const plan = useMemo(() => {
    const { minor } = totalToMinor(debouncedInputs.amount, debouncedInputs.currency)
    return reconcileSplit({
      splitType: debouncedInputs.splitType,
      totalMinor: minor,
      participants: debouncedInputs.participants,
      shares: debouncedInputs.shares,
      percentages: debouncedInputs.percentages,
      currency: debouncedInputs.currency,
      paidBy: debouncedInputs.paidBy,
    })
  }, [debouncedInputs])

  const errors = {
    title: !title.trim() ? 'Give the expense a title.' : title.trim().length > 120 ? 'Titles fit in 120 characters.' : null,
    amount: plan.errors.amount ?? (!amount ? 'An amount is required.' : null),
    paidBy: paidBy ? null : 'Choose who paid.',
    participants: participantIds.length === 0 ? plan.errors.participants : null,
    expenseDate: expenseDate ? null : 'Pick the date of the expense.',
    receipt: apiErrors.receipt ?? null,
    ...apiErrors,
  }
  const splitBlocker = plan.errors.shares ?? plan.errors.percentages ?? (!plan.reconciled ? 'Split does not reconcile yet.' : null)
  const showSplitError = Boolean(splitBlocker) && Boolean(touched.split)
  const blockedBySplit = !plan.reconciled

  const mutating = createState.isLoading || updateState.isLoading || uploadState.isLoading
  const locked = Boolean(group?.isArchived)
  const canSubmit =
    !locked &&
    !mutating &&
    !errors.title &&
    !errors.amount &&
    !errors.paidBy &&
    !errors.participants &&
    !errors.expenseDate &&
    !blockedBySplit &&
    participants.length > 0

  const setShare = (userId, value) => {
    setTouched((t) => ({ ...t, split: true }))
    setShares((prev) => ({ ...prev, [userId]: value }))
  }
  const setPercentage = (userId, value) => {
    setTouched((t) => ({ ...t, split: true }))
    setPercentages((prev) => ({ ...prev, [userId]: value.replace(/[^\d.]/g, '') }))
  }

  const assignRemainder = (userId, deltaMinor) => {
    setShares((prev) => {
      const currentMinor = safeMinor(prev[userId])
      const nextMinor = Math.max(0, currentMinor - deltaMinor)
      return { ...prev, [userId]: decimalsOf(nextMinor) }
    })
  }

  const buildBody = () => {
    const split = buildSplitPayload({
      splitType,
      totalMinor: plan.totalMinor,
      participants,
      shares,
      percentages,
      currency,
    })
    const body = {
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      amount: String(amount).trim(),
      currency,
      expenseDate,
      paidBy,
      notes: notes.trim() || undefined,
      ...split,
    }
    return body
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setTouched({ title: true, amount: true, split: true, paidBy: true, expenseDate: true })
    setFormError(null)
    if (!canSubmit) {
      topRef.current?.scrollIntoView({ block: 'start' })
      return
    }
    const body = buildBody()
    try {
      const saved = isEdit
        ? await updateExpense({ expenseId: expense.id, groupId, body }).unwrap()
        : await createExpense({ groupId, body }).unwrap()

      // The ledger entry exists now; a receipt failure must never look like a lost expense.
      if (receiptFile && saved?.id) {
        try {
          const formData = new FormData()
          formData.append('file', receiptFile)
          await uploadReceipt({ expenseId: saved.id, groupId, formData }).unwrap()
        } catch (receiptError) {
          toast.warning(
            'Expense saved, receipt not attached',
            receiptError?.message || 'Open the expense and upload the receipt again.',
          )
        }
      }

      toast.success(
        isEdit ? 'Expense updated' : 'Expense added',
        `${saved?.title ?? title.trim()} · ${format(plan.totalMinor ?? 0, currency)}`,
      )
      onSaved?.(saved)
    } catch (err) {
      setApiErrors(fieldErrorsFromApi(err))
      setFormError(err?.message || 'The server refused this expense. Fix the highlighted fields and try again.')
      topRef.current?.scrollIntoView({ block: 'start' })
    }
  }

  const removeExistingReceipt = async () => {
    try {
      await deleteReceipt({ expenseId: expense.id, groupId }).unwrap()
      setReceiptRemoved(true)
      toast.info('Receipt removed')
    } catch (err) {
      setFormError(err?.message || 'Could not remove the receipt.')
    }
  }

  const showSkeleton = useMinDuration(!group, 300)

  if (showSkeleton && !group) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-10 w-40 skeleton" />
        <div className="h-24 w-full skeleton" />
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate ref={topRef} className={embedded ? 'space-y-5' : 'space-y-6'}>
      {locked ? (
        <div className="flex items-start gap-2 rounded-control border border-warning/40 bg-warning-muted px-3 py-2.5 text-[13px] text-foreground" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            This group is archived — its ledger is read-only.{' '}
            <Link to={`/groups/${groupId}`} className="font-medium text-primary underline-offset-4 hover:underline">
              Open the group
            </Link>
          </span>
        </div>
      ) : null}

      {formError ? (
        <ErrorState
          message={formError}
          compact
          onRetry={() => {
            setFormError(null)
            onSubmit(new Event('submit'))
          }}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------ left: the expense itself */}
        <Card>
          <CardHeader>
            <CardTitle>Expense</CardTitle>
            <CardDescription>
              {group?.name ? `In ${group.name} · amounts in ${currency}` : `Amounts in ${currency}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Title" htmlFor="ex-title" required error={touched.title ? errors.title : null}>
              <Input
                id="ex-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, title: true }))}
                invalid={Boolean(touched.title && errors.title)}
                aria-describedby={touched.title && errors.title ? 'ex-title-error' : undefined}
                placeholder="Beach shack dinner"
                maxLength={120}
                autoFocus={!isEdit}
              />
            </Field>

            <Field label="Description" htmlFor="ex-desc" hint="Optional context — what the money actually bought.">
              <Textarea
                id="ex-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Fish, rice, and two coconut waters."
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="ex-category">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="ex-category">
                    <SelectValue placeholder="Category" />
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

              <Field label="Date of expense" htmlFor="ex-date" required error={touched.expenseDate ? errors.expenseDate : null} hint={expenseDate ? formatDate(expenseDate, 'EEE d MMM yyyy') : undefined}>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-caption" aria-hidden />
                  <Input
                    id="ex-date"
                    type="date"
                    value={expenseDate}
                    max={today()}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="pl-9"
                    invalid={Boolean(touched.expenseDate && errors.expenseDate)}
                  />
                </div>
              </Field>
            </div>

            <Field
              label={`Amount (${currency})`}
              htmlFor="ex-amount"
              required
              error={touched.amount ? errors.amount : null}
              hint={`Shown as ${currencySymbol(currency)} — decimals only, no commas.`}
            >
              <AmountInput
                id="ex-amount"
                value={amount}
                onValueChange={(next) => {
                  setAmount(next)
                  setTouched((t) => ({ ...t, amount: true }))
                }}
                currency={currency}
                align="left"
                invalid={Boolean(touched.amount && errors.amount)}
                disabled={locked}
                placeholder="0.00"
              />
            </Field>

            <Field label="Paid by" htmlFor="ex-paidby" required error={touched.paidBy ? errors.paidBy : null}>
              <Select
                value={paidBy ?? ''}
                onValueChange={(id) => {
                  setPaidBy(id)
                  setTouched((t) => ({ ...t, paidBy: true }))
                  // keep the payer inside the split unless they opt out
                  setParticipantIds((list) => (list.includes(id) ? list : [...list, id]))
                }}
              >
                <SelectTrigger id="ex-paidby">
                  <SelectValue placeholder="Who put the money in?" />
                </SelectTrigger>
                <SelectContent>
                  {activeMembers.map((m) => (
                    <SelectItem key={m.user.id} value={m.user.id}>
                      {m.user.name} {m.role === 'admin' ? '· admin' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Notes" htmlFor="ex-notes" hint="Visible in the audit trail as context, not as a money change.">
              <Textarea id="ex-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Split changed after the bill arrived." />
            </Field>

            <ReceiptUploader
              file={receiptFile}
              onFileChange={setReceiptFile}
              existing={!receiptFile && expense?.receipt && !receiptRemoved ? expense.receipt : null}
              onRemoveExisting={isEdit && expense?.receipt && !receiptRemoved ? removeExistingReceipt : undefined}
              error={errors.receipt}
              busy={uploadState.isLoading}
            />
          </CardContent>
        </Card>

        {/* ------------------------------------------------ right: who shares it, paisa by paisa */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Who shares it</CardTitle>
              <CardDescription>
                {participants.length} participant{participants.length === 1 ? '' : 's'} ·{' '}
                {splitType === SPLIT_EQUAL ? 'server-derived equal split' : splitType}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ParticipantPicker
                members={activeMembers}
                value={participantIds}
                onChange={(ids) => {
                  setTouched((t) => ({ ...t, split: true }))
                  setParticipantIds(ids)
                }}
                paidBy={paidBy}
                disabled={locked}
                error={touched.split ? errors.participants : null}
              />

              <SplitModeTabs
                value={splitType}
                disabled={locked}
                onChange={(next) => {
                  setTouched((t) => ({ ...t, split: true }))
                  setSplitType(next)
                  if (next === SPLIT_EXACT && Object.keys(shares).length === 0) setShares(seedExact(plan))
                }}
              />

              <SplitPreview
                plan={plan}
                currency={currency}
                shareValues={shares}
                percentValues={percentages}
                onShareChange={setShare}
                onPercentageChange={setPercentage}
                onAssignRemainder={assignRemainder}
                disabled={locked}
              />

              {showSplitError && !plan.reconciled ? (
                <p role="status" className="text-xs text-danger-foreground">
                  {splitBlocker}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="text-[13px] text-muted-foreground">
                {plan.reconciled ? (
                  <span className="flex items-center gap-2">
                    <Badge tone="success">ready to save</Badge>
                    <Money minor={plan.sumMinor} currency={currency} className="font-medium text-foreground" />
                    allocated across {plan.rows.length}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Badge tone="warning">split not reconciled</Badge>
                    {splitBlocker}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {onCancel ? (
                  <Button type="button" variant="outline" onClick={onCancel} disabled={mutating}>
                    Cancel
                  </Button>
                ) : null}
                <Button type="submit" loading={mutating} disabled={!canSubmit} className="min-w-40">
                  <Save aria-hidden />
                  {isEdit ? 'Save changes' : 'Add expense'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ helpers */
function expenseDateOf(expense) {
  if (expense?.expenseDate) return String(expense.expenseDate).slice(0, 10)
  return today()
}

function sharesFromExpense(expense, kind) {
  if (!expense?.participants) return {}
  const out = {}
  for (const p of expense.participants) {
    if (!p?.user?.id) continue
    if (kind === 'exact' && p.share != null) out[p.user.id] = String(p.share)
    if (kind === 'percentage' && p.percentage != null) out[p.user.id] = String(p.percentage)
  }
  return out
}

function safeMinor(value) {
  try {
    return toMinor(String(value ?? '0'))
  } catch {
    return 0
  }
}

function decimalsOf(minor) {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`
}

/** Seed exact-mode inputs from the plan currently on screen (equal shares). */
function seedExact(plan) {
  const out = {}
  for (const row of plan.rows) out[row.userId] = Number.isInteger(row.shareMinor) ? decimalsOf(row.shareMinor) : ''
  return out
}

export default ExpenseForm
