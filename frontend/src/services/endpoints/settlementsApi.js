import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQueryWithReauth } from '@/services/baseQuery'
import { toQuery } from '@/lib/utils'

const moneyTags = (groupId) => [
  { type: 'Balance', id: String(groupId) },
  { type: 'Suggested', id: String(groupId) },
  { type: 'Analytics', id: 'OVERVIEW' },
]

export const settlementsApi = createApi({
  reducerPath: 'settlementsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Settlement', 'SettlementDetail', 'Balance', 'Suggested', 'Analytics', 'Notification', 'Expense'],
  endpoints: (builder) => ({
    getSuggestedPlan: builder.query({
      query: ({ groupId, algorithm, maxSize }) =>
        `/groups/${groupId}/settlements/suggested${toQuery({ algorithm, maxSize })}`,
      providesTags: (_r, _e, { groupId }) => [{ type: 'Suggested', id: String(groupId) }],
    }),
    listGroupSettlements: builder.query({
      query: ({ groupId, status }) => `/groups/${groupId}/settlements${toQuery({ status })}`,
      providesTags: (_r, _e, { groupId }) => [
        { type: 'Settlement', id: `GROUP:${groupId}` },
        { type: 'Settlement', id: 'LIST' },
      ],
    }),
    createSettlement: builder.mutation({
      query: (body) => ({ url: '/settlements', method: 'POST', body }),
      invalidatesTags: (_r, _e, body) => [
        ...moneyTags(body?.groupId),
        { type: 'Settlement', id: 'LIST' },
        { type: 'Settlement', id: `GROUP:${body?.groupId}` },
      ],
    }),
    confirmSettlement: builder.mutation({
      query: ({ settlementId, groupId }) => ({
        url: `/settlements/${settlementId}/confirm`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, { settlementId, groupId }) => [
        { type: 'SettlementDetail', id: String(settlementId) },
        { type: 'Settlement', id: 'LIST' },
        'Notification',
        ...(groupId ? moneyTags(groupId) : ['Analytics']),
      ],
    }),
    rejectSettlement: builder.mutation({
      query: ({ settlementId, groupId, reason }) => ({
        url: `/settlements/${settlementId}/reject`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: (_r, _e, { settlementId, groupId }) => [
        { type: 'SettlementDetail', id: String(settlementId) },
        { type: 'Settlement', id: 'LIST' },
        'Notification',
        ...(groupId ? moneyTags(groupId) : ['Analytics']),
      ],
    }),
    disputeSettlement: builder.mutation({
      query: ({ settlementId, groupId }) => ({
        url: `/settlements/${settlementId}/dispute`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, { settlementId, groupId }) => [
        { type: 'SettlementDetail', id: String(settlementId) },
        { type: 'Settlement', id: 'LIST' },
        'Notification',
        ...(groupId ? moneyTags(groupId) : ['Analytics']),
      ],
    }),
    cancelSettlement: builder.mutation({
      query: ({ settlementId, groupId }) => ({
        url: `/settlements/${settlementId}/cancel`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, { settlementId, groupId }) => [
        { type: 'SettlementDetail', id: String(settlementId) },
        { type: 'Settlement', id: 'LIST' },
        ...(groupId ? moneyTags(groupId) : ['Analytics']),
      ],
    }),
    listMySettlements: builder.query({
      query: (params = {}) =>
        `/settlements${toQuery({
          direction: params.direction,
          status: params.status,
          groupId: params.groupId,
          page: params.page,
          limit: params.limit,
        })}`,
      providesTags: [{ type: 'Settlement', id: 'LIST' }],
    }),
    settlementHistory: builder.query({
      query: () => '/settlements/history',
      providesTags: [{ type: 'Settlement', id: 'HISTORY' }],
    }),
  }),
})

export const {
  useGetSuggestedPlanQuery,
  useListGroupSettlementsQuery,
  useCreateSettlementMutation,
  useConfirmSettlementMutation,
  useRejectSettlementMutation,
  useDisputeSettlementMutation,
  useCancelSettlementMutation,
  useListMySettlementsQuery,
  useSettlementHistoryQuery,
} = settlementsApi

export default settlementsApi
