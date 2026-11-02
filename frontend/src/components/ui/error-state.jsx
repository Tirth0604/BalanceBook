import { RotateCw, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import Button from './button'

/** Error state with retry — RTKQ `error` may be { code, message } or an Error. */
export function errorTitle(error, fallback = 'Something went wrong') {
  if (!error) return fallback
  if (typeof error === 'string') return error
  if (error.message) return error.message
  return fallback
}

export function ErrorState({ error, message, onRetry, className, compact = false }) {
  const text = message || errorTitle(error)
  const status = error?.status
  const headline =
    status === 403
      ? 'You do not have access to this.'
      : status === 404
        ? 'We could not find this.'
        : 'Something went wrong.'
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-danger/30 bg-danger-muted px-6 py-10 text-center',
        compact && 'py-6',
        className,
      )}
      role="alert"
    >
      <span className="flex size-11 items-center justify-center rounded-pill bg-danger/10">
        <TriangleAlert className="size-5 text-danger-foreground" aria-hidden />
      </span>
      <div className="space-y-1">
        <h3 className="font-display text-base font-semibold text-danger-foreground">{headline}</h3>
        <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-muted-foreground">{text}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          <RotateCw aria-hidden />
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export default ErrorState
