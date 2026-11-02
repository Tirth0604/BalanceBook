import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { format } from '@/lib/money'
import { chartColor } from '@/components/ui/chart-tooltip'
import ChartTooltip from '@/components/ui/chart-tooltip'
import { EmptyState } from '@/components/ui/empty-state'
import { ReceiptText } from 'lucide-react'

/**
 * Category donut. slices: [{ name/label, value/minor }] — values are MINOR.
 * Center shows the total. Legend is a compact list (colour + name + amount).
 */
export function CategoryDonut({ slices = [], currency = 'INR', height = 240, title = 'Spending by category' }) {
  const data = slices
    .map((s, i) => ({
      name: s.name ?? s.label ?? s.category ?? 'Other',
      value: Number(s.value ?? s.minor ?? s.totalMinor ?? 0),
      color: s.color || chartColor(i),
    }))
    .filter((s) => s.value > 0)

  const total = data.reduce((acc, s) => acc + s.value, 0)
  if (data.length === 0) {
    return (
      <EmptyState compact icon={ReceiptText} title="No spending yet" description="Expenses in the selected range will appear here." />
    )
  }

  return (
    <div>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart aria-label={title}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatValue={(v) => format(v, currency)} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[11px] uppercase tracking-wide text-caption">Total</p>
          <p className="font-display text-lg font-semibold tabular">{format(total, currency)}</p>
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {data.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-[12px]">
            <span className="size-2 shrink-0 rounded-pill" style={{ backgroundColor: s.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.name}</span>
            <span className="tabular font-medium">{format(s.value, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default CategoryDonut
