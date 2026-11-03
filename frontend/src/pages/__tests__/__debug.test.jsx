import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { createAppStore } from '@/store/index'
import groupsApi from '@/services/endpoints/groupsApi'
import balancesApi from '@/services/endpoints/balancesApi'
import { ToastProvider } from '@/components/ui/toast'
import Balances from '../Balances'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{"success":true,"data":[]}', { status: 200 }))))
})

describe('debug', () => {
  it('state after upsert', async () => {
    const store = createAppStore({
      auth: { accessToken: 'token', user: { id: 'me', name: 'Me', preferredCurrency: 'INR' }, status: 'authenticated' },
    })
    store.dispatch(groupsApi.util.upsertQueryData('listGroups', { archived: 'false', limit: 50 }, { items: [{ id: 'g1', name: 'Goa trip', baseCurrency: 'INR' }], meta: {} }))
    store.dispatch(balancesApi.util.upsertQueryData('getGroupBalances', 'g1', { items: [{ displayName: 'Ava', netMinor: 120000, currency: 'INR', status: 'creditor', isMe: false, user: { id: 'u1' } }], meta: { groupTotalMinor: 300000, isSettledUp: false, currency: 'INR' } }))
    const s = store.getState()
    console.log('groupsApi state:', JSON.stringify(s.groupsApi, null, 1).slice(0, 800))
    console.log('balancesApi state:', JSON.stringify(s.balancesApi, null, 1).slice(0, 800))
    render(
      <Provider store={store}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/balances?groupId=g1']}>
            <Balances />
          </MemoryRouter>
        </ToastProvider>
      </Provider>,
    )
    console.log('immediately after render, groups state:', JSON.stringify(store.getState().groupsApi.queries, null, 1).slice(0, 500))
    console.log('immediately after render, balances state:', JSON.stringify(store.getState().balancesApi.queries, null, 1).slice(0, 500))
    expect(1).toBe(1)
  })
})
