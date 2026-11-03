import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Info,
  Lightbulb,
  Scale,
  TrendingUp,
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

const KIND_ICONS = {
  spend_trend: TrendingUp,
  balance: Scale,
  budget: AlertTriangle,
  settlement: Scale,
}

/**
 * One deterministic, rule-based insight from GET /groups/:id/insights. The card
 * renders exactly what the server said (title/body/metric) — nothing is invented
 * client-side, and any money is a server-supplied minor-unit field.
 */
export function InsightCard({ insight = {}, currency = 'INR', className }) {
  const severity = SEVERITY[insight.severity ?? insight.tone ?? 'info'] ?? SEVERITY.info
  const Icon = KIND_ICONS[insight.kind ?? insight.type] ?? severity.Icon
  const href = insight.actionHref ?? insight.link ?? null

  return (
    <Card className={cn('flex h-full flex-col', className)}>
      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Icon className="size-3.5 text-caption" aria-hidden />
            {(insight.kind ?? insight.type ?? 'insight').replace(/_/g, ' ')}
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

        <div className="mt-auto flex flex-wrap items-baseline gap-2 pt-2">
          {Number.isFinite(Number(insight.amountMinor)) ? (
            <Money minor={Number(insight.amountMinor)} currency={currency} signed className="font-display text-lg font-semibold" />
          ) : null}
          {Number.isFinite(Number(insight.percent)) ? (
            <span className="tabular text-sm font-medium">{Number(insight.percent).toFixed(1)}%</span>
          ) : null}
          {insight.category ? <Badge tone="outline">{insight.categoryLabel ?? insight.category}</Badge> : null}
          {insight.user?.name ? <span className="text-xs text-caption">{insight.user.name}</span> : null}
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
