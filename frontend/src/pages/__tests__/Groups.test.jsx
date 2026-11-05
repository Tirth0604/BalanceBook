import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Provider } from 'react-redux'
import { createAppStore } from '@/store/index'
import { ToastProvider } from '@/components/ui/toast'
import Groups from '../Groups'

/**
 * Regression guard for the address-bar pollution: a clean visit to /groups used to gain
 * `?q=` (and `?search=`) a few hundred ms after mount, because the debounced search input
 * emitted its first no-op callback under React StrictMode's double effect run.
 */
const seen = []

function Probe() {
  const location = useLocation()
  seen.push(location.search)
  return null
}

function renderGroups(route = '/groups') {
  // Groups' sync guard reads window.location (the page must still be the group list before
  // it writes params), so mirror the MemoryRouter route into the jsdom URL too.
  window.history.replaceState({}, '', route)
  const store = createAppStore({
    auth: { accessToken: 'token', user: { id: 'me', name: 'Me', preferredCurrency: 'INR' }, status: 'authenticated' },
  })
  const view = render(
    <StrictMode>
      <Provider store={store}>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route
                path="/groups"
                element={
                  <>
                    <Groups />
                    <Probe />
                  </>
                }
              />
              <Route path="/groups/:groupId" element={<div>group detail</div>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </Provider>
    </StrictMode>,
  )
  return { store, ...view }
}

/** the debounce window is 300 ms, so anything past ~600 ms is "settled" */
const settle = () => new Promise((resolve) => setTimeout(resolve, 600))

beforeEach(() => {
  seen.length = 0
  // jsdom cannot build the Request fetchBaseQuery constructs, so the ledger never resolves;
  // the URL-sync behaviour under test is independent of the list response.
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Groups URL sync', () => {
  it('leaves a clean /groups untouched, even after the debounce window', async () => {
    renderGroups()
    await waitFor(() => expect(screen.getByRole('searchbox', { name: /Search groups by name/i })).toBeInTheDocument())
    await settle()
    expect(seen.every((search) => search === '')).toBe(true)
    expect(seen[seen.length - 1]).toBe('')
  })

  it('writes ?q=<term> while typing and keeps ?create=1 alive', async () => {
    renderGroups('/groups?create=1')
    // ?create=1 opens a modal dialog, which hides the rest of the tree from getByRole,
    // so reach the input by its label instead.
    const box = await screen.findByLabelText(/Search groups by name/i)
    fireEvent.change(box, { target: { value: 'goa' } })
    await settle()
    const last = seen[seen.length - 1]
    expect(last).toContain('q=goa')
    expect(last).toContain('create=1')
  })

  it('drops the parameter entirely when the box is cleared', async () => {
    renderGroups()
    const box = await screen.findByRole('searchbox', { name: /Search groups by name/i })
    fireEvent.change(box, { target: { value: 'goa' } })
    await settle()
    expect(seen[seen.length - 1]).toContain('q=goa')

    fireEvent.click(screen.getByRole('button', { name: /Clear search/i }))
    await waitFor(() => expect(seen[seen.length - 1]).toBe(''))
  })
})
