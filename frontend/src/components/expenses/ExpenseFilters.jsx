import { Filter, RotateCcw, X } from 'lucide-react'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import Input, { Field } from '@/components/ui/input'
import SearchInput from '@/components/ui/search-input'
import AmountInput from '@/components/money/AmountInput'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const EMPTY_FILTERS = {
  search: '',
  category: '',
  groupId: '',
  paidBy: '',
  from: '',
  to: '',
  minAmount: '',
  maxAmount: '',
  sort: '-expenseDate',
}

const SORTS = [
  { value: '-expenseDate', label: 'Newest first' },
  { value: 'expenseDate', label: 'Oldest first' },
  { value: '-totalMinor', label: 'Largest amount' },
  { value: 'totalMinor', label: 'Smallest amount' },
]

const ANY = '__any__'

/** Controlled filter bar — every control maps 1:1 onto a GET /expenses query param. */
export function ExpenseFilters({
  value,
  onChange,
  groups = [],
  categories = [],
  members = [],
  showGroupSelect = true,
  className,
}) {
  const activeChips = [
    value.search ? { key: 'search', label: `“${value.search}”` } : null,
    value.category ? { key: 'category', label: value.category } : null,
    value.groupId ? { key: 'groupId', label: groups.find((g) => g.id === value.groupId)?.name ?? 'group' } : null,
    value.paidBy ? { key: 'paidBy', label: members.find((m) => m.user?.id === value.paidBy)?.user?.name ?? 'payer' } : null,
    value.from ? { key: 'from', label: `from ${value.from}` } : null,
    value.to ? { key: 'to', label: `to ${value.to}` } : null,
    value.minAmount ? { key: 'minAmount', label: `≥ ${value.minAmount}` } : null,
    value.maxAmount ? { key: 'maxAmount', label: `≤ ${value.maxAmount}` } : null,
  ].filter(Boolean)

  const set = (patch) => onChange({ ...value, ...patch })

  return (
    <div className={className}>
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={value.search}
          onSearch={(search) => set({ search })}
          placeholder="Search by title…"
          ariaLabel="Search expenses by title"
          className="min-w-52 flex-1"
          wait={300}
        />

        {showGroupSelect ? (
          <Select value={value.groupId || ANY} onValueChange={(v) => set({ groupId: v === ANY ? '' : v })}>
            <SelectTrigger className="h-10 w-full sm:w-44" aria-label="Filter by group">
              <SelectValue placeholder="All groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All groups</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select value={value.category || ANY} onValueChange={(v) => set({ category: v === ANY ? '' : v })}>
          <SelectTrigger className="h-10 w-full sm:w-40" aria-label="Filter by category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label ?? c.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.paidBy || ANY} onValueChange={(v) => set({ paidBy: v === ANY ? '' : v })}>
          <SelectTrigger className="h-10 w-full sm:w-40" aria-label="Filter by who paid">
            <SelectValue placeholder="Any payer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any payer</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.user?.id} value={m.user?.id}>
                {m.user?.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.sort} onValueChange={(sort) => set({ sort })}>
          <SelectTrigger className="h-10 w-full sm:w-40" aria-label="Sort expenses">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <details className="mt-3 group/filters">
        <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-control border border-border bg-card px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted">
          <Filter className="size-3.5" aria-hidden />
          Date &amp; amount range
        </summary>
        <div className="mt-3 grid gap-3 rounded-card border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From" htmlFor="flt-from">
            <Input id="flt-from" type="date" value={value.from} max={value.to || undefined} onChange={(e) => set({ from: e.target.value })} />
          </Field>
          <Field label="To" htmlFor="flt-to">
            <Input id="flt-to" type="date" value={value.to} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} />
          </Field>
          <Field label="Minimum amount" htmlFor="flt-min">
            <AmountInput id="flt-min" value={value.minAmount} onValueChange={(minAmount) => set({ minAmount })} currency={value.currency || 'INR'} placeholder="0.00" />
          </Field>
          <Field label="Maximum amount" htmlFor="flt-max">
            <AmountInput id="flt-max" value={value.maxAmount} onValueChange={(maxAmount) => set({ maxAmount })} currency={value.currency || 'INR'} placeholder="No limit" />
          </Field>
        </div>
      </details>

      {activeChips.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-caption">Active filters</span>
          {activeChips.map((chip) => (
            <Badge key={chip.key} tone="primary" className="gap-1 pr-1">
              {chip.label}
              <button
                type="button"
                onClick={() => set({ [chip.key]: EMPTY_FILTERS[chip.key] })}
                aria-label={`Clear ${chip.key} filter`}
                className="rounded-full p-0.5 hover:bg-primary/10"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...EMPTY_FILTERS, sort: value.sort })}>
            <RotateCcw className="size-3.5" aria-hidden />
            Reset all
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default ExpenseFilters
