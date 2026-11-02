import { createSlice } from '@reduxjs/toolkit'

/**
 * Auth state — accessToken lives in memory ONLY (never localStorage).
 * status: 'unknown' (bootstrap/refresh attempt pending) | 'anonymous' | 'authenticated'
 */

const initialState = {
  accessToken: null,
  user: null,
  status: 'unknown',
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, { payload }) {
      if (payload?.accessToken) state.accessToken = payload.accessToken
      if (payload?.user) state.user = payload.user
      state.status = 'authenticated'
    },
    setUser(state, { payload }) {
      state.user = payload ?? null
      if (payload) state.status = 'authenticated'
    },
    beginBootstrap(state) {
      if (state.status === 'unknown') state.status = 'loading'
    },
    /** Called once on app boot when a silent refresh is attempted. */
    hydrate(state, { payload }) {
      if (payload?.accessToken) {
        state.accessToken = payload.accessToken
        state.user = payload.user ?? state.user
        state.status = 'authenticated'
      } else {
        state.status = 'anonymous'
      }
    },
    markAnonymous(state) {
      state.accessToken = null
      state.user = null
      state.status = 'anonymous'
    },
    logout(state) {
      state.accessToken = null
      state.user = null
      state.status = 'anonymous'
    },
  },
})

export const { setCredentials, setUser, beginBootstrap, hydrate, markAnonymous, logout } =
  authSlice.actions

export default authSlice.reducer
