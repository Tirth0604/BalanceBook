import { useEffect, useMemo, useState } from 'react'
import { Target } from 'lucide-react'
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
import { monthKey } from '@/lib/dates'
import { usePutBudgetMutation } from '@/services/endpoints/budgetsApi'

const SCOPES = [
  { value: 'group_total', label: 'Whole group' },
  { value: 'category', label: 'One category' },
]
const PERIODS = [
  { value: 'monthly', label: 'Per month' },
  { value: 'overall', label: 'Overall (no period)' },
]
const DEFAULT_THRESHOLDS = [75, 90, 100]

/**
 * Upsert a budget (PUT /groups/:id/budgets). A budget is a plan, not a payment —
 * the copy says so, because the server never charges anyone from this dialog.
 */
export function BudgetFormDialog({ group, open, onOpenChange, budget = null, categories = [] }) {
  const toast = useToast()
  const [putBudget, putState] = usePutBudgetMutation()
  const [form, setForm] = useState(() => blank(group))
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!open) return
    setForm(
      budget
        ? {
            scope: budget.scope ?? 'group_total',
            category: budget.category ?? '',
            label: budget.label ?? '',
            limit: budget.limit ?? '',
            period: budget.period ?? 'monthly',
            periodKey: budget.periodKey ?? monthKey(new Date()),
            thresholds: (budget.alertThresholds ?? DEFAULT_THRESHOLDS).join(','),
          }
        : blank(group),
    )
    setErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, budget?.id])

  const isEdit = Boolean(budget?.id)
  const thresholdList = useMemo(
    () =>
      form.thresholds
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0),
    [form.thresholds],
  )

  const validate = () => {
    const next = {}
    if (!form.limit || Number(form.limit) <= 0) next.limit = 'A budget needs a positive limit.'
    if (form.scope === 'category' && !form.category) next.category = 'Pick which category this caps.'
    if (form.period === 'monthly' && !/^\d{4}-\d{2}$/.test(form.periodKey)) next.periodKey = 'Use YYYY-MM, e.g. 2026-11.'
    if (!thresholdList.length) next.thresholds = 'Give at least one threshold, e.g. 75,90,100.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!validate()) return
    try {
      await putBudget({
        groupId: group.id,
        body: {
          scope: form.scope,
          ...(form.scope === 'category' ? { category: form.category } : {}),
          label: form.label.trim() || undefined,
          limit: String(form.limit).trim(),
          currency: group.baseCurrency || 'INR',
          period: form.period,
          ...(form.period === 'monthly' ? { periodKey: form.periodKey } : {}),
          alertThresholds: thresholdList,
        },
      }).unwrap()
      toast.success(isEdit ? 'Budget updated' : 'Budget set', 'Nothing was charged — this only watches the ledger.')
      onOpenChange?.(false)
    } catch (err) {
      setErrors({ other: err?.message || 'The server refused this budget.' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit budget' : 'New budget'}</DialogTitle>
          <DialogDescription>
            {group?.name ? `In ${group.name} · limits are stored in ${group.baseCurrency}.` : 'Limits are stored in the group currency.'} A budget
            warns — it never pays, moves or charges anything.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Scope" htmlFor="bd-scope">
              <Select value={form.scope} onValueChange={(scope) => setForm((f) => ({ ...f, scope, category: scope === 'category' ? f.category : '' }))}>
                <SelectTrigger id="bd-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {form.scope === 'category' ? (
              <Field label="Category" htmlFor="bd-category" required error={errors.category}>
                <Select value={form.category} onValueChange={(category) => setForm((f) => ({ ...f, category }))}>
                  <SelectTrigger id="bd-category">
                    <SelectValue placeholder="Which category?" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label ?? c.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field label="Period" htmlFor="bd-period">
                <Select value={form.period} onValueChange={(period) => setForm((f) => ({ ...f, period }))}>
                  <SelectTrigger id="bd-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIODS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          {form.scope === 'category' ? (
            <Field label="Period" htmlFor="bd-period2">
              <Select value={form.period} onValueChange={(period) => setForm((f) => ({ ...f, period }))}>
                <SelectTrigger id="bd-period2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={`Limit (${group?.baseCurrency || 'INR'})`}
              htmlFor="bd-limit"
              required
              error={errors.limit}
            >
              <AmountInput id="bd-limit" value={form.limit} onValueChange={(limit) => setForm((f) => ({ ...f, limit }))} currency={group?.baseCurrency || 'INR'} invalid={Boolean(errors.limit)} />
            </Field>

            {form.period === 'monthly' ? (
              <Field label="Period (YYYY-MM)" htmlFor="bd-period-key" required error={errors.periodKey}>
                <Input
                  id="bd-period-key"
                  value={form.periodKey}
                  onChange={(e) => setForm((f) => ({ ...f, periodKey: e.target.value }))}
                  placeholder="2026-11"
                  className="tabular"
                  invalid={Boolean(errors.periodKey)}
                />
              </Field>
            ) : null}
          </div>

          <Field label="Warn at (% of limit)" htmlFor="bd-thresholds" hint="Comma separated. The server alerts once per threshold per period." error={errors.thresholds}>
            <Input id="bd-thresholds" value={form.thresholds} onChange={(e) => setForm((f) => ({ ...f, thresholds: e.target.value }))} className="tabular" />
          </Field>

          <div className="flex flex-wrap gap-1.5">
            {thresholdList.map((value) => (
              <Badge key={value} tone={value >= 100 ? 'danger' : value >= 90 ? 'warning' : 'info'}>
                <Target className="size-3" aria-hidden /> {value}%
              </Badge>
            ))}
          </div>

          <Field label="Label" htmlFor="bd-label" hint="Optional — shows up on the progress card.">
            <Textarea id="bd-label" rows={1} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Food for the month" />
          </Field>

          {errors.other ? (
            <p role="alert" className="rounded-control bg-danger-muted px-3 py-2 text-xs text-danger-foreground">
              {errors.other}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={putState.isLoading}>
              {isEdit ? 'Save budget' : 'Create budget'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function blank(group) {
  return {
    scope: 'group_total',
    category: '',
    label: '',
    limit: '',
    period: 'monthly',
    periodKey: monthKey(new Date()),
    thresholds: DEFAULT_THRESHOLDS.join(','),
  }
}

export default BudgetFormDialog
