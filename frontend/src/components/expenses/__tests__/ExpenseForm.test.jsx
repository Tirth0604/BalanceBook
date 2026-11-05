import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { combineReducers, configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import authReducer from '@/store/authSlice'
import uiReducer from '@/store/uiSlice'
import { ToastProvider } from '@/components/ui/toast'
import ExpenseForm from '../ExpenseForm'

const createExpense = vi.fn(() => ({ unwrap: () => Promise.resolve({ id: 'e9', title: 'Cab', amount: '100.00' }) }))

vi.mock('@/services/endpoints/expensesApi', () => ({
  useCreateExpenseMutation: () => [createExpense, { isLoading: false }],
  useUpdateExpenseMutation: () => [vi.fn(), { isLoading: false }],
  useUploadReceiptMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteReceiptMutation: () => [vi.fn(), { isLoading: false }],
  useMetaCategoriesQuery: () => ({ data: { categories: [{ value: 'food', label: 'Food & Dining' }, { value: 'others', label: 'Others' }] } }),
}))

const group = {
  id: 'g1',
  name: 'Goa trip',
  baseCurrency: 'INR',
  myRole: 'member',
  isArchived: false,
  members: [
    { user: { id: 'u1', name: 'Ava' }, role: 'member', status: 'active' },
    { user: { id: 'u2', name: 'Bea' }, role: 'admin', status: 'active' },
  ],
}

function setup() {
  // Redux 5 (RTK 2.5 pinned) needs a reducer *function*; the legacy
  // `createStore(map, preloadedState)` signature throws before the form ever renders.
  const store = configureStore({
    reducer: combineReducers({ auth: authReducer, ui: uiReducer }),
    preloadedState: {
      auth: { accessToken: 't', user: { id: 'u1', name: 'Ava' }, status: 'authenticated' },
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  })
  const view = render(
    <Provider store={store}>
      <ToastProvider>
        <MemoryRouter>
          <ExpenseForm groupId="g1" group={group} onSaved={vi.fn()} />
        </MemoryRouter>
      </ToastProvider>
    </Provider>,
  )
  return view
}

const submitButton = () => screen.getByRole('button', { name: /Add expense/i })
const amountField = () => screen.getByLabelText(/Amount \(INR\)/i)

/**
 * Radix `Tabs.Trigger` commits its value on mousedown, not on click, so a bare
 * `fireEvent.click` never switches split mode (a real pointer press always sends
 * mousedown first). Drive the sequence a browser sends.
 */
const selectSplitMode = (name) => {
  const tab = screen.getByRole('tab', { name })
  fireEvent.mouseDown(tab, { button: 0 })
  fireEvent.click(tab, { button: 0 })
  return tab
}

/** The split plan is debounced 250 ms (docs/06 §8), so wait until it reconciles. */
const waitForReconciled = async () => {
  await waitFor(() => expect(screen.getByText('ready to save')).toBeInTheDocument())
}

beforeEach(() => {
  createExpense.mockClear()
})

describe('ExpenseForm — submit is locked until the split reconciles', () => {
  it('starts disabled and enables once the title and a reconciling equal split exist', async () => {
    setup()
    expect(submitButton()).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/^Title/i), { target: { value: 'Cab to the beach' } })
    fireEvent.change(amountField(), { target: { value: '100.00' } })

    await waitFor(() => expect(within(screen.getByRole('table')).getAllByText('₹50.00')).toHaveLength(2))
    expect(submitButton()).toBeEnabled()
  })

  it('sends decimal strings and no shares for an equal split', async () => {
    setup()
    fireEvent.change(screen.getByLabelText(/^Title/i), { target: { value: 'Cab' } })
    fireEvent.change(amountField(), { target: { value: '100.00' } })
    // submit stays locked until the DEBOUNCED plan reconciles; clicking before that is a
    // no-op by design, so the equal split must land (2 × ₹50.00) first.
    await waitForReconciled()
    fireEvent.submit(screen.getByRole('button', { name: /Add expense/i }).closest('form'))

    await waitFor(() => expect(createExpense).toHaveBeenCalled())
    const [{ groupId, body }] = createExpense.mock.calls[0]
    expect(groupId).toBe('g1')
    expect(body).toMatchObject({ title: 'Cab', amount: '100.00', currency: 'INR', splitType: 'equal', paidBy: 'u1' })
    expect(body.participants.map((p) => Object.keys(p))).toEqual([['userId'], ['userId']])
  })

  it('locks submit when the exact shares do not sum to the total', async () => {
    setup()
    fireEvent.change(screen.getByLabelText(/^Title/i), { target: { value: 'Dinner' } })
    fireEvent.change(amountField(), { target: { value: '100.00' } })
    await waitForReconciled()
    selectSplitMode(/Exact amounts/i)

    const inputs = await screen.findAllByRole('textbox', { name: /Exact share for/i })
    fireEvent.change(inputs[0], { target: { value: '60.00' } })
    fireEvent.change(inputs[1], { target: { value: '39.90' } })

    // the blocker is surfaced twice (row error list + footer badge), so assert presence not uniqueness
    await waitFor(() => expect(screen.getAllByText(/0\.10 still unassigned/i).length).toBeGreaterThan(0))
    expect(submitButton()).toBeDisabled()

    fireEvent.change(inputs[1], { target: { value: '40.00' } })
    await waitFor(() => expect(screen.queryByText('split not reconciled')).toBeNull())
    expect(submitButton()).toBeEnabled()
  })

  it('shows the remainder paisa on an indivisible equal split', async () => {
    setup()
    fireEvent.change(amountField(), { target: { value: '100.01' } })
    // 10001 paisa across two members → 5001 + 5000, one person carries the extra paisa
    await waitFor(() => expect(screen.getByText('₹50.01')).toBeInTheDocument())
    expect(screen.getByText('₹50.00')).toBeInTheDocument()
    expect(screen.getAllByText(/remainder/i).length).toBeGreaterThan(0)
  })

  it('requires percentages to total exactly 100.00', async () => {
    setup()
    fireEvent.change(screen.getByLabelText(/^Title/i), { target: { value: 'Stay' } })
    fireEvent.change(amountField(), { target: { value: '100.00' } })
    await waitForReconciled()
    selectSplitMode(/Percentage/i)

    const inputs = await screen.findAllByRole('textbox', { name: /Percentage for/i })
    fireEvent.change(inputs[0], { target: { value: '40' } })
    fireEvent.change(inputs[1], { target: { value: '50' } })

    await waitFor(() =>
      expect(screen.getAllByText(/currently 90\.00%|Percentages must total 100\.00/i).length).toBeGreaterThan(0),
    )
    expect(submitButton()).toBeDisabled()

    fireEvent.change(inputs[1], { target: { value: '60' } })
    await waitFor(() => expect(submitButton()).toBeEnabled())
  })
})
