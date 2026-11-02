import { cn } from '@/lib/utils'

export function Card({ className, as: Comp = 'div', ...props }) {
  return (
    <Comp
      className={cn('rounded-card border border-border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1 p-5', className)} {...props} />
}

export function CardTitle({ className, level = 'div', ...props }) {
  const Comp = level === 'h2' || level === 'h3' ? level : 'div'
  return (
    <Comp
      className={cn('font-display text-base font-semibold leading-snug tracking-tight', className)}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-[13px] leading-relaxed text-muted-foreground', className)} {...props} />
}

export function CardContent({ className, ...props }) {
  return <div className={cn('px-5 pb-5', className)} {...props} />
}

export function CardFooter({ className, ...props }) {
  return (
    <div className={cn('flex items-center gap-3 border-t border-border px-5 py-4', className)} {...props} />
  )
}

export default Card
