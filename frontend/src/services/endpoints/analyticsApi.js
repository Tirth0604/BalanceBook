import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQueryWithReauth, rawBaseQuery } from '@/services/baseQuery'
import { toQuery } from '@/lib/utils'

export const analyticsApi = createApi({
  reducerPath: 'analyticsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Analytics'],
  endpoints: (builder) => ({
    /**
     * GET /analytics/overview?groupId=&from=&to=&range=
     * Shape is server-defined; consumers must guard optional fields.
     */
    overview: builder.query({
      query: (params = {}) =>
        `/analytics/overview${toQuery({
          groupId: params.groupId,
          range: params.range,
          from: params.from,
          to: params.to,
        })}`,
      providesTags: [{ type: 'Analytics', id: 'OVERVIEW' }],
    }),
    categories: builder.query({
      query: (params = {}) => `/analytics/categories${toQuery(params)}`,
      providesTags: [{ type: 'Analytics', id: 'CATEGORIES' }],
    }),
    members: builder.query({
      query: (params = {}) => `/analytics/members${toQuery(params)}`,
      providesTags: [{ type: 'Analytics', id: 'MEMBERS' }],
    }),
    trend: builder.query({
      query: (params = {}) =>
        `/analytics/trend${toQuery({
          groupId: params.groupId,
          granularity: params.granularity ?? 'month',
          from: params.from,
          to: params.to,
        })}`,
      providesTags: [{ type: 'Analytics', id: 'TREND' }],
    }),
    /** CSV export: bypasses the JSON envelope; returns a Blob for download. */
    exportCsv: builder.query({
      query: (params = {}) => ({
        url: `/analytics/export.csv${toQuery(params)}`,
        // function handler: this fetchBaseQuery build only special-cases 'json' and would
        // hand back a text string for the 'blob' string handler
        responseHandler: (response) => response.blob(),
      }),
      // blob bodies never match the success envelope, so baseQuery passes them through
      providesTags: [],
    }),
  }),
})

export const {
  useOverviewQuery,
  useCategoriesQuery,
  useMembersQuery,
  useTrendQuery,
  useExportCsvQuery,
  useLazyExportCsvQuery,
} = analyticsApi

/** Direct CSV fetch → triggers a browser download. Used by the Analytics page. */
export async function downloadCsv(params, accessToken) {
  const path = `/analytics/export.csv${toQuery(params)}`
  const result = await rawBaseQuery(
    { url: path, responseHandler: (response) => response.blob() },
    {
      dispatch: () => {},
      getState: () => ({ auth: { accessToken } }),
      extra: {},
    },
    {},
  )
  if (result.error || !result.data) throw new Error('Export failed')
  // createObjectURL throws "Overload resolution failed" on anything that is not a
  // Blob/MediaSource, so normalize before handing the body to the anchor.
  const blob = result.data instanceof Blob
    ? result.data
    : new Blob([typeof result.data === 'string' ? result.data : ''], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `balancebook-${params?.groupId || 'all'}-${Date.now()}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export default analyticsApi
