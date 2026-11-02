import { useState } from 'react'
import Button from './button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'

/**
 * Confirm dialog for destructive actions — names the consequence explicitly
 * (docs/06 UX rule 5). `onConfirm` may be async; the button shows loading.
 * Optional `requireText`: user must type it (delete-account flows).
 */
export function ConfirmDialog({
  open: controlledOpen,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  requireText,
  children,
}) {
  const [uncontrolled, setUncontrolled] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const open = controlledOpen ?? uncontrolled
  const setOpen = onOpenChange ?? setUncontrolled

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm?.()
      setOpen(false)
      setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {requireText ? (
          <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            Type <span className="font-semibold tabular text-danger-foreground">{requireText}</span> to confirm
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-10 rounded-control border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={`Type ${requireText} to confirm`}
            />
          </label>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={Boolean(requireText) && text.trim() !== requireText}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ConfirmDialog
