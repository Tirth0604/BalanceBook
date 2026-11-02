import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQueryWithReauth } from '@/services/baseQuery'

export const balancesApi = createApi({
  reducerPath: 'balancesApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Balance', 'Suggested', 'Analytics', 'Settlement'],
  endpoints: (builder) => ({
    /** GET /groups/:id/balances → [Balance] with meta { groupTotalMinor, isSettledUp } */
    getGroupBalances: builder.query({
      query: (groupId) => `/groups/${groupId}/balances`,
      providesTags: (_r, _e, groupId) => [{ type: 'Balance', id: String(groupId) }],
    }),
    /** GET /me/summary — derived totals, refreshed with the Analytics tag. */
    getMySummary: builder.query({
      query: () => '/me/summary',
      providesTags: [{ type: 'Analytics', id: 'OVERVIEW' }],
    }),
  }),
})

export const { useGetGroupBalancesQuery, useGetMySummaryQuery } = balancesApi

export default balancesApi
