import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, formatCompact } from '@/lib/money'
import ChartTooltip from '@/components/ui/chart-tooltip'
import { chartColor } from '@/components/ui/chart-tooltip'
import { EmptyState } from '@/components/ui/empty-state'
import { BarChart3 } from 'lucide-react'

/**
 * Monthly/period bars. data: [{ label, value }] — values in minor units.
 */
export function MonthlyBars({ data = [], currency = 'INR', height = 240, title = 'Spending over time' }) {
  if (data.length === 0) {
    return (
      <EmptyState compact icon={BarChart3} title="Nothing to chart yet" description="Log an expense and this will light up." />
    )
  }
  return (
    <div aria-label={title} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fill: 'var(--caption)', fontSize: 11 }}
            tickFormatter={(v) => formatCompact(v, currency)}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
            content={<ChartTooltip formatValue={(v) => format(v, currency)} />}
          />
          <Bar dataKey="value" name="Spent" fill={chartColor(0)} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default MonthlyBars
