import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

const base =
  'w-full rounded-control border border-input bg-card px-3 text-sm text-foreground shadow-sm transition-colors duration-[var(--bb-motion-colors)] placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger'

export const Input = forwardRef(function Input(
  { className, invalid = false, 'aria-describedby': describedBy, id: idProp, ...props },
  ref,
) {
  const id = useId()
  return (
    <input
      ref={ref}
      id={idProp || id}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={cn(base, 'h-10', className)}
      {...props}
    />
  )
})

export const Textarea = forwardRef(function Textarea(
  { className, invalid = false, rows = 3, 'aria-describedby': describedBy, id: idProp, ...props },
  ref,
) {
  const id = useId()
  return (
    <textarea
      ref={ref}
      id={idProp || id}
      rows={rows}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={cn(base, 'py-2 leading-relaxed', className)}
      {...props}
    />
  )
})

/** Field = label + control slot + helper/error text wired with aria-describedby. */
export function Field({ label, htmlFor, error, hint, required, children, className }) {
  const describedBy =
    [error ? `${htmlFor}-error` : null, hint ? `${htmlFor}-hint` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {label}
          {required ? <span className="ml-0.5 text-danger-foreground" aria-hidden> *</span> : null}
        </label>
      ) : null}
      {typeof children === 'function' ? children({ describedBy }) : children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-danger-foreground" role="status">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default Input
