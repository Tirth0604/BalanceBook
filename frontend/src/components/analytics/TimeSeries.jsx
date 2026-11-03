import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, formatCompact } from '@/lib/money'
import ChartTooltip, { chartColor } from '@/components/ui/chart-tooltip'
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import ErrorState from '@/components/ui/error-state'
import Skeleton from '@/components/ui/skeleton'
import { TrendingUp } from 'lucide-react'

/**
 * Line: GET /analytics/trend → { points: [{ period, totalMinor, paidByMeMinor,
 * consumedByMeMinor }] }. Two extra series show your own money moving in and out.
 */
export function TimeSeries({ data, currency = 'INR', loading = false, error = null, onRetry, height = 260 }) {
  const points = data?.points ?? []
  const rows = points.map((point) => ({
    label: point.period ?? point.label ?? '',
    total: Number(point.totalMinor) || 0,
    paidByMe: Number(point.paidByMeMinor) || 0,
    consumedByMe: Number(point.consumedByMeMinor) || 0,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trend</CardTitle>
        <CardDescription>
          {data?.granularity ? `${data.granularity}ly buckets · ` : ''}total spend against what you personally paid and consumed
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} compact />
        ) : rows.length === 0 ? (
          <EmptyState compact icon={TrendingUp} title="No buckets in this window" description="Widen the range to see the shape of the spending." />
        ) : (
          <div role="img" aria-label={`Spend trend with ${rows.length} buckets`}>
            <ResponsiveContainer width="100%" height={height}>
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tick={{ fill: 'var(--caption)', fontSize: 11 }}
                  tickFormatter={(v) => formatCompact(v, currency)}
                />
                <Tooltip content={<ChartTooltip formatValue={(v) => format(v, currency)} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="total" name="Group spend" stroke={chartColor(0)} strokeWidth={2} dot={rows.length < 40} />
                <Line type="monotone" dataKey="paidByMe" name="You paid" stroke={chartColor(1)} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                <Line type="monotone" dataKey="consumedByMe" name="You consumed" stroke={chartColor(2)} strokeWidth={1.5} strokeDasharray="2 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default TimeSeries
