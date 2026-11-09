import { useEffect, useRef, useState } from 'react'
import { FileText, ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react'
import Button from '@/components/ui/button'
import Badge from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** Mirrors the backend's receipt guard (docs/03: jpg/png/webp/pdf ≤ 8 MB). */
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export const RECEIPT_EXT = /\.(jpe?g|png|webp|pdf)$/i
export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024

export function validateReceipt(file) {
  if (!file) return null
  const typeOk = RECEIPT_TYPES.includes(file.type)
  if (!typeOk && !RECEIPT_EXT.test(file.name ?? '')) {
    return 'Only JPG, PNG, WEBP or PDF receipts are allowed.'
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 8 MB.`
  }
  if (file.size === 0) return 'That file is empty.'
  return null
}

/**
 * Stages a receipt locally with type/size validation + preview.
 * On create the file is uploaded after the expense exists (POST /expenses/:id/receipt);
 * in edit mode it uploads immediately because the expense id is known.
 */
export function ReceiptUploader({
  file,
  onFileChange,
  existing = null, // { url, mimeType, sizeBytes, fileName }
  onRemoveExisting,
  onUploadExisting,
  error,
  busy = false,
  className,
}) {
  const inputRef = useRef(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [localError, setLocalError] = useState(null)

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreviewUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const pick = (next) => {
    const message = validateReceipt(next)
    setLocalError(message)
    if (message) {
      onFileChange?.(null)
      return
    }
    onFileChange?.(next)
  }

  const shown = file ? { name: file.name, bytes: file.size, kind: file.type } : existing
  const shownError = localError || error
  const isImage = shown ? (shown.kind ?? shown.mimeType ?? '').startsWith('image/') : false
  const imageSrc = file ? previewUrl : existing?.url

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-control border border-dashed border-border bg-muted/40 px-3 py-3',
          shownError && 'border-danger/50',
        )}
      >
        {shown ? (
          isImage && imageSrc ? (
            <img
              src={imageSrc}
              alt={`Receipt preview: ${shown.name}`}
              className="h-16 w-16 rounded-control border border-border bg-card object-contain"
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-control border border-border bg-card">
              {isImage ? <ImageIcon className="size-6 text-caption" aria-hidden /> : <FileText className="size-6 text-caption" aria-hidden />}
            </span>
          )
        ) : (
          <span className="flex size-16 items-center justify-center rounded-control border border-border bg-card">
            <Paperclip className="size-6 text-caption" aria-hidden />
          </span>
        )}

        <div className="min-w-0 flex-1">
          {shown ? (
            <>
              <p className="truncate text-sm font-medium">{shown.name ?? shown.fileName ?? 'receipt'}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-caption">
                <Badge tone="outline">{formatBytes(shown.bytes ?? shown.sizeBytes)}</Badge>
                <span className="tabular">{shown.kind ?? shown.mimeType ?? 'file'}</span>
              </p>
              {!file && existing && (onUploadExisting || onRemoveExisting) ? (
                <div className="mt-2 flex gap-2">
                  {onUploadExisting ? (
                    <Button type="button" size="sm" variant="outline" onClick={onUploadExisting} loading={busy}>
                      Replace
                    </Button>
                  ) : null}
                  {onRemoveExisting ? (
                    <Button type="button" size="sm" variant="danger-outline" onClick={onRemoveExisting} disabled={busy}>
                      <Trash2 aria-hidden /> Remove
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm font-medium">No receipt attached</p>
              <p className="text-xs text-caption">JPG, PNG, WEBP or PDF — up to 8 MB.</p>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={RECEIPT_TYPES.join(',')}
          className="sr-only"
          aria-label="Choose a receipt file"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        {!existing || file ? (
          <Button type="button" variant={file ? 'outline' : 'secondary'} size="sm" onClick={() => inputRef.current?.click()}>
            <Upload aria-hidden />
            {file ? 'Change file' : 'Upload receipt'}
          </Button>
        ) : null}
        {file ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => pick(null)}>
            Clear
          </Button>
        ) : null}
      </div>

      {shownError ? (
        <p role="status" className="text-xs text-danger-foreground">
          {shownError}
        </p>
      ) : null}
    </div>
  )
}

export function formatBytes(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '0 KB'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default ReceiptUploader
