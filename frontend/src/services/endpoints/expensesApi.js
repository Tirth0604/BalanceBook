import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQueryWithReauth } from '@/services/baseQuery'
import { toQuery } from '@/lib/utils'

export const expensesApi = createApi({
  reducerPath: 'expensesApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Expense', 'ExpenseDetail', 'Balance', 'Suggested', 'Analytics', 'Group', 'GroupDetail', 'Recurring'],
  endpoints: (builder) => ({
    createExpense: builder.mutation({
      query: ({ groupId, body }) => ({
        url: `/groups/${groupId}/expenses`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { groupId }) => [
        { type: 'Expense', id: 'LIST' },
        { type: 'GroupDetail', id: String(groupId) },
        { type: 'Balance', id: String(groupId) },
        { type: 'Suggested', id: String(groupId) },
        { type: 'Analytics', id: 'OVERVIEW' },
        { type: 'Recurring', id: String(groupId) },
      ],
    }),
    listExpenses: builder.query({
      query: (params = {}) =>
        `/expenses${toQuery({
          page: params.page,
          limit: params.limit,
          sort: params.sort ?? '-expenseDate',
          search: params.search,
          category: params.category,
          groupId: params.groupId,
          paidBy: params.paidBy,
          tag: params.tag,
          from: params.from,
          to: params.to,
          minAmount: params.minAmount,
          maxAmount: params.maxAmount,
        })}`,
      providesTags: (result, _e, params) =>
        result
          ? [
              ...(result.items || []).map((e) => ({ type: 'ExpenseDetail', id: String(e.id) })),
              { type: 'Expense', id: params?.groupId ? `LIST:${params.groupId}` : 'LIST' },
            ]
          : [{ type: 'Expense', id: 'LIST' }],
    }),
    getExpense: builder.query({
      query: (expenseId) => `/expenses/${expenseId}`,
      providesTags: (_r, _e, expenseId) => [{ type: 'ExpenseDetail', id: String(expenseId) }],
    }),
    updateExpense: builder.mutation({
      query: ({ expenseId, groupId, body }) => ({
        url: `/expenses/${expenseId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_r, _e, { expenseId, groupId }) => [
        { type: 'Expense', id: 'LIST' },
        { type: 'ExpenseDetail', id: String(expenseId) },
        ...(groupId
          ? [
              { type: 'Balance', id: String(groupId) },
              { type: 'Suggested', id: String(groupId) },
              { type: 'GroupDetail', id: String(groupId) },
            ]
          : []),
        { type: 'Analytics', id: 'OVERVIEW' },
      ],
    }),
    deleteExpense: builder.mutation({
      query: ({ expenseId, groupId }) => ({ url: `/expenses/${expenseId}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { expenseId, groupId }) => [
        { type: 'Expense', id: 'LIST' },
        { type: 'ExpenseDetail', id: String(expenseId) },
        ...(groupId
          ? [
              { type: 'Balance', id: String(groupId) },
              { type: 'Suggested', id: String(groupId) },
              { type: 'GroupDetail', id: String(groupId) },
            ]
          : []),
        { type: 'Analytics', id: 'OVERVIEW' },
      ],
    }),
    getExpenseAudit: builder.query({
      query: (expenseId) => `/expenses/${expenseId}/audit`,
      providesTags: (_r, _e, expenseId) => [{ type: 'ExpenseDetail', id: String(expenseId) }],
    }),
    uploadReceipt: builder.mutation({
      query: ({ expenseId, formData }) => ({
        url: `/expenses/${expenseId}/receipt`,
        method: 'POST',
        body: formData,
      }),
      invalidatesTags: (_r, _e, { expenseId }) => [
        { type: 'ExpenseDetail', id: String(expenseId) },
        { type: 'Expense', id: 'LIST' },
      ],
    }),
    deleteReceipt: builder.mutation({
      query: ({ expenseId }) => ({ url: `/expenses/${expenseId}/receipt`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { expenseId }) => [
        { type: 'ExpenseDetail', id: String(expenseId) },
        { type: 'Expense', id: 'LIST' },
      ],
    }),
    metaCategories: builder.query({
      query: () => '/meta/categories',
    }),
    metaSplitTypes: builder.query({
      query: () => '/meta/split-types',
    }),
  }),
})

export const {
  useCreateExpenseMutation,
  useListExpensesQuery,
  useGetExpenseQuery,
  useUpdateExpenseMutation,
  useDeleteExpenseMutation,
  useGetExpenseAuditQuery,
  useUploadReceiptMutation,
  useDeleteReceiptMutation,
  useMetaCategoriesQuery,
  useMetaSplitTypesQuery,
} = expensesApi

export default expensesApi
