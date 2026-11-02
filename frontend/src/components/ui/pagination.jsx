import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Pagination for RTKQ lists whose meta came through the envelope. */
export function Pagination({ page = 1, totalPages = 1, onPageChange, className, label = 'Pagination' }) {
  if (!totalPages || totalPages <= 1) return null
  const go = (p) => {
    if (p >= 1 && p <= totalPages && p !== page) onPageChange?.(p)
  }
  return (
    <nav aria-label={label} className={cn('flex items-center justify-between gap-3', className)}>
      <button
        type="button"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className="inline-flex h-9 items-center gap-1 rounded-control border border-border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Prev
      </button>
      <span className="text-[13px] tabular text-muted-foreground" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => go(page + 1)}
        disabled={page >= totalPages}
        className="inline-flex h-9 items-center gap-1 rounded-control border border-border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
      >
        Next
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </nav>
  )
}

export default Pagination
