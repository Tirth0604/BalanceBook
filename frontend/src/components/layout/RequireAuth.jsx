import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAppSelector } from '@/store/hooks'
import Spinner from '@/components/ui/spinner'

/** Gate: requires a resolved authenticated session. */
export function RequireAuth() {
  const status = useAppSelector((state) => state.auth.status)
  const accessToken = useAppSelector((state) => state.auth.accessToken)
  const location = useLocation()

  if (status === 'unknown' || status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Restoring your session">
        <div className="flex flex-col items-center gap-3">
          <Spinner size={28} className="text-primary" />
          <p className="text-sm text-muted-foreground">Restoring your session…</p>
        </div>
      </div>
    )
  }

  if (status !== 'authenticated' || !accessToken) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  }

  return <Outlet />
}

/** Gate for /login, /register: bounce authed users to the dashboard. */
export function RedirectIfAuthed() {
  const status = useAppSelector((state) => state.auth.status)
  const accessToken = useAppSelector((state) => state.auth.accessToken)
  if (status === 'authenticated' && accessToken) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

export default RequireAuth
