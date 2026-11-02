import { ArrowDownLeft, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from '@/lib/money'
import Money from './Money'

/**
 * Net-balance pill. NEVER colour alone (WCAG 1.4.1): direction is also
 * encoded by an arrow icon and a word ("owed to you" / "you owe").
 *  net > 0 → this person owes the group less than they're due → RECEIVABLE (green)
 *  Perspective prop `label` lets callers override the wording.
 */
export function BalancePill({
  netMinor,
  currency = 'INR',
  size = 'md',
  label,
  className,
  as: Comp = 'div',
}) {
  const net = Number(netMinor) || 0
  const tone = net > 0 ? 'receivable' : net < 0 ? 'payable' : 'neutral'

  const config = {
    receivable: {
      Icon: ArrowDownLeft,
      words: label ?? 'owed to you',
      cls: 'bg-success-muted text-success-foreground border-success/25',
      aria: `Owed to you ${format(Math.abs(net), currency)}`,
    },
    payable: {
      Icon: ArrowUpRight,
      words: label ?? 'you owe',
      cls: 'bg-danger-muted text-danger-foreground border-danger/25',
      aria: `You owe ${format(Math.abs(net), currency)}`,
    },
    neutral: {
      Icon: Minus,
      words: label ?? 'settled up',
      cls: 'bg-muted text-muted-foreground border-border',
      aria: 'Settled up',
    },
  }[tone]

  const Icon = config.Icon
  return (
    <Comp
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[13px]',
        config.cls,
        className,
      )}
      role="status"
      aria-label={config.aria}
    >
      <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden />
      <Money minor={Math.abs(net)} currency={currency} className="font-medium" />
      <span className="text-[11px] leading-none uppercase tracking-wide opacity-80">{config.words}</span>
    </Comp>
  )
}

export default BalancePill
