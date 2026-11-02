import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5 text-xs font-medium leading-5 transition-colors duration-[var(--bb-motion-colors)]',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        primary: 'border-transparent bg-primary-muted text-primary',
        success: 'border-transparent bg-success-muted text-success-foreground',
        danger: 'border-transparent bg-danger-muted text-danger-foreground',
        warning: 'border-transparent bg-warning-muted text-warning',
        info: 'border-transparent bg-info-muted text-info',
        outline: 'border-border bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export function Badge({ className, tone, ...props }) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

export { badgeVariants }
export default Badge
