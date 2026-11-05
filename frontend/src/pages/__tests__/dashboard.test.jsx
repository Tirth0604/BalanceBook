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

/**
 * Shape copied from `GET /analytics/overview` (backend analyticsService.overview):
 * every flat number is the reporting-currency slice under `totals`, the donut lives on
 * `GET /analytics/categories`, and the bar series is `monthlySeries[].period`.
 * Mutable holder so a single test can swap in a mixed-currency scope.
 */
const overviewHolder = {
  data: {
    scope: {
      groupCount: 3,
      currency: 'INR',
      reportingCurrency: 'INR',
      currencies: ['INR'],
      mixedCurrency: false,
      window: { preset: '30d', from: '2026-10-03T00:00:00.000Z', to: '2026-11-02T00:00:00.000Z' },
    },
    totals: {
      currency: 'INR',
      spentMinor: 3000000,
      spent: '30000.00',
      expenseCount: 4,
      byCurrency: [{ currency: 'INR', totalMinor: 3000000, expenseCount: 4 }],
    },
    you: { currency: 'INR', paidMinor: 2100000, consumedMinor: 1800000, netMinor: 300000, fundedPercent: 70 },
    monthlySeries: [
      { period: '2026-10', totalMinor: 2100000, expenseCount: 3 },
      { period: '2026-11', totalMinor: 900000, expenseCount: 1 },
    ],
  },
}

/** Shape of `GET /analytics/categories` — the reporting-currency rows only. */
const categoriesHolder = {
  data: {
    currency: 'INR',
    totalMinor: 3000000,
    expenseCount: 4,
    categories: [
      { category: 'food', label: 'Food', totalMinor: 1800000, percentOfSpend: 60 },
      { category: 'stay', label: 'Stay', totalMinor: 1200000, percentOfSpend: 40 },
    ],
  },
}

vi.mock('@/services/endpoints/analyticsApi', () => ({
  useOverviewQuery: () => ({
    data: overviewHolder.data,
    isLoading: false,
    isError: false,
    refetch: REFETCH,
  }),
  useCategoriesQuery: () => ({
    data: categoriesHolder.data,
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

  it('shows the viewer-currency slice, never a cross-currency sum, when the scope is mixed', () => {
    const plain = overviewHolder.data
    overviewHolder.data = {
      ...plain,
      scope: { ...plain.scope, currency: 'INR', currencies: ['INR', 'USD'], mixedCurrency: true },
      totals: {
        ...plain.totals,
        spentMinor: 3000000,
        byCurrency: [
          { currency: 'INR', totalMinor: 3000000, expenseCount: 4 },
          { currency: 'USD', totalMinor: 500000, expenseCount: 2 },
        ],
      },
    }
    try {
      renderDashboard()
      // paise and cents are different units: the tile is the INR row, not 3,000,000 + 500,000.
      const tileFor = (label) => screen.getByText(label).closest('div').parentElement
      expect(tileFor('Spent in range')).toHaveTextContent(formatCompact(3000000, 'INR'))
      expect(screen.queryByText(formatCompact(3500000, 'INR'))).not.toBeInTheDocument()
      expect(tileFor('Spent in range')).toHaveTextContent('INR groups')
    } finally {
      overviewHolder.data = plain
    }
  })
})
