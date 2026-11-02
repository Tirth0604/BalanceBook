import { describe, expect, it } from 'vitest'
import reducer, {
  beginBootstrap,
  hydrate,
  logout,
  markAnonymous,
  setCredentials,
  setUser,
} from '../authSlice'

const initial = reducer(undefined, { type: '@@INIT' })

describe('authSlice', () => {
  it('starts unknown with no token in state', () => {
    expect(initial).toEqual({ accessToken: null, user: null, status: 'unknown' })
  })

  it('setCredentials authenticates and stores the memory token', () => {
    const next = reducer(initial, setCredentials({ accessToken: 'abc', user: { id: '1' } }))
    expect(next.status).toBe('authenticated')
    expect(next.accessToken).toBe('abc')
    expect(next.user.id).toBe('1')
  })

  it('setCredentials can update just the token (rotation)', () => {
    const seeded = reducer(initial, setCredentials({ accessToken: 'a', user: { id: '1' } }))
    const next = reducer(seeded, setCredentials({ accessToken: 'b' }))
    expect(next.accessToken).toBe('b')
    expect(next.user).toEqual({ id: '1' })
  })

  it('hydrate with a payload authenticates; without it goes anonymous', () => {
    expect(reducer(initial, hydrate({ accessToken: 't', user: { id: '9' } })).status).toBe('authenticated')
    expect(reducer(initial, hydrate(undefined)).status).toBe('anonymous')
  })

  it('logout wipes everything', () => {
    const seeded = reducer(initial, setCredentials({ accessToken: 'a', user: { id: '1' } }))
    const next = reducer(seeded, logout())
    expect(next).toEqual({ accessToken: null, user: null, status: 'anonymous' })
  })

  it('beginBootstrap only moves unknown → loading', () => {
    expect(reducer(initial, beginBootstrap()).status).toBe('loading')
    const anon = reducer(initial, markAnonymous())
    expect(reducer(anon, beginBootstrap()).status).toBe('anonymous')
  })

  it('setUser updates the profile without touching the token', () => {
    const seeded = reducer(initial, setCredentials({ accessToken: 'keep', user: { id: '1' } }))
    const next = reducer(seeded, setUser({ id: '1', name: 'New' }))
    expect(next.user.name).toBe('New')
    expect(next.accessToken).toBe('keep')
  })
})
