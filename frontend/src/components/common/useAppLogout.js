import { useCallback } from 'react'
import { useAppDispatch } from '@/store/hooks'
import { useAuth } from '@/hooks/useAuth'
import { disconnect } from '@/lib/io'
import { authApi } from '@/services/endpoints/authApi'
import { usersApi } from '@/services/endpoints/usersApi'
import { groupsApi } from '@/services/endpoints/groupsApi'
import { expensesApi } from '@/services/endpoints/expensesApi'
import { balancesApi } from '@/services/endpoints/balancesApi'
import { settlementsApi } from '@/services/endpoints/settlementsApi'
import { analyticsApi } from '@/services/endpoints/analyticsApi'
import { notificationsApi } from '@/services/endpoints/notificationsApi'
import { recurringApi } from '@/services/endpoints/recurringApi'
import { budgetsApi } from '@/services/endpoints/budgetsApi'
import { insightsApi } from '@/services/endpoints/insightsApi'

const APIS = [
  authApi,
  usersApi,
  groupsApi,
  expensesApi,
  balancesApi,
  settlementsApi,
  analyticsApi,
  notificationsApi,
  recurringApi,
  budgetsApi,
  insightsApi,
]

/**
 * One authoritative sign-out: hit the real POST /auth/logout (authApi),
 * drop the socket, then wipe auth slice AND every RTK Query cache so the
 * next user on the device never sees a byte of the previous session.
 */
export function useAppLogout() {
  const dispatch = useAppDispatch()
  const { logout } = useAuth()

  return useCallback(async () => {
    disconnect()
    await logout()
    for (const api of APIS) {
      try {
        dispatch(api.util.resetApiState())
      } catch {
        /* api already torn down (unmount race) */
      }
    }
  }, [dispatch, logout])
}

export default useAppLogout
