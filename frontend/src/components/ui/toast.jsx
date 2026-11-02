import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { dismissToast, pushToast } from '@/store/uiSlice'

/**
 * Toast context on top of uiSlice.toasts. `useToast().success(...)` etc.
 * A single aria-live region announces toasts; auto-dismiss honours duration.
 */

const ToastContext = createContext(null)

const TOAST_STYLES = {
  success: { Icon: CheckCircle2, cls: 'text-success-foreground', iconCls: 'text-success' },
  error: { Icon: XCircle, cls: 'text-danger-foreground', iconCls: 'text-danger' },
  warning: { Icon: AlertTriangle, cls: 'text-warning', iconCls: 'text-warning' },
  info: { Icon: Info, cls: 'text-foreground', iconCls: 'text-info' },
}

function ToastItem({ toast, onDismiss }) {
  const timerRef = useRef(null)
  const { Icon, iconCls } = TOAST_STYLES[toast.type] || TOAST_STYLES.info

  useEffect(() => {
    if (toast.duration > 0) {
      timerRef.current = setTimeout(() => onDismiss(toast.id), toast.duration)
      return () => clearTimeout(timerRef.current)
    }
  }, [toast, onDismiss])

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-card border border-border bg-card px-4 py-3 text-sm shadow-md animate-slide-up',
      )}
      role="status"
    >
      <Icon className={cn('mt-0.5 size-4.5 shrink-0', iconCls)} aria-hidden />
      <div className="min-w-0 flex-1">
        {toast.title ? <p className="font-medium leading-snug">{toast.title}</p> : null}
        {toast.message ? (
          <p className={cn('text-[13px] leading-relaxed text-muted-foreground', toast.type === 'error' && 'text-danger-foreground')}>
            {toast.message}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="rounded-[7px] p-1 text-caption transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const dispatch = useAppDispatch()
  const toasts = useAppSelector((state) => state.ui.toasts)
  const dismiss = useCallback((id) => dispatch(dismissToast(id)), [dispatch])

  const api = useMemo(
    () => ({
      show: (type, titleOrOpts, message) => {
        const opts =
          typeof titleOrOpts === 'object' && titleOrOpts !== null
            ? titleOrOpts
            : { title: titleOrOpts, message }
        return dispatch(pushToast({ type, ...opts }))
      },
      success: (title, message) => dispatch(pushToast({ type: 'success', title, message })),
      error: (title, message) => dispatch(pushToast({ type: 'error', title, message, duration: 7000 })),
      info: (title, message) => dispatch(pushToast({ type: 'info', title, message })),
      warning: (title, message) => dispatch(pushToast({ type: 'warning', title, message })),
      dismiss,
    }),
    [dispatch, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <>
              <div
                aria-live="polite"
                aria-label="Notifications"
                className="pointer-events-none fixed bottom-20 right-4 z-[60] flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
              >
                {toasts.map((t) => (
                  <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
                ))}
              </div>
            </>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

export default ToastProvider
