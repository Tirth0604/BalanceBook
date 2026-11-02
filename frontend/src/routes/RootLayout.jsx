import { useEffect, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { hydrate, markAnonymous } from '@/store/authSlice'
import { authApi } from '@/services/endpoints/authApi'
import { notificationsApi } from '@/services/endpoints/notificationsApi'
import { balancesApi } from '@/services/endpoints/balancesApi'
import { analyticsApi } from '@/services/endpoints/analyticsApi'
import { expensesApi } from '@/services/endpoints/expensesApi'
import { settlementsApi } from '@/services/endpoints/settlementsApi'
import { connect, disconnect, on } from '@/lib/io'
import { useToast } from '@/components/ui/toast'

/** Applies the persisted theme class to <html>. */
function ThemeSync() {
  const theme = useAppSelector((state) => state.ui.theme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('bb-theme', theme)
    } catch {
      /* storage blocked */
    }
  }, [theme])
  return null
}

/**
 * On first mount with status 'unknown', try ONE silent refresh (httpOnly
 * cookie). Success → credentials in memory; failure → anonymous.
 */
function AuthBootstrap() {
  const dispatch = useAppDispatch()
  const status = useAppSelector((state) => state.auth.status)
  const tried = useRef(false)

  useEffect(() => {
    if (status !== 'unknown' || tried.current) return
    tried.current = true
    const run = async () => {
      try {
        const res = await dispatch(authApi.endpoints.refreshSession.initiate())
        const payload = 'data' in res ? res.data : res
        if (payload?.accessToken) dispatch(hydrate(payload))
        else dispatch(markAnonymous())
      } catch {
        dispatch(markAnonymous())
      }
    }
    run()
  }, [status, dispatch])

  return null
}

/**
 * Socket lifecycle tied to the access token + event → cache invalidation.
 * Sockets never write amounts; they only trigger refetches (docs/05 §3).
 */
function SocketBridge() {
  const dispatch = useAppDispatch()
  const accessToken = useAppSelector((state) => state.auth.accessToken)
  const toast = useToast()

  useEffect(() => {
    if (!accessToken) {
      disconnect()
      return undefined
    }
    connect(accessToken)
    const offs = [
      on('notification:new', (payload) => {
        dispatch(notificationsApi.util.invalidateTags(['Notification']))
        toast.info(payload?.title || 'New notification', payload?.body)
      }),
      on('balance:changed', ({ groupId } = {}) => {
        if (!groupId) return
        dispatch(balancesApi.util.invalidateTags([{ type: 'Balance', id: String(groupId) }]))
        dispatch(settlementsApi.util.invalidateTags([{ type: 'Suggested', id: String(groupId) }]))
        // /me/summary lives in balancesApi's cache; overview charts in analyticsApi's.
        dispatch(balancesApi.util.invalidateTags([{ type: 'Analytics', id: 'OVERVIEW' }]))
        dispatch(analyticsApi.util.invalidateTags([{ type: 'Analytics', id: 'OVERVIEW' }]))
      }),
      on('expense:created', () => dispatch(expensesApi.util.invalidateTags([{ type: 'Expense', id: 'LIST' }]))),
      on('expense:updated', () => dispatch(expensesApi.util.invalidateTags([{ type: 'Expense', id: 'LIST' }]))),
      on('expense:deleted', () => dispatch(expensesApi.util.invalidateTags([{ type: 'Expense', id: 'LIST' }]))),
      on('settlement:updated', () => dispatch(settlementsApi.util.invalidateTags([{ type: 'Settlement', id: 'LIST' }]))),
      on('invitation:new', () => dispatch(notificationsApi.util.invalidateTags(['Notification']))),
    ]
    return () => {
      offs.forEach((off) => off?.())
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  return null
}

export function RootLayout() {
  return (
    <>
      <ThemeSync />
      <AuthBootstrap />
      <SocketBridge />
      <Outlet />
    </>
  )
}

export default RootLayout
