import { useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { logout as logoutAction } from '@/store/authSlice'
import { authApi } from '@/services/endpoints/authApi'
import { disconnect } from '@/lib/io'

export function useAuth() {
  const dispatch = useAppDispatch()
  const { user, accessToken, status } = useAppSelector((state) => state.auth)
  const [login] = authApi.useLoginMutation()
  const [register] = authApi.useRegisterMutation()
  const [logoutReq] = authApi.useLogoutMutation()

  const doLogout = useCallback(async () => {
    disconnect()
    try {
      await logoutReq().unwrap()
    } catch {
      /* server revoked or offline — local teardown still runs */
    }
    dispatch(logoutAction())
  }, [dispatch, logoutReq])

  return {
    user,
    accessToken,
    status,
    isAuthenticated: status === 'authenticated' && Boolean(accessToken),
    login: (body) => login(body).unwrap(),
    register: (body) => register(body).unwrap(),
    logout: doLogout,
  }
}

export default useAuth
