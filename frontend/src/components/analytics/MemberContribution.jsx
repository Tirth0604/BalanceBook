import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, formatCompact } from '@/lib/money'
import ChartTooltip, { chartColor } from '@/components/ui/chart-tooltip'
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import ErrorState from '@/components/ui/error-state'
import Skeleton from '@/components/ui/skeleton'
import Money from '@/components/money/Money'
import Badge from '@/components/ui/badge'
import { Users2 } from 'lucide-react'

/**
 * Horizontal bars: GET /analytics/members → { members: [{ user, paidMinor,
 * consumedMinor, netMinor, sharePercent }] }. `paidMinor` is the contribution
 * the server computed; the table underneath keeps full paisa precision.
 */
export function MemberContribution({ data, currency = 'INR', loading = false, error = null, onRetry }) {
  const rows = (data?.members ?? []).map((member) => ({
    id: member.user?.id ?? member.user?.name,
    name: member.user?.name ?? 'Member',
    paid: Number(member.paidMinor) || 0,
    consumed: Number(member.consumedMinor) || 0,
    netMinor: Number(member.netMinor) || 0,
    sharePercent: Number(member.sharePercent) || 0,
    expenseCount: member.expenseCount ?? 0,
    status: member.status,
  }))

  const totalPaid = Number(data?.totalPaidMinor) || 0

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>Who funds it</CardTitle>
          <CardDescription>Amount each member put in, versus what they consumed</CardDescription>
        </div>
        {totalPaid ? <Money minor={totalPaid} currency={currency} className="font-display text-lg font-semibold" /> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} compact />
        ) : rows.length === 0 ? (
          <EmptyState compact icon={Users2} title="No contributions in this window" description="Add an expense and the member bars appear." />
        ) : (
          <>
            <div role="img" aria-label={`Member contributions for ${rows.length} members`}>
              <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 44)}>
                <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--caption)', fontSize: 11 }}
                    tickFormatter={(v) => formatCompact(v, currency)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={92}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                    content={<ChartTooltip formatValue={(v) => format(v, currency)} />}
                  />
                  <Bar dataKey="paid" name="Paid" fill={chartColor(0)} radius={[0, 4, 4, 0]} maxBarSize={14} />
                  <Bar dataKey="consumed" name="Consumed" fill={chartColor(3)} radius={[0, 4, 4, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Contribution table, full paisa precision</caption>
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-caption">
                    <th scope="col" className="py-1.5 text-left font-medium">
                      Member
                    </th>
                    <th scope="col" className="py-1.5 text-right font-medium">
                      Paid ({currency})
                    </th>
                    <th scope="col" className="py-1.5 text-right font-medium">
                      Consumed
                    </th>
                    <th scope="col" className="py-1.5 text-right font-medium">
                      Net
                    </th>
                    <th scope="col" className="py-1.5 text-right font-medium">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row" className="py-2 text-left font-normal">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{row.name}</span>
                          {row.status === 'settled' ? <Badge tone="neutral" className="py-0">settled</Badge> : null}
                        </span>
                      </th>
                      <td className="py-2 text-right tabular">
                        <Money minor={row.paid} currency={currency} />
                      </td>
                      <td className="py-2 text-right tabular">
                        <Money minor={row.consumed} currency={currency} />
                      </td>
                      <td className={`py-2 text-right tabular ${row.netMinor > 0 ? 'text-success-foreground' : row.netMinor < 0 ? 'text-danger-foreground' : 'text-muted-foreground'}`}>
                        {row.netMinor === 0 ? '—' : <Money minor={row.netMinor} currency={currency} signed />}
                      </td>
                      <td className="py-2 text-right tabular text-xs text-caption">{row.sharePercent.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default MemberContribution
