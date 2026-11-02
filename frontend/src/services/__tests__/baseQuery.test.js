import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logout, setCredentials } from '@/store/authSlice'

/**
 * baseQueryWithReauth behaviour with a mocked fetch:
 *  - envelope unwrap (data / {items, meta} / normalised error)
 *  - 401 → single in-flight refresh, queued concurrent retries, retry once
 *  - refresh failure → dispatch(logout)
 * The module is imported AFTER stubbing an absolute API base, because jsdom's
 * Request requires an absolute URL. It is also re-imported for every test so
 * the module-level refreshPromise singleton never leaks across cases.
 */

let baseQueryWithReauth

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost/api/v1')
  ;({ baseQueryWithReauth } = await import('../baseQuery'))
})

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const okEnvelope = (data, meta) => jsonResponse({ success: true, data, ...(meta ? { meta } : {}) })

function makeApi() {
  return { dispatch: vi.fn(), getState: () => ({ auth: { accessToken: 'AT' } }) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('envelope handling', () => {
  it('unwraps data when there is no meta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okEnvelope({ id: 'g1' })))
    const res = await baseQueryWithReauth('/groups/g1', makeApi(), {})
    expect(res.data).toEqual({ id: 'g1' })
  })

  it('wraps paginated lists as { items, meta }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okEnvelope([{ id: 'a' }], { page: 1, total: 1 })))
    const res = await baseQueryWithReauth('/groups', makeApi(), {})
    expect(res.data).toEqual({ items: [{ id: 'a' }], meta: { page: 1, total: 1 } })
  })

  it('normalises error envelopes', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Bad', details: [] } }, 400),
        ),
    )
    const res = await baseQueryWithReauth('/x', makeApi(), {})
    expect(res.error.code).toBe('VALIDATION_ERROR')
    expect(res.error.message).toBe('Bad')
    expect(res.error.status).toBe(400)
  })
})

describe('401 refresh-and-retry', () => {
  it('refreshes once, updates credentials, and retries the original request', async () => {
    const called = { protected: 0, refresh: 0 }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((request) => {
        const url = request.url ?? String(request)
        if (url.includes('/auth/refresh')) {
          called.refresh += 1
          return Promise.resolve(okEnvelope({ accessToken: 'AT2', user: { id: 'u' } }))
        }
        called.protected += 1
        return called.protected === 1
          ? Promise.resolve(jsonResponse({ success: false, error: { code: 'UNAUTHORIZED' } }, 401))
          : Promise.resolve(okEnvelope({ ok: true }))
      }),
    )
    const api = makeApi()
    const res = await baseQueryWithReauth({ url: '/groups' }, api, {})
    expect(res.data).toEqual({ ok: true })
    expect(called.refresh).toBe(1)
    expect(api.dispatch).toHaveBeenCalledWith(
      setCredentials({ accessToken: 'AT2', user: { id: 'u' } }),
    )
  })

  it('two concurrent 401s share ONE refresh (no stampede, no deadlock)', async () => {
    let refreshCount = 0
    const attempts = { a: 0, b: 0 }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((request) => {
        const url = request.url ?? String(request)
        if (url.includes('/auth/refresh')) {
          refreshCount += 1
          // resolve on a macrotask so both concurrent waiters join the
          // same in-flight refresh promise before it settles
          return new Promise((resolve) =>
            setTimeout(() => resolve(okEnvelope({ accessToken: 'AT2' })), 20),
          )
        }
        const key = url.endsWith('/b') ? 'b' : 'a'
        attempts[key] += 1
        return Promise.resolve(
          attempts[key] === 1 ? jsonResponse({}, 401) : okEnvelope(`${key}-ok`),
        )
      }),
    )
    const api = makeApi()
    const [ra, rb] = await Promise.all([
      baseQueryWithReauth({ url: '/a', method: 'POST' }, api, {}),
      baseQueryWithReauth({ url: '/b', method: 'POST' }, api, {}),
    ])
    expect(ra.data).toBe('a-ok')
    expect(rb.data).toBe('b-ok')
    expect(refreshCount).toBe(1)
  })

  it('logout is dispatched when refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ success: false, error: { code: 'UNAUTHORIZED' } }, 401))))
    const api = makeApi()
    const res = await baseQueryWithReauth({ url: '/groups' }, api, {})
    expect(res.error.status).toBe(401)
    expect(api.dispatch).toHaveBeenCalledWith(logout())
  })

  it('does not recursively refresh the refresh call or public auth calls', async () => {
    let refreshCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((request) => {
        const url = request.url ?? String(request)
        if (url.includes('/auth/refresh')) {
          refreshCount += 1
          return Promise.resolve(jsonResponse({ success: false, error: { code: 'UNAUTHORIZED' } }, 401))
        }
        return Promise.resolve(jsonResponse({ success: false, error: { code: 'UNAUTHORIZED' } }, 401))
      }),
    )
    const api = makeApi()
    await baseQueryWithReauth({ url: '/auth/refresh', method: 'POST' }, api, {})
    await baseQueryWithReauth({ url: '/auth/login', method: 'POST', isPublicAuthCall: true }, api, {})
    expect(refreshCount).toBe(1) // only the explicit refresh call itself
  })
})
