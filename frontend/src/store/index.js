import { combineReducers, configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'

import authReducer from './authSlice'
import uiReducer from './uiSlice'

import authApi from '@/services/endpoints/authApi'
import usersApi from '@/services/endpoints/usersApi'
import groupsApi from '@/services/endpoints/groupsApi'
import expensesApi from '@/services/endpoints/expensesApi'
import balancesApi from '@/services/endpoints/balancesApi'
import settlementsApi from '@/services/endpoints/settlementsApi'
import analyticsApi from '@/services/endpoints/analyticsApi'
import notificationsApi from '@/services/endpoints/notificationsApi'
import recurringApi from '@/services/endpoints/recurringApi'
import budgetsApi from '@/services/endpoints/budgetsApi'
import insightsApi from '@/services/endpoints/insightsApi'

const rootReducer = combineReducers({
  auth: authReducer,
  ui: uiReducer,
  [authApi.reducerPath]: authApi.reducer,
  [usersApi.reducerPath]: usersApi.reducer,
  [groupsApi.reducerPath]: groupsApi.reducer,
  [expensesApi.reducerPath]: expensesApi.reducer,
  [balancesApi.reducerPath]: balancesApi.reducer,
  [settlementsApi.reducerPath]: settlementsApi.reducer,
  [analyticsApi.reducerPath]: analyticsApi.reducer,
  [notificationsApi.reducerPath]: notificationsApi.reducer,
  [recurringApi.reducerPath]: recurringApi.reducer,
  [budgetsApi.reducerPath]: budgetsApi.reducer,
  [insightsApi.reducerPath]: insightsApi.reducer,
})

export function createAppStore(preloadedState) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          // FormData / URLSearchParams legitimately live in RTKQ request args
          ignoredActionPaths: ['meta.arg', 'payload.arg', 'error'],
        },
        immutableCheck: { warnAfter: 200, memoize: true },
      }).concat(
        authApi.middleware,
        usersApi.middleware,
        groupsApi.middleware,
        expensesApi.middleware,
        balancesApi.middleware,
        settlementsApi.middleware,
        analyticsApi.middleware,
        notificationsApi.middleware,
        recurringApi.middleware,
        budgetsApi.middleware,
        insightsApi.middleware,
      ),
  })
}

export const store = createAppStore()

setupListeners(store.dispatch)
