import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQueryWithReauth } from '@/services/baseQuery'

export const budgetsApi = createApi({
  reducerPath: 'budgetsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Budget', 'Analytics'],
  endpoints: (builder) => ({
    /** PUT /groups/:id/budgets — upsert by category. */
    putBudget: builder.mutation({
      query: ({ groupId, body }) => ({ url: `/groups/${groupId}/budgets`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { groupId }) => [{ type: 'Budget', id: String(groupId) }],
    }),
    listBudgets: builder.query({
      query: (groupId) => `/groups/${groupId}/budgets`,
      providesTags: (_r, _e, groupId) => [{ type: 'Budget', id: String(groupId) }],
    }),
    deleteBudget: builder.mutation({
      query: ({ budgetId, groupId }) => ({ url: `/budgets/${budgetId}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { groupId }) => [
        { type: 'Budget', id: String(groupId) },
      ],
    }),
  }),
})

export const { usePutBudgetMutation, useListBudgetsQuery, useDeleteBudgetMutation } =
  budgetsApi

export default budgetsApi
