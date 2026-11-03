import { useState } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import Button from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useAppSelector } from '@/store/hooks'
import { downloadCsv } from '@/services/endpoints/analyticsApi'

/**
 * Real CSV download against GET /analytics/export.csv (blob, JWT via baseQuery).
 * The window sent here is identical to the one the charts are showing.
 */
export function ExportButton({ params = {}, size = 'sm', variant = 'outline', label = 'Export CSV' }) {
  const toast = useToast()
  const accessToken = useAppSelector((state) => state.auth.accessToken)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      await downloadCsv(params, accessToken)
      toast.success('CSV downloaded', 'The same window you are looking at, one row per expense.')
    } catch (err) {
      toast.error('Export failed', err?.message || 'The server did not return a file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size={size} variant={variant} onClick={run} loading={busy} title="Download this window as CSV">
      <FileSpreadsheet className="size-4" aria-hidden />
      {label}
      <Download className="size-3.5" aria-hidden />
    </Button>
  )
}

export default ExportButton
