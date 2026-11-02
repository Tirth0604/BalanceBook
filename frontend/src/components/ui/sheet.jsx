import { forwardRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Side sheet (Radix dialog under the hood) — used for Add Expense and the
 * expense/group detail drawer. Focus-trapped, Esc-dismissable, returns focus.
 * On mobile it is full-width / full-height; on desktop a right-side panel.
 */

const sheetContent = cva(
  'fixed z-50 flex flex-col bg-card text-card-foreground shadow-lg transition-transform duration-[200ms] ease-[cubic-bezier(.2,.8,.2,1)]',
  {
    variants: {
      side: {
        right:
          'inset-y-0 right-0 h-full w-full max-w-xl border-l border-border data-[state=open]:animate-slide-left data-[state=closed]:animate-[bb-slide-right_150ms_ease-in]',
        left:
          'inset-y-0 left-0 h-full w-full max-w-xl border-r border-border data-[state=open]:animate-slide-right',
        bottom:
          'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-sheet border-t border-border data-[state=open]:animate-slide-up',
      },
    },
    defaultVariants: { side: 'right' },
  },
)

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close

const SheetOverlay = forwardRef(function SheetOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-50 bg-navy-900/45 data-[state=open]:animate-fade-in', className)}
      {...props}
    />
  )
})

const SheetContent = forwardRef(function SheetContent(
  { className, side = 'right', children, title, description, ...props },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Content ref={ref} className={cn(sheetContent({ side }), className)} {...props}>
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <DialogPrimitive.Title className="font-display text-lg font-semibold">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-[13px] text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            className="rounded-control p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close panel"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})

const SheetFooter = forwardRef(function SheetFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('flex items-center justify-end gap-2 border-t border-border bg-card p-4', className)}
      {...props}
    />
  )
})

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetFooter }
export default Sheet
