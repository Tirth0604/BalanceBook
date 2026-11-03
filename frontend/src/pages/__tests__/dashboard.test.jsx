import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { combineReducers, configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import authReducer from '@/store/authSlice'
import uiReducer from '@/store/uiSlice'
import { formatCompact } from '@/lib/money'
import { ToastProvider } from '@/components/ui/toast'
import Dashboard from '../Dashboard'

/* ---- real-shaped RTK Query mocks (no msw, no backend) ---------------------- */
const REFETCH = vi.fn()

vi.mock('@/services/endpoints/balancesApi', () => ({
  useGetMySummaryQuery: () => ({
    data: {
      totalOwedMinor: 1250000,
      totalOwedToMeMinor: 400000,
      netMinor: -850000,
      currency: 'INR',
      groupCount: 3,
      pendingSettlements: 1,
    },
    isLoading: false,
    isError: false,
    refetch: REFETCH,
  }),
}))

vi.mock('@/services/endpoints/analyticsApi', () => ({
  useOverviewQuery: () => ({
    data: {
      totalSpentMinor: 3000000,
      expenseCount: 4,
      currency: 'INR',
      monthlySeries: [
        { label: 'Oct', totalMinor: 2100000 },
        { label: 'Nov', totalMinor: 900000 },
      ],
      categories: [
        { name: 'Food', totalMinor: 1800000 },
        { name: 'Stay', totalMinor: 1200000 },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: REFETCH,
  }),
}))

const group = {
  id: 'g1',
  name: 'Goa Trip',
  baseCurrency: 'INR',
  category: 'trip',
  memberCount: 4,
  members: [{ user: { id: 'u1', name: 'Aarav Mehta' } }],
  totals: { expenseMinor: 9000000, settlementMinor: 4000000, netMinor: -850000 },
  createdAt: '2026-10-01T00:00:00.000Z',
}

vi.mock('@/services/endpoints/groupsApi', () => ({
  useListGroupsQuery: () => ({
    data: { items: [group], meta: { page: 1, limit: 4, total: 1, totalPages: 1 } },
    isLoading: false,
    isError: false,
    refetch: REFETCH,
  }),
}))

vi.mock('@/services/endpoints/expensesApi', () => ({
  useListExpensesQuery: () => ({
    data: {
      items: [
        {
          id: 'e1',
          title: 'Beach shack dinner',
          totalMinor: 420000,
          currency: 'INR',
          group: { id: 'g1', name: 'Goa Trip' },
          paidBy: { id: 'u1', name: 'Aarav Mehta' },
          expenseDate: '2026-11-10',
          createdAt: '2026-11-10T09:00:00.000Z',
        },
      ],
      meta: { page: 1, limit: 5, total: 1, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
    refetch: REFETCH,
  }),
}))

vi.mock('@/services/endpoints/settlementsApi', () => ({
  useListMySettlementsQuery: () => ({
    data: {
      items: [
        {
          id: 's1',
          payer: { name: 'Ravi' },
          receiver: { name: 'You' },
          amountMinor: 1250000,
          currency: 'INR',
          paymentMethod: 'upi',
          initiatedAt: '2026-11-09T00:00:00.000Z',
          status: 'awaiting_confirmation',
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: REFETCH,
  }),
}))

function renderDashboard() {
  const store = configureStore({ reducer: combineReducers({ auth: authReducer, ui: uiReducer }) })
  return render(
    <Provider store={store}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Dashboard />
        </MemoryRouter>
      </ToastProvider>
    </Provider>,
  )
}

describe('<Dashboard /> with mocked RTK Query', () => {
  it('renders KPI labels and server-shaped amounts', () => {
    renderDashboard()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('You owe')).toBeInTheDocument()
    expect(screen.getByText('Owed to you')).toBeInTheDocument()
    expect(screen.getByText('Net position')).toBeInTheDocument()
    // formatted with the shared money primitives — real formatting, real shape
    expect(screen.getAllByText('₹12,500.00').length).toBeGreaterThan(0) // pending settlement row
    expect(screen.getByText('₹4,200.00')).toBeInTheDocument() // recent expense
    expect(screen.getByText(/Beach shack dinner/)).toBeInTheDocument()
    expect(screen.getByText('Goa Trip')).toBeInTheDocument()
  })

  it('renders the settlement + activity sections and range control', () => {
    renderDashboard()
    expect(screen.getByText('Recent activity')).toBeInTheDocument()
    expect(screen.getByText('Pending settlements')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /30 days/ })).toBeInTheDocument()
  })

  it('maps each summary field to its KPI tile with correct sign semantics', () => {
    renderDashboard()
    // netMinor < 0 → payable side; every amount rendered through lib/money.
    const tileFor = (label) => screen.getByText(label).closest('div').parentElement
    expect(tileFor('You owe')).toHaveTextContent(formatCompact(1250000, 'INR'))
    expect(tileFor('Owed to you')).toHaveTextContent(formatCompact(400000, 'INR'))
    expect(tileFor('Net position')).toHaveTextContent(formatCompact(-850000, 'INR'))
    expect(tileFor('Spent in range')).toHaveTextContent(formatCompact(3000000, 'INR'))
  })

  it('charts mount with data (canvas/svg present, no crash)', () => {
    const { container } = renderDashboard()
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(2) // donut + bars + icons
    expect(screen.getByText('Where it went')).toBeInTheDocument()
    expect(screen.getByText('Monthly spend')).toBeInTheDocument()
  })
})
