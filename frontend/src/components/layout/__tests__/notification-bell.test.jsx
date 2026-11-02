import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const bellState = { unread: 7, items: [] }

vi.mock('@/services/endpoints/notificationsApi', () => ({
  useUnreadCountQuery: () => ({ data: bellState.unread }),
  useListNotificationsQuery: () => ({ data: { items: bellState.items } }),
  useMarkAllReadMutation: () => [vi.fn()],
}))

import NotificationBell from '@/components/layout/NotificationBell'

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  )
}

describe('NotificationBell unread badge', () => {
  it('shows the real unread count and announces it accessibly', () => {
    bellState.unread = 7
    renderBell()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications, 7 unread' })).toBeInTheDocument()
  })

  it('caps large counts at 9+ to keep the topbar quiet', () => {
    bellState.unread = 12
    renderBell()
    expect(screen.getByText('9+')).toBeInTheDocument()
  })

  it('renders no badge when everything is read', () => {
    bellState.unread = 0
    const { container } = renderBell()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\d/)
  })
})
