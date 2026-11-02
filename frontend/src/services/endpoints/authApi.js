import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQueryWithReauth } from '@/services/baseQuery'
import { logout, setCredentials } from '@/store/authSlice'

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['User'],
  endpoints: (builder) => ({
    register: builder.mutation({
      query: (body) => ({ url: '/auth/register', method: 'POST', body, isPublicAuthCall: true }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        const { data } = await queryFulfilled
        if (data?.accessToken) dispatch(setCredentials({ accessToken: data.accessToken, user: data.user }))
      },
      invalidatesTags: ['User'],
    }),
    login: builder.mutation({
      query: (body) => ({ url: '/auth/login', method: 'POST', body, isPublicAuthCall: true }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        const { data } = await queryFulfilled
        if (data?.accessToken) dispatch(setCredentials({ accessToken: data.accessToken, user: data.user }))
      },
      invalidatesTags: ['User'],
    }),
    /** Silent bootstrap refresh; baseQueryWithReauth calls the raw route itself. */
    refreshSession: builder.mutation({
      query: () => ({ url: '/auth/refresh', method: 'POST' }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        const { data } = await queryFulfilled
        if (data?.accessToken) dispatch(setCredentials({ accessToken: data.accessToken, user: data.user }))
      },
    }),
    logout: builder.mutation({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        dispatch(logout())
        try {
          await queryFulfilled
        } catch {
          /* session is already cleared locally */
        }
      },
      invalidatesTags: ['User'],
    }),
    forgotPassword: builder.mutation({
      query: (body) => ({
        url: '/auth/forgot-password',
        method: 'POST',
        body,
        isPublicAuthCall: true,
      }),
    }),
    resetPassword: builder.mutation({
      query: (body) => ({
        url: '/auth/reset-password',
        method: 'POST',
        body,
        isPublicAuthCall: true,
      }),
    }),
    verifyEmail: builder.mutation({
      query: (body) => ({
        url: '/auth/verify-email',
        method: 'POST',
        body,
        isPublicAuthCall: true,
      }),
      invalidatesTags: ['User'],
    }),
    getMe: builder.query({
      query: () => '/auth/me',
      providesTags: [{ type: 'User', id: 'ME' }],
    }),
  }),
})

export const {
  useRegisterMutation,
  useLoginMutation,
  useRefreshSessionMutation,
  useLogoutMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useVerifyEmailMutation,
  useGetMeQuery,
} = authApi

export default authApi
