import { createSlice } from '@reduxjs/toolkit'
import { uid } from '@/lib/utils'

const THEME_KEY = 'bb-theme'
const SIDEBAR_KEY = 'bb-sidebar-collapsed'

function readTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'dark' || stored === 'light' ? stored : 'light'
  } catch {
    return 'light'
  }
}

function readSidebar() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'true'
  } catch {
    return false
  }
}

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    sidebarCollapsed: readSidebar(),
    theme: readTheme(),
    dashboardRange: { key: '30d', from: null, to: null },
    toasts: [],
  },
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed
    },
    setSidebarCollapsed(state, { payload }) {
      state.sidebarCollapsed = Boolean(payload)
    },
    setTheme(state, { payload }) {
      if (payload === 'dark' || payload === 'light') state.theme = payload
    },
    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark'
    },
    setDashboardRange(state, { payload }) {
      state.dashboardRange = { ...state.dashboardRange, ...payload }
    },
    pushToast: {
      reducer(state, { payload }) {
        state.toasts.push(payload)
      },
      prepare({ type = 'info', title, message, duration = 5000 }) {
        return { payload: { id: uid(), type, title, message, duration } }
      },
    },
    dismissToast(state, { payload }) {
      state.toasts = state.toasts.filter((t) => t.id !== payload)
    },
  },
})

export const {
  toggleSidebar,
  setSidebarCollapsed,
  setTheme,
  toggleTheme,
  setDashboardRange,
  pushToast,
  dismissToast,
} = uiSlice.actions

export default uiSlice.reducer
