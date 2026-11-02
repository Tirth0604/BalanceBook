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
  }),
})

export const { useGetInsightsQuery } = insightsApi

export default insightsApi
