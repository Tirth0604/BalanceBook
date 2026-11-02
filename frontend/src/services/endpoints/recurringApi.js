import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQueryWithReauth } from '@/services/baseQuery'

export const recurringApi = createApi({
  reducerPath: 'recurringApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Recurring', 'Expense', 'Balance', 'Suggested', 'Analytics'],
  endpoints: (builder) => ({
    createRecurring: builder.mutation({
      query: ({ groupId, body }) => ({ url: `/groups/${groupId}/recurring`, method: 'POST', body }),
      invalidatesTags: (_r, _e, { groupId }) => [{ type: 'Recurring', id: String(groupId) }],
    }),
    listRecurring: builder.query({
      query: (groupId) => `/groups/${groupId}/recurring`,
      providesTags: (_r, _e, groupId) => [{ type: 'Recurring', id: String(groupId) }],
    }),
    updateRecurring: builder.mutation({
      query: ({ recurringId, groupId, body }) => ({
        url: `/recurring/${recurringId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_r, _e, { groupId }) => [
        { type: 'Recurring', id: String(groupId) },
      ],
    }),
    deleteRecurring: builder.mutation({
      query: ({ recurringId, groupId }) => ({ url: `/recurring/${recurringId}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { groupId }) => [
        { type: 'Recurring', id: String(groupId) },
      ],
    }),
    pauseRecurring: builder.mutation({
      query: ({ recurringId, groupId }) => ({ url: `/recurring/${recurringId}/pause`, method: 'POST' }),
      invalidatesTags: (_r, _e, { groupId }) => [
        { type: 'Recurring', id: String(groupId) },
      ],
    }),
    resumeRecurring: builder.mutation({
      query: ({ recurringId, groupId }) => ({ url: `/recurring/${recurringId}/resume`, method: 'POST' }),
      invalidatesTags: (_r, _e, { groupId }) => [
        { type: 'Recurring', id: String(groupId) },
      ],
    }),
    recurringHistory: builder.query({
      query: ({ recurringId }) => `/recurring/${recurringId}/history`,
    }),
  }),
})

export const {
  useCreateRecurringMutation,
  useListRecurringQuery,
  useUpdateRecurringMutation,
  useDeleteRecurringMutation,
  usePauseRecurringMutation,
  useResumeRecurringMutation,
  useRecurringHistoryQuery,
  useLazyRecurringHistoryQuery,
} = recurringApi

export default recurringApi
