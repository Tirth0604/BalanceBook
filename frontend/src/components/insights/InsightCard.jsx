import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Gauge,
  HandCoins,
  Info,
  Lightbulb,
  PieChart,
  Receipt,
  Scale,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import Badge from '@/components/ui/badge'
import Card, { CardContent } from '@/components/ui/card'
import Money from '@/components/money/Money'
import { cn } from '@/lib/utils'

const SEVERITY = {
  positive: { tone: 'success', Icon: CheckCircle2, words: 'good' },
  good: { tone: 'success', Icon: CheckCircle2, words: 'good' },
  info: { tone: 'info', Icon: Info, words: 'note' },
  neutral: { tone: 'neutral', Icon: Lightbulb, words: 'note' },
  warning: { tone: 'warning', Icon: AlertTriangle, words: 'watch' },
  danger: { tone: 'danger', Icon: AlertTriangle, words: 'risk' },
  critical: { tone: 'danger', Icon: AlertTriangle, words: 'risk' },
}

/**
 * Every `type` insightsService's RULES can emit — GET /groups/:id/insights and GET /insights
 * send these names, so the icon lookup is a direct hit and never falls through to the
 * severity glyph by accident.
 */
const KIND_ICONS = {
  spend_trend: TrendingUp,
  category_change: ArrowRightLeft,
  top_category: PieChart,
  contribution_share: HandCoins,
  spend_vs_group_average: Target,
  most_active_member: Trophy,
  debt_aging: CalendarClock,
  settlement_pending: Receipt,
  budget_pressure: Gauge,
  group_leader: Scale,
}

const MINOR = 'minor'
const PERCENT = 'percent'
const COUNT = 'count'

/**
 * `metric` is the rule's own evidence object and its fields differ per rule. Each type names
 * exactly which server-supplied fields to print, so a chip is always a number the API sent:
 * minor units go through <Money> untouched, percentages are printed as they arrived.
 */
const METRIC_CHIPS = {
  spend_trend: [
    { field: 'currentMinor', kind: MINOR, label: 'now' },
    { field: 'previousMinor', kind: MINOR, label: 'before' },
    { field: 'changePercent', kind: PERCENT, label: 'change', signed: true },
  ],
  category_change: [
    { field: 'currentMinor', kind: MINOR, label: 'now' },
    { field: 'previousMinor', kind: MINOR, label: 'before' },
    { field: 'changePercent', kind: PERCENT, label: 'change', signed: true },
  ],
  top_category: [
    { field: 'totalMinor', kind: MINOR, label: 'spent' },
    { field: 'percentOfSpend', kind: PERCENT, label: 'of spend' },
    { field: 'expenseCount', kind: COUNT, label: 'expense count' },
  ],
  contribution_share: [
    { field: 'paidMinor', kind: MINOR, label: 'paid' },
    { field: 'consumedMinor', kind: MINOR, label: 'used' },
    { field: 'netMinor', kind: MINOR, label: 'net', signed: true },
    { field: 'fundedPercent', kind: PERCENT, label: 'funded' },
  ],
  spend_vs_group_average: [
    { field: 'consumedMinor', kind: MINOR, label: 'you' },
    { field: 'averageConsumedMinor', kind: MINOR, label: 'average' },
    { field: 'changePercent', kind: PERCENT, label: 'vs average', signed: true },
  ],
  most_active_member: [
    { field: 'paidMinor', kind: MINOR, label: 'paid' },
    { field: 'expenseCount', kind: COUNT, label: 'lines' },
    { field: 'sharePercent', kind: PERCENT, label: 'share' },
  ],
  debt_aging: [
    { field: 'owesMinor', kind: MINOR, label: 'owes' },
    { field: 'outstandingMinor', kind: MINOR, label: 'unsettled' },
    { field: 'ageDays', kind: COUNT, label: 'days old' },
  ],
  settlement_pending: [
    { field: 'amountMinor', kind: MINOR, label: 'proposed' },
    { field: 'count', kind: COUNT, label: 'waiting' },
  ],
  budget_pressure: [
    { field: 'spentMinor', kind: MINOR, label: 'spent' },
    { field: 'limitMinor', kind: MINOR, label: 'limit' },
    { field: 'percentUsed', kind: PERCENT, label: 'used' },
  ],
  group_leader: [
    { field: 'spentMinor', kind: MINOR, label: 'top group' },
    { field: 'totalMinor', kind: MINOR, label: 'your total' },
    { field: 'sharePercent', kind: PERCENT, label: 'share' },
  ],
}

function labelFor(value) {
  return String(value).replace(/_/g, ' ')
}

/** Percent fields print the server's own rounding — no toFixed, no recomputed ratio. */
function percentText(value, signed) {
  if (signed && value > 0) return `+${value}%`
  return `${value}%`
}

/**
 * The chips a card should show, in order. Money keeps its currency per field because a
 * budget's limit is in the budget's unit, not the scope's.
 */
export function metricChips(insight = {}, currency = 'INR') {
  const specs = METRIC_CHIPS[insight.type ?? insight.kind]
  const metric = insight.metric
  if (!specs || !metric || typeof metric !== 'object') return []
  const chips = []
  for (const spec of specs) {
    const value = Number(metric[spec.field])
    if (!Number.isFinite(value)) continue
    chips.push({
      key: spec.field,
      kind: spec.kind,
      label: spec.label,
      value,
      currency: spec.kind === MINOR ? metric.currency ?? currency : null,
      text:
        spec.kind === PERCENT
          ? percentText(value, spec.signed)
          : spec.kind === COUNT
            ? String(value)
            : null,
      signed: Boolean(spec.signed),
    })
  }
  return chips
}

/**
 * One deterministic, rule-based insight from GET /groups/:id/insights or GET /insights. The
 * card renders exactly what the server said (title/body/metric) — nothing is invented
 * client-side, and every amount is a server-supplied minor-unit field formatted by lib/money.
 */
export function InsightCard({ insight = {}, currency = 'INR', className }) {
  const severity = SEVERITY[insight.severity ?? insight.tone ?? 'info'] ?? SEVERITY.info
  const type = insight.type ?? insight.kind ?? null
  const Icon = (type && KIND_ICONS[type]) || severity.Icon
  const href = insight.actionHref ?? insight.link ?? null
  const chips = metricChips(insight, currency)
  const category = insight.metric?.categoryLabel ?? insight.metric?.category ?? insight.category ?? null
  const windowPreset = insight.window?.preset ?? null

  return (
    <Card className={cn('flex h-full flex-col', className)}>
      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Icon className="size-3.5 text-caption" aria-hidden />
            {type ? labelFor(type) : 'insight'}
          </span>
          <Badge tone={severity.tone}>
            <severity.Icon className="size-3" aria-hidden />
            {severity.words}
          </Badge>
        </div>

        <h3 className="font-display text-sm font-semibold leading-snug">{insight.title ?? insight.message ?? 'Insight'}</h3>
        {insight.body ?? insight.message ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">{insight.body ?? insight.message}</p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-2">
          {chips.map((chip, index) => (
            <span key={chip.key} className="flex items-baseline gap-1">
              {chip.kind === MINOR ? (
                <Money
                  minor={chip.value}
                  currency={chip.currency}
                  signed={chip.signed}
                  className={cn('font-display', index === 0 ? 'text-lg font-semibold' : 'text-sm font-medium')}
                />
              ) : (
                <span
                  className={cn(
                    'tabular font-display',
                    index === 0 ? 'text-lg font-semibold' : 'text-sm font-medium',
                  )}
                >
                  {chip.text}
                </span>
              )}
              <span className="text-[11px] text-caption">{chip.label}</span>
            </span>
          ))}
          {category ? <Badge tone="outline">{labelFor(category)}</Badge> : null}
          {windowPreset && windowPreset !== 'all' ? (
            <span className="text-[11px] text-caption">{labelFor(windowPreset)}</span>
          ) : null}
          {href ? (
            <Link to={href} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline">
              {insight.actionLabel ?? 'Open'} <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default InsightCard
