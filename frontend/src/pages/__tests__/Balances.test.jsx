import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { combineReducers, configureStore } from '@reduxjs/toolkit'
import authReducer from '@/store/authSlice'
import uiReducer from '@/store/uiSlice'
import { ToastProvider } from '@/components/ui/toast'
import Balances from '../Balances'

/*
 * The RTK Query hooks are mocked at the endpoint boundary: jsdom cannot build the
 * `Request` that fetchBaseQuery constructs (undici rejects its AbortSignal), so a stubbed
 * `fetch` leaves every query stuck in `pending` and the page never leaves its skeleton.
 * The payloads below are the real DTO shapes from docs/03 — `data: [Balance]` plus
 * `meta: { groupTotalMinor, isSettledUp }` — which is what baseQuery hands the page.
 */
const GROUPS_PAYLOAD = {
  items: [
    { id: 'g1', name: 'Goa trip', baseCurrency: 'INR', memberCount: 3, myRole: 'member' },
    { id: 'g2', name: 'Flat 402', baseCurrency: 'INR', memberCount: 2, myRole: 'admin' },
  ],
  meta: { page: 1, limit: 50, total: 2, totalPages: 1 },
}

const outstandingRows = [
  {
    user: { id: 'u1', name: 'Ava' },
    displayName: 'Ava',
    netMinor: 120000,
    currency: 'INR',
    owedToMeMinor: 120000,
    iOweMinor: 0,
    status: 'creditor',
    isMe: false,
  },
  {
    user: { id: 'me', name: 'Me' },
    displayName: 'Me',
    netMinor: -70000,
    currency: 'INR',
    owedToMeMinor: 0,
    iOweMinor: 70000,
    status: 'debtor',
    isMe: true,
  },
  {
    user: { id: 'u3', name: 'Cai' },
    displayName: 'Cai',
    netMinor: -50000,
    currency: 'INR',
    owedToMeMinor: 0,
    iOweMinor: 50000,
    status: 'debtor',
    isMe: false,
  },
]

const outstanding = {
  items: outstandingRows,
  meta: { groupTotalMinor: 300000, isSettledUp: false, currency: 'INR' },
}

const settled = {
  items: outstandingRows.map((row) => ({ ...row, netMinor: 0, iOweMinor: 0, owedToMeMinor: 0, status: 'settled' })),
  meta: { groupTotalMinor: 300000, isSettledUp: true, currency: 'INR' },
}

const balancesHolder = { data: outstanding, groupId: null, calls: [] }

vi.mock('@/services/endpoints/groupsApi', () => ({
  useListGroupsQuery: () => ({ data: GROUPS_PAYLOAD, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}))

vi.mock('@/services/endpoints/balancesApi', () => ({
  useGetGroupBalancesQuery: (groupId, options = {}) => {
    balancesHolder.groupId = groupId
    balancesHolder.calls.push({ groupId, skip: options?.skip })
    return {
      data: balancesHolder.data,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
  },
  useGetMySummaryQuery: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
}))

function renderPage(balances, route = '/balances?groupId=g1') {
  balancesHolder.data = balances
  balancesHolder.calls = []
  // the query hooks above are mocked, so the API slices are not needed in the store
  const store = configureStore({
    reducer: combineReducers({ auth: authReducer, ui: uiReducer }),
    preloadedState: {
      auth: { accessToken: 'token', user: { id: 'me', name: 'Me', preferredCurrency: 'INR' }, status: 'authenticated' },
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  })

  return {
    store,
    balancesCalls: balancesHolder.calls,
    ...render(
      <Provider store={store}>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>
            <Balances />
          </MemoryRouter>
        </ToastProvider>
      </Provider>,
    ),
  }
}

beforeEach(() => {
  balancesHolder.data = outstanding
  balancesHolder.calls = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Balances page — renders the server-derived ledger, never recomputes it', () => {
  it('labels each member with words plus the exact paisa', () => {
    renderPage(outstanding)
    const table = screen.getByRole('table')
    const avaRow = within(table).getByRole('row', { name: /Ava/i })
    // anchored: the header row's accessible name starts with "Member", which /Me/i would hit
    const myRow = within(table).getByRole('row', { name: /^Me\b/i })

    expect(avaRow).toHaveTextContent('is owed')
    expect(avaRow).toHaveTextContent('₹1,200.00')
    expect(myRow).toHaveTextContent('you owe')
    expect(myRow).toHaveTextContent('₹700.00')
    expect(within(table).getByRole('row', { name: /Cai/i })).toHaveTextContent('₹500.00')
  })

  it('surfaces the viewer position, group total and the open-position counts', () => {
    renderPage(outstanding)
    expect(screen.getByText('Your position')).toBeInTheDocument()
    expect(screen.getByText(/Owed by 2 members/i)).toBeInTheDocument()
    expect(screen.getByText(/Owed to 1 member/i)).toBeInTheDocument()
    expect(screen.getAllByText('₹3,000.00').length).toBeGreaterThan(0)
  })

  it('shows the explicit settled-up state straight from meta.isSettledUp', () => {
    renderPage(settled)
    // the banner (table) and the KPI card both announce it, so assert the message not one node
    expect(screen.getAllByRole('status').some((node) => /settled up/i.test(node.textContent))).toBe(true)
    expect(screen.getAllByText('settled').length).toBe(3)
  })

  it('asks for a group before showing any money', async () => {
    renderPage(outstanding, '/balances')
    expect(screen.getByText(/No group selected/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // the ledger is only read once a group is selected
    await waitFor(() => expect(balancesHolder.calls.at(-1)?.skip).toBe(true))
  })
})
