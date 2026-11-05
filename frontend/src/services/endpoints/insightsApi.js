import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQueryWithReauth } from '@/services/baseQuery'

export const insightsApi = createApi({
  reducerPath: 'insightsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Insight', 'Analytics'],
  endpoints: (builder) => ({
    getInsights: builder.query({
      query: (groupId) => `/groups/${groupId}/insights`,
      providesTags: (_r, _e, groupId) => [{ type: 'Insight', id: String(groupId) }],
    }),
    // Same rules, no group in the path: the caller's own active memberships are the scope.
    getMyInsights: builder.query({
      query: () => '/insights',
      providesTags: [{ type: 'Insight', id: 'me' }],
    }),
  }),
})

export const { useGetInsightsQuery, useGetMyInsightsQuery } = insightsApi

export default insightsApi
