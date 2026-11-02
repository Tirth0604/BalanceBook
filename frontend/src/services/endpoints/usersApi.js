import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQueryWithReauth } from '@/services/baseQuery'
import { setUser, logout as logoutAction } from '@/store/authSlice'
import { toQuery } from '@/lib/utils'

export const usersApi = createApi({
  reducerPath: 'usersApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['User'],
  endpoints: (builder) => ({
    getProfile: builder.query({
      query: () => '/users/me',
      providesTags: [{ type: 'User', id: 'ME' }],
    }),
    updateProfile: builder.mutation({
      query: (body) => ({ url: '/users/me', method: 'PATCH', body }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        const { data } = await queryFulfilled
        if (data?.user) dispatch(setUser(data.user))
      },
      invalidatesTags: [{ type: 'User', id: 'ME' }],
    }),
    uploadAvatar: builder.mutation({
      query: (file) => ({
        url: '/users/me/avatar',
        method: 'POST',
        body: file, // FormData: append('file', file)
      }),
      invalidatesTags: [{ type: 'User', id: 'ME' }],
    }),
    changePassword: builder.mutation({
      query: (body) => ({ url: '/users/me/password', method: 'POST', body }),
    }),
    deleteAccount: builder.mutation({
      query: (body) => ({ url: '/users/me', method: 'DELETE', body: body ?? { confirm: 'DELETE' } }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        await queryFulfilled
        dispatch(logoutAction())
      },
    }),
    searchUsers: builder.query({
      query: (q) => `/users/search${toQuery({ q })}`,
    }),
  }),
})

export const {
  useGetProfileQuery,
  useUpdateProfileMutation,
  useUploadAvatarMutation,
  useChangePasswordMutation,
  useDeleteAccountMutation,
  useSearchUsersQuery,
  useLazySearchUsersQuery,
} = usersApi

export default usersApi
