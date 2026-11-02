import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQueryWithReauth } from '@/services/baseQuery'
import { toQuery } from '@/lib/utils'

export const notificationsApi = createApi({
  reducerPath: 'notificationsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Notification'],
  endpoints: (builder) => ({
    listNotifications: builder.query({
      query: (params = {}) => `/notifications${toQuery({ unread: params.unread, page: params.page, limit: params.limit })}`,
      providesTags: ['Notification'],
    }),
    unreadCount: builder.query({
      query: () => '/notifications/unread-count',
      providesTags: ['Notification'],
    }),
    markRead: builder.mutation({
      query: (notificationId) => ({ url: `/notifications/${notificationId}/read`, method: 'PATCH' }),
      invalidatesTags: ['Notification'],
    }),
    markAllRead: builder.mutation({
      query: () => ({ url: '/notifications/read-all', method: 'POST' }),
      invalidatesTags: ['Notification'],
    }),
    deleteNotification: builder.mutation({
      query: (notificationId) => ({ url: `/notifications/${notificationId}`, method: 'DELETE' }),
      invalidatesTags: ['Notification'],
    }),
  }),
})

export const {
  useListNotificationsQuery,
  useUnreadCountQuery,
  useMarkReadMutation,
  useMarkAllReadMutation,
  useDeleteNotificationMutation,
} = notificationsApi

export default notificationsApi
