import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

/* Controllable auth state — no store boot required by the gates themselves. */
const authState = { auth: { status: 'anonymous', accessToken: null, user: null } }

vi.mock('@/store/hooks', () => ({
  useAppSelector: (selector) => selector(authState),
  useAppDispatch: () => () => {},
}))

import RequireAuth, { RedirectIfAuthed } from '@/components/layout/RequireAuth'

function LocationProbe() {
  const location = useLocation()
  return <div>login reached from={location.state?.from ?? 'none'}</div>
}

describe('ProtectedRoute (RequireAuth)', () => {
  it('redirects anonymous users to /login and preserves the intended destination', () => {
    authState.auth = { status: 'anonymous', accessToken: null, user: null }
    render(
      <MemoryRouter initialEntries={['/groups/g42?tab=balances']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/groups/:groupId" element={<div>secret group</div>} />
          </Route>
          <Route path="/login" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('login reached from=/groups/g42?tab=balances')).toBeInTheDocument()
    expect(screen.queryByText('secret group')).not.toBeInTheDocument()
  })

  it('renders the protected outlet for authenticated users', () => {
    authState.auth = { status: 'authenticated', accessToken: 'tok', user: { id: 'u1' } }
    render(
      <MemoryRouter initialEntries={['/groups/g42']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/groups/:groupId" element={<div>secret group</div>} />
          </Route>
          <Route path="/login" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('secret group')).toBeInTheDocument()
  })

  it('shows a restoring-session state while bootstrap is pending', () => {
    authState.auth = { status: 'unknown', accessToken: null, user: null }
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<div>dash</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('status', { name: /restoring your session/i })).toBeInTheDocument()
  })
})

describe('PublicOnlyRoute (RedirectIfAuthed)', () => {
  it('bounces authenticated users away from /login to /dashboard', () => {
    authState.auth = { status: 'authenticated', accessToken: 'tok', user: { id: 'u1' } }
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route element={<RedirectIfAuthed />}>
            <Route path="/login" element={<div>login form</div>} />
          </Route>
          <Route path="/dashboard" element={<div>dash</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('dash')).toBeInTheDocument()
  })

  it('lets anonymous users through to public pages', () => {
    authState.auth = { status: 'anonymous', accessToken: null, user: null }
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route element={<RedirectIfAuthed />}>
            <Route path="/login" element={<div>login form</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('login form')).toBeInTheDocument()
  })
})
