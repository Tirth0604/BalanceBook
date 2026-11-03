import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import ErrorState from '@/components/ui/error-state'
import Skeleton from '@/components/ui/skeleton'
import Money from '@/components/money/Money'
import Badge from '@/components/ui/badge'
import CategoryDonut from '@/components/dashboard/CategoryDonut'

/** Pie: GET /analytics/categories → { categories: [{ label, totalMinor, percentOfSpend, expenseCount }] } */
export function CategoryBreakdown({ data, currency = 'INR', loading = false, error = null, onRetry }) {
  const rows = data?.categories ?? []

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>Where the money went</CardTitle>
          <CardDescription>Category share of spend in the selected window</CardDescription>
        </div>
        {Number.isFinite(Number(data?.totalMinor)) ? (
          <Money minor={Number(data.totalMinor)} currency={currency} className="font-display text-lg font-semibold" />
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="mx-auto h-48 w-48 rounded-pill" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} compact />
        ) : rows.length === 0 ? (
          <p className="rounded-control border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
            No expenses fall inside this window.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <CategoryDonut slices={rows.map((row) => ({ name: row.label ?? row.category, value: row.totalMinor }))} currency={currency} height={220} />
            <ul className="divide-y divide-border self-start">
              {rows.map((row) => (
                <li key={row.category} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{row.label ?? row.category}</span>
                    <span className="text-xs text-caption">
                      {row.expenseCount ?? 0} expense{row.expenseCount === 1 ? '' : 's'}
                      {Number(row.myConsumedMinor) > 0 ? ' · you shared in it' : ''}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <Money minor={row.totalMinor} currency={currency} className="font-semibold" />
                    {Number.isFinite(Number(row.percentOfSpend)) ? (
                      <Badge tone="outline" className="mt-0.5">
                        <span className="tabular">{Number(row.percentOfSpend).toFixed(1)}%</span>
                      </Badge>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default CategoryBreakdown
