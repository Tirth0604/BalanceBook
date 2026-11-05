import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { combineReducers, configureStore } from '@reduxjs/toolkit'
import authReducer from '@/store/authSlice'
import uiReducer from '@/store/uiSlice'
import { ToastProvider } from '@/components/ui/toast'
import Expenses from '../Expenses'

/** Capture every arg the page hands to RTK Query so the filter → query mapping is provable. */
const calls = []

vi.mock('@/services/endpoints/expensesApi', () => ({
  useListExpensesQuery: (args) => {
    calls.push(args)
    return {
      data: {
        items: [
          {
            id: 'e1',
            title: 'Beach shack dinner',
            category: 'food',
            totalMinor: 300000,
            currency: 'INR',
            expenseDate: '2026-11-01',
            group: { id: 'g1', name: 'Goa trip', baseCurrency: 'INR' },
            paidBy: { id: 'u1', name: 'Ava' },
            participants: [{ user: { id: 'u1', name: 'Ava' }, shareMinor: 150000, isPayer: true }],
          },
        ],
        meta: { page: 1, limit: 20, total: 60, totalPages: 3 },
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
  },
  useMetaCategoriesQuery: () => ({ data: { categories: [{ value: 'food', label: 'Food & Dining' }] } }),
  useGetExpenseQuery: () => ({ data: null }),
  // the page mounts ExpenseDetailDrawer (and its audit timeline) even while closed
  useDeleteExpenseMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), { isLoading: false }],
  useGetExpenseAuditQuery: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}))

vi.mock('@/services/endpoints/groupsApi', () => ({
  useListGroupsQuery: () => ({ data: { items: [{ id: 'g1', name: 'Goa trip', baseCurrency: 'INR' }], meta: {} } }),
  useGetGroupQuery: () => ({ data: { id: 'g1', name: 'Goa trip', baseCurrency: 'INR', members: [{ user: { id: 'u1', name: 'Ava' }, role: 'admin', status: 'active' }] } }),
}))

function renderPage(route = '/expenses') {
  // Redux 5 (RTK 2.5 pinned) rejects the legacy `createStore(map, preloadedState)` form,
  // so build the store the way the app does: a combined reducer + preloaded state.
  const store = configureStore({
    reducer: combineReducers({ auth: authReducer, ui: uiReducer }),
    preloadedState: {
      auth: { accessToken: 't', user: { id: 'u1', name: 'Ava' }, status: 'authenticated' },
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  })
  return render(
    <Provider store={store}>
      {/* the page mounts ExpenseDetailDrawer, which reads useToast */}
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>
          <Expenses />
        </MemoryRouter>
      </ToastProvider>
    </Provider>,
  )
}

const lastArgs = () => calls[calls.length - 1]

beforeEach(() => {
  calls.length = 0
})

describe('Expenses page — filters are query args, not client-side filtering', () => {
  it('asks the server for page 1, newest first, by default', () => {
    renderPage()
    expect(lastArgs()).toMatchObject({ page: 1, limit: 20, sort: '-expenseDate' })
    expect(lastArgs().search).toBeUndefined()
    expect(lastArgs().groupId).toBeUndefined()
  })

  it('sends the title search once the debounce settles', async () => {
    renderPage()
    fireEvent.change(screen.getByRole('searchbox', { name: /Search expenses by title/i }), { target: { value: 'taxi' } })
    await waitFor(() => expect(lastArgs().search).toBe('taxi'), { timeout: 1500 })
  })

  it('maps the date window and amount range onto from/to/minAmount/maxAmount', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('From', { selector: '#flt-from' }), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('To', { selector: '#flt-to' }), { target: { value: '2026-10-31' } })
    fireEvent.change(screen.getByLabelText('Minimum amount', { selector: '#flt-min' }), { target: { value: '100.00' } })
    fireEvent.change(screen.getByLabelText('Maximum amount', { selector: '#flt-max' }), { target: { value: '900.00' } })

    expect(lastArgs()).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-31',
      minAmount: '100.00',
      maxAmount: '900.00',
    })
  })

  it('paginates with the filters intact and resets to page 1 on reset', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('From', { selector: '#flt-from' }), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))
    expect(lastArgs()).toMatchObject({ page: 2, from: '2026-09-01' })

    fireEvent.click(screen.getByRole('button', { name: /Reset all/i }))
    expect(lastArgs()).toMatchObject({ page: 1 })
    expect(lastArgs().from).toBeUndefined()
  })

  it('scopes everything to a group when the URL says so', () => {
    renderPage('/expenses?groupId=g1')
    expect(lastArgs().groupId).toBe('g1')
    expect(screen.getByText(/60 expenses match these filters/i)).toBeInTheDocument()
  })
})
