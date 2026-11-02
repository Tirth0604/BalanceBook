import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { combineReducers, configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import authReducer from '@/store/authSlice'
import uiReducer from '@/store/uiSlice'
import { ToastProvider, useToast } from '../toast'

function makeStore() {
  return configureStore({ reducer: combineReducers({ auth: authReducer, ui: uiReducer }) })
}

function TriggerChild() {
  const toast = useToast()
  return (
    <button onClick={() => toast.success('Saved', 'Expense created.')}>fire</button>
  )
}

describe('ToastProvider / useToast', () => {
  it('renders toasts in an aria-live region with title and message', () => {
    const store = makeStore()
    render(
      <Provider store={store}>
        <ToastProvider>
          <TriggerChild />
        </ToastProvider>
      </Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'fire' }))

    const live = document.querySelector('[aria-live="polite"]')
    expect(live).not.toBeNull()
    expect(live).toHaveAccessibleName('Notifications')
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('Expense created.')).toBeInTheDocument()
  })

  it('dismiss removes the toast from the queue', () => {
    const store = makeStore()
    render(
      <Provider store={store}>
        <ToastProvider>
          <TriggerChild />
        </ToastProvider>
      </Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'fire' }))
    expect(screen.getByText('Saved')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(store.getState().ui.toasts).toHaveLength(0)
  })

  it('useToast outside provider throws (no silent no-op)', () => {
    const Broken = () => {
      useToast()
      return null
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Broken />)).toThrow(/ToastProvider/)
    spy.mockRestore()
  })
})
