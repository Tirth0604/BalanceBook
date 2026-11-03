import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

/* ---- mock the auth layer; no RTK store, no backend ---------------------- */
const mockAuth = {
  login: vi.fn(),
  isAuthenticated: false,
  status: 'anonymous',
}

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}))

import Login from '../Login'

function renderLogin(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <div>
              dashboard reached
            </div>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

function fillAndSubmit(email = 'priya@example.com', password = 'hunter2pass') {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

describe('Login page', () => {
  beforeEach(() => {
    mockAuth.login.mockReset()
    mockAuth.isAuthenticated = false
    mockAuth.status = 'anonymous'
  })

  it('signs in and lands on the dashboard', async () => {
    mockAuth.login.mockResolvedValue({ user: { id: 'u1' }, accessToken: 'tok' })
    renderLogin()
    fillAndSubmit()

    await waitFor(() => expect(mockAuth.login).toHaveBeenCalledTimes(1))
    expect(mockAuth.login).toHaveBeenCalledWith({ email: 'priya@example.com', password: 'hunter2pass' })
    expect(await screen.findByText('dashboard reached')).toBeInTheDocument()
  })

  it('blocks submission and shows inline errors for empty fields', () => {
    renderLogin()
    fillAndSubmit('', '')
    expect(mockAuth.login).not.toHaveBeenCalled()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
  })

  it('maps a server UNAUTHORIZED error into human copy', async () => {
    mockAuth.login.mockRejectedValue({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid credentials',
    })
    renderLogin()
    fillAndSubmit('priya@example.com', 'wrong-password')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid credentials')
    // form stays usable, no dead button
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled()
  })

  it('falls back to code copy when the server message is technical', async () => {
    mockAuth.login.mockRejectedValue({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'E11000 duplicate key error',
    })
    renderLogin()
    fillAndSubmit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong on our side')
    expect(alert.textContent).not.toContain('E11000')
  })

  it('preserves the intended destination after a protected-route redirect', async () => {
    mockAuth.login.mockResolvedValue({ user: {}, accessToken: 'tok' })
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/groups' } }]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/groups" element={<div>groups reached</div>} />
        </Routes>
      </MemoryRouter>,
    )
    fillAndSubmit()
    expect(await screen.findByText('groups reached')).toBeInTheDocument()
  })
})
