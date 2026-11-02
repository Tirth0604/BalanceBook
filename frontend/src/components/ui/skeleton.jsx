import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }) {
  return <div aria-hidden className={cn('skeleton', className)} {...props} />
}

/** Pre-composed list skeleton: rows of avatar+lines, useful everywhere. */
export function SkeletonList({ rows = 4, className }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-card border border-border bg-card p-4">
          <Skeleton className="size-10 rounded-pill" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard({ className }) {
  return (
    <div className={cn('rounded-card border border-border bg-card p-5', className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-4 h-8 w-2/3" />
      <Skeleton className="mt-3 h-3 w-full" />
    </div>
  )
}

export default Skeleton
