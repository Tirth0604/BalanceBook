import { fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { logout, setCredentials } from '@/store/authSlice'

/**
 * fetchBaseQuery + envelope unwrap + 401 refresh-and-retry.
 * Success envelope { success, data, meta } is unwrapped:
 *  - no meta  → data is returned as-is
 *  - with meta → `{ items: data, meta }` is returned (paginated lists)
 * Error envelope becomes { status, code, message, details }.
 */

const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = getState()?.auth?.accessToken
    if (token) headers.set('authorization', `Bearer ${token}`)
    return headers
  },
})

function unwrap(result) {
  if (result.error) {
    const raw = result.error.data ?? {}
    const err = raw.error || raw
    return {
      error: {
        status: result.error.status ?? 0,
        code: err.code || (result.error.status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR'),
        message:
          err.message ||
          (raw.message ?? (typeof result.error.error === 'string' ? result.error.error : 'Request failed')),
        details: err.details,
      },
    }
  }
  const body = result.data
  if (body && typeof body === 'object' && body.success === true) {
    if (Object.prototype.hasOwnProperty.call(body, 'meta') && body.meta) {
      return { data: { items: body.data, meta: body.meta } }
    }
    return { data: body.data ?? null }
  }
  return result
}

/** Single in-flight refresh; concurrent 401s queue onto the same promise. */
let refreshPromise = null

export async function baseQueryWithReauth(args, api, extraOptions) {
  const initial = await rawBaseQuery(args, api, extraOptions)
  if (initial.error?.status !== 401) return unwrap(initial)

  const isPublic = typeof args === 'object' && args?.isPublicAuthCall
  const url = typeof args === 'string' ? args : args?.url
  if (isPublic || url === '/auth/refresh') return unwrap(initial)

  if (!refreshPromise) {
    refreshPromise = rawBaseQuery({ url: '/auth/refresh', method: 'POST' }, api, extraOptions).finally(
      () => {
        // clear on next microtask so every queued waiter sees the same promise
        setTimeout(() => {
          refreshPromise = null
        }, 0)
      },
    )
  }

  const refreshResult = await refreshPromise

  if (refreshResult.error) {
    api.dispatch(logout())
    return unwrap(initial)
  }

  const payload = refreshResult.data?.data ?? refreshResult.data
  if (payload?.accessToken) {
    api.dispatch(
      setCredentials({ accessToken: payload.accessToken, user: payload.user ?? undefined }),
    )
  }
  const retry = await rawBaseQuery(args, api, extraOptions)
  return unwrap(retry)
}

export { rawBaseQuery }
