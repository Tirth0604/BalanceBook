import { Link } from 'react-router-dom'
import { Compass, Hammer } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import Button from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/**
 * Catch-all 404. Also used by the router for pages a parallel build phase
 * has not landed yet — `pendingFor` keeps that copy honest per section.
 */
export default function NotFound({ pendingFor = null }) {
  useDocumentTitle(pendingFor ? `${pendingFor} — coming soon` : 'Page not found')

  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-10">
      <EmptyState
        icon={pendingFor ? Hammer : Compass}
        title={pendingFor ? `${pendingFor} is still being built` : 'Page not found'}
        description={
          pendingFor
            ? 'Your balances, groups and dashboard are live meanwhile — this section lands in the current build phase.'
            : 'We could not find that page. It may have moved or never existed.'
        }
        action={
          <Button asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    </div>
  )
}
