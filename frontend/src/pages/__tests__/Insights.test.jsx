import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Insights from '../Insights'

/*
 * Fixtures are the verbatim bodies of GET /api/v1/groups/:id/insights (USD group "Squad
 * Lunches") and GET /api/v1/insights, captured from the running API. The query hooks are
 * mocked at the endpoint boundary because jsdom cannot build the Request fetchBaseQuery
 * constructs — see the Balances suite for the same harness.
 */
const usdGroupPayload = {
  scope: {
    groupId: 'g-usd',
    groupName: 'Squad Lunches',
    mode: 'group',
    groupCount: 1,
    currency: 'USD',
    currencies: ['USD'],
  },
  window: { preset: 'all', from: null, to: null },
  count: 3,
  generatedAt: '2026-11-05T14:01:41.809Z',
  insights: [
    {
      id: 'contribution_share:me',
      type: 'contribution_share',
      severity: 'info',
      title: 'Tirth Gandhi fund 0% of this group',
      body: '$0.00 paid out vs $30.32 consumed, so the net position is $30.32 you still owe.',
      metric: { paidMinor: 0, consumedMinor: 3032, netMinor: -3032, fundedPercent: 0, spentMinor: 40372 },
      window: { preset: 'all', from: null, to: null },
    },
    {
      id: 'top_category:travel',
      type: 'top_category',
      severity: 'info',
      title: 'Travel is your biggest line',
      body: '$287.43 — 71.2% of everything recorded in this window, across 1 expense.',
      metric: { category: 'travel', totalMinor: 28743, percentOfSpend: 71.2, expenseCount: 1 },
      window: { preset: 'all', from: null, to: null },
    },
    {
      id: 'settlement_pending:count',
      type: 'settlement_pending',
      severity: 'info',
      title: '1 settlement waiting on someone',
      body: '$72.84 is proposed but not confirmed yet.',
      metric: { count: 1, amountMinor: 7284 },
      window: { preset: 'all', from: null, to: null },
    },
  ],
}

const personalPayload = {
  scope: {
    groupId: null,
    groupName: null,
    mode: 'me',
    groupCount: 4,
    currency: 'INR',
    currencies: ['INR', 'USD'],
  },
  window: { preset: 'all', from: null, to: null },
  count: 1,
  generatedAt: '2026-11-05T14:01:41.909Z',
  insights: [
    {
      id: 'debt_aging:u2',
      type: 'debt_aging',
      severity: 'warning',
      title: '₹33,707.17 is still unsettled',
      body: 'You last shared an expense 30 days ago and still owe ₹21,833.79 overall.',
      metric: { userId: 'u2', owesMinor: 2183379, outstandingMinor: 3370717, ageDays: 30, debtorCount: 2 },
      window: { preset: 'all', from: null, to: null },
    },
  ],
}

const group = {
  id: 'g-usd',
  name: 'Squad Lunches',
  baseCurrency: 'USD',
  myRole: 'member',
  memberCount: 4,
  members: [],
}

const calls = { group: [], mine: [] }

vi.mock('@/services/endpoints/groupsApi', () => ({
  useListGroupsQuery: () => ({ data: { items: [group] }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useGetGroupQuery: (groupId, options = {}) => ({
    data: groupId ? group : null,
    isLoading: false,
    isError: false,
    error: null,
    skip: options?.skip,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/services/endpoints/insightsApi', () => ({
  useGetInsightsQuery: (groupId, options = {}) => {
    calls.group.push({ groupId, skip: options?.skip })
    return { data: usdGroupPayload, isLoading: false, isError: false, error: null, refetch: vi.fn() }
  },
  useGetMyInsightsQuery: (_arg, options = {}) => {
    calls.mine.push({ skip: options?.skip })
    return { data: personalPayload, isLoading: false, isError: false, error: null, refetch: vi.fn() }
  },
}))

vi.mock('@/components/insights/RecurrenceList', () => ({ default: () => <div data-testid="recurrence" /> }))
vi.mock('@/components/budgets/BudgetProgress', () => ({ default: () => <div data-testid="budgets" /> }))

function renderPage(route) {
  calls.group = []
  calls.mine = []
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Insights />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  calls.group = []
  calls.mine = []
})

afterEach(cleanup)

describe('Insights page — one group scope', () => {
  it('renders each card’s metric chip from metric, in the group’s own currency', () => {
    const { container } = renderPage('/insights?groupId=g-usd')
    const text = container.textContent

    // The chips the payload pays for: 0 / 3032 / -3032 paise-cents and the percentages.
    expect(text).toContain('$0.00')
    expect(text).toContain('$30.32')
    expect(text).toContain('$287.43')
    expect(text).toContain('71.2%')
    expect(text).toContain('$72.84')
    expect(text).toContain('contribution share')
    expect(text).toContain('top category')
    // Defect 2: scope.currency is USD, so nothing on the page may fall back to the rupee.
    expect(text).not.toContain('₹')
  })

  it('asks the group endpoint and skips the personal one', () => {
    renderPage('/insights?groupId=g-usd')
    expect(calls.group.at(-1)).toEqual({ groupId: 'g-usd', skip: false })
    expect(calls.mine.at(-1).skip).toBe(true)
  })

  it('keeps the group panels in the group scope', () => {
    renderPage('/insights?groupId=g-usd')
    expect(screen.getByTestId('recurrence')).toBeInTheDocument()
    expect(screen.getByTestId('budgets')).toBeInTheDocument()
  })
})

describe('Insights page — account scope (GET /insights)', () => {
  it('reads the personal endpoint and prints its cited numbers', () => {
    const { container } = renderPage('/insights?scope=me')
    expect(calls.mine.at(-1)).toEqual({ skip: false })
    expect(calls.group.at(-1).skip).toBe(true)
    expect(container.textContent).toContain('₹21,833.79')
    expect(container.textContent).toContain('₹33,707.17')
    expect(container.textContent).toContain('30')
    expect(container.textContent).toContain('debt aging')
    // The account scope has no group panels to pretend to manage.
    expect(screen.queryByTestId('recurrence')).not.toBeInTheDocument()
  })

  it('the scope toggle switches the live query without a page change', async () => {
    renderPage('/insights?groupId=g-usd&scope=group')
    expect(screen.getByText('$287.43')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('tab', { name: /my whole account/i }))
    fireEvent.click(screen.getByRole('tab', { name: /my whole account/i }))

    await waitFor(() => expect(calls.mine.at(-1)).toEqual({ skip: false }))
    expect(await screen.findByText('₹33,707.17')).toBeInTheDocument()
    expect(screen.queryByText('$287.43')).not.toBeInTheDocument()
  })
})
