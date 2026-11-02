import { cn } from '@/lib/utils'

/** Designed empty state: icon + title + description + exactly one action. */
export function EmptyState({ icon: Icon, title, description, action, className, compact = false }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border bg-card px-6 py-10 text-center',
        compact && 'py-6',
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-12 items-center justify-center rounded-pill bg-primary-muted">
          <Icon className="size-5.5 text-primary" aria-hidden />
        </span>
      ) : null}
      <div className="space-y-1">
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}

export default EmptyState
