import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQueryWithReauth } from '@/services/baseQuery'
import { toQuery } from '@/lib/utils'

/** Money-derived views invalidated together per docs/05 §2. */
const MONEY_TAGS = (groupId) => [
  { type: 'Balance', id: String(groupId) },
  { type: 'Suggested', id: String(groupId) },
  { type: 'Analytics', id: 'OVERVIEW' },
]

export const groupsApi = createApi({
  reducerPath: 'groupsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Group', 'GroupDetail', 'Balance', 'Suggested', 'Analytics', 'Notification'],
  endpoints: (builder) => ({
    createGroup: builder.mutation({
      query: (body) => ({ url: '/groups', method: 'POST', body }),
      invalidatesTags: [{ type: 'Group', id: 'LIST' }],
    }),
    listGroups: builder.query({
      query: (params = {}) =>
        `/groups${toQuery({
          archived: params.archived,
          category: params.category,
          search: params.search,
          page: params.page,
          limit: params.limit,
          sort: params.sort,
        })}`,
      providesTags: (result) =>
        result
          ? [
              ...(result.items || []).map((g) => ({ type: 'GroupDetail', id: String(g.id) })),
              { type: 'Group', id: 'LIST' },
            ]
          : [{ type: 'Group', id: 'LIST' }],
    }),
    getGroup: builder.query({
      query: (groupId) => `/groups/${groupId}`,
      // The detail endpoint returns { group }, while every consumer treats this query's
      // result as the group itself; unwrap here so no page has to remember the nesting.
      transformResponse: (response) => response?.group ?? response ?? null,
      providesTags: (_r, _e, groupId) => [{ type: 'GroupDetail', id: String(groupId) }],
    }),
    updateGroup: builder.mutation({
      query: ({ groupId, ...body }) => ({
        url: `/groups/${groupId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_r, _e, { groupId }) => [
        { type: 'GroupDetail', id: String(groupId) },
        { type: 'Group', id: 'LIST' },
      ],
    }),
    archiveGroup: builder.mutation({
      query: (groupId) => ({ url: `/groups/${groupId}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, groupId) => [
        { type: 'GroupDetail', id: String(groupId) },
        { type: 'Group', id: 'LIST' },
      ],
    }),
    inviteMembers: builder.mutation({
      query: ({ groupId, emails }) => ({
        url: `/groups/${groupId}/invites`,
        method: 'POST',
        body: { emails },
      }),
      invalidatesTags: (_r, _e, { groupId }) => [
        { type: 'GroupDetail', id: String(groupId) },
        'Notification',
      ],
    }),
    acceptInvite: builder.mutation({
      query: ({ groupId, inviteId }) => ({
        url: `/groups/${groupId}/invites/${inviteId}/accept`,
        method: 'POST',
      }),
      invalidatesTags: [{ type: 'Group', id: 'LIST' }, 'Notification', 'User'],
    }),
    declineInvite: builder.mutation({
      query: ({ groupId, inviteId }) => ({
        url: `/groups/${groupId}/invites/${inviteId}/decline`,
        method: 'POST',
      }),
      invalidatesTags: ['Notification', { type: 'Group', id: 'LIST' }],
    }),
    joinByCode: builder.mutation({
      query: (code) => ({ url: '/groups/join', method: 'POST', body: { code } }),
      invalidatesTags: [{ type: 'Group', id: 'LIST' }],
    }),
    removeMember: builder.mutation({
      query: ({ groupId, userId }) => ({
        url: `/groups/${groupId}/members/${userId}/remove`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, { groupId }) => [
        { type: 'GroupDetail', id: String(groupId) },
        { type: 'Balance', id: String(groupId) },
        { type: 'Suggested', id: String(groupId) },
        { type: 'Analytics', id: 'OVERVIEW' },
      ],
    }),
    setMemberRole: builder.mutation({
      query: ({ groupId, userId, role }) => ({
        url: `/groups/${groupId}/members/${userId}/role`,
        method: 'POST',
        body: { role },
      }),
      invalidatesTags: (_r, _e, { groupId }) => [
        { type: 'GroupDetail', id: String(groupId) },
        { type: 'Group', id: 'LIST' },
      ],
    }),
    listInvites: builder.query({
      query: (groupId) => `/groups/${groupId}/invites`,
      providesTags: (_r, _e, groupId) => [{ type: 'GroupDetail', id: String(groupId) }],
    }),
  }),
})

export const {
  useCreateGroupMutation,
  useListGroupsQuery,
  useGetGroupQuery,
  useUpdateGroupMutation,
  useArchiveGroupMutation,
  useInviteMembersMutation,
  useAcceptInviteMutation,
  useDeclineInviteMutation,
  useJoinByCodeMutation,
  useRemoveMemberMutation,
  useSetMemberRoleMutation,
  useListInvitesQuery,
} = groupsApi

export { MONEY_TAGS }
export default groupsApi
