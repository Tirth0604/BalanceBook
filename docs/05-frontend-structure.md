# BalanceBook — Frontend Structure & Conventions

Vite + React 18 + React Router 6 + Redux Toolkit (RTK Query) + Tailwind v4 + Recharts.

## 1. Tree

```
frontend/src/
├── main.jsx  App.jsx  index.css
├── styles/theme.css              tokens + base layer (docs/06)
├── lib/
│   ├── utils.js                  cn(), clamp, groupBy, debounce
│   ├── money.js                  parseAmount / formatMinor / formatSigned — MIRRORS backend rules
│   ├── dates.js                rangePresets (7d/30d/this_month/last_month/this_year/custom)
│   └── io.js                     socket.io-client singleton, auth-aware reconnect
├── services/
│   ├── baseQuery.js              fetchBaseQuery + JWT + 401 refresh-and-retry queue
│   └── endpoints/                one createApi per domain (no shared file edits)
│       authApi.js  usersApi.js  groupsApi.js  expensesApi.js
│       balancesApi.js  settlementsApi.js  analyticsApi.js  notificationsApi.js
│       recurringApi.js  budgetsApi.js  insightsApi.js
├── store/
│   ├── index.js                  combineReducers: api reducers + auth + ui
│   ├── authSlice.js              accessToken, user, hydrate, logout
│   └── uiSlice.js                sidebar, theme, activeRange, toasts
├── components/
│   ├── ui/                       button, card, input, label, select, dialog, sheet, tabs,
│   │                             badge, avatar, skeleton, toast, progress, dropdown-menu,
│   │                             tooltip, switch, checkbox, empty-state, confirm-dialog
│   ├── layout/                   AppShell, Sidebar, Topbar, MobileTabBar, PageHeader,
│   │                             NotificationBell, UserMenu
│   ├── money/                    Money, BalancePill, AmountInput, SplitBar, TrendSparkline
│   ├── dashboard/                KpiTile, NetBalanceCard, RecentActivity, GroupSummary,
│   │                             CategoryDonut, MonthlyBars
│   ├── groups/                   GroupCard, MemberList, InviteDialog, CreateGroupDialog,
│   │                             MemberBalanceTable
│   ├── expenses/                 ExpenseList, ExpenseRow, ExpenseDetailDrawer,
│   │                             AddExpenseSheet, SplitModeTabs, ParticipantPicker,
│   │                             SplitPreview, ReceiptUploader, AuditTimeline
│   ├── settlements/              SuggestedPlan, SettlementRow, RecordSettlementDialog,
│   │                             PendingConfirmations, SettlementHistory
│   ├── analytics/                OverviewCharts, CategoryBreakdown, MemberContribution,
│   │                             TimeSeries, FilterBar, ExportButton
│   └── insights/                 InsightCard, BudgetProgress, RecurrenceList
├── pages/                        Landing, Login, Register, ForgotPassword, ResetPassword,
│                                 Dashboard, Groups, GroupDetail, Balances, Expenses,
│                                 AddExpense, Settlements, Analytics, Notifications,
│                                 Budgets, Insights, Profile, Settings, NotFound
├── routes/                       index.jsx (lazy routes), ProtectedRoute, PublicOnlyRoute
└── hooks/                        useAuth, useMoney, useDebounce, useSocketEvent,
                                useGroupAccess, useMediaQuery, useDocumentTitle
```

## 2. Data rules

- **All reads/writes go through RTK Query endpoints.** No `fetch`/`axios` inside components.
  No component reads another domain's cache; use `providesTags` / `invalidatesTags`.
- Tag vocabulary (exact): `User`, `Group`, `Group:<id>`, `Expense`, `Expense:<id>`,
  `Balance:<groupId>`, `Suggested:<groupId>`, `Settlement`, `Settlement:<id>`,
  `Analytics`, `Notification`, `Budget:<groupId>`, `Recurring:<groupId>`, `Insight:<groupId>`.
- After a mutation that can move money, invalidate **`Balance:<groupId>`,
  `Suggested:<groupId>` and `Analytics`** — the three views that display derived numbers.
- Auth: access token lives in memory only (`authSlice`); refresh happens in
  `baseQueryWithReauth` (single in-flight refresh, queued retries) against
  `POST /auth/refresh` with `credentials: 'include'`.
- Amounts are entered as decimal strings and sent as strings. The client may preview a
  split locally using `lib/money.js` (same largest-remainder rules as the backend) but the
  server's response is the truth and replaces the optimistic cache.

## 3. Real-time

`lib/io.js` connects after login with `{ auth: { token } }` and re-subscribes to the
current group room. On `notification:new` → `notificationsApi.util.invalidateTags(['Notification'])`
+ toast. On `balance:changed` → invalidate that group's `Balance`/`Suggested` tags.
Socket events never write literal amounts into the cache; they only trigger refetches.

## 4. Component conventions

- Default export per file, props destructured, no prop drilling deeper than 2 levels
  (compose instead).
- Styling: `cn()` + semantic Tailwind classes (`bg-card text-foreground border-border`).
  A raw `#hex` in a component is a review defect.
- Every page is wrapped in `<PageHeader>` and renders one of
  `<Skeleton>` / `<EmptyState>` / `<ErrorState>` while loading/failing.
- Forms: controlled, zod-free client validation matching the server's rules
  (required title, amount > 0, participants ≥ 1, shares/percentages sum correctly);
  submit disabled while `isLoading || isError === undefined`.
- Money displays use `<Money minor currency/>` or `<Money amount="3000.00"/>`; never
  hand-format a string.
- Accessibility: labelled inputs, `aria-live="polite"` on toasts and net-balance changes,
  keyboard-dismissible dialogs, focus returns to the trigger.

## 5. Responsive contract

| breakpoint | layout |
|---|---|
| `< 640 px` | bottom tab bar, single-column cards, Add Expense as full-screen sheet, KPI 2-up grid, charts 240 px tall |
| `640–1023 px` | icon-only sidebar (72 px), 2-col KPI grid |
| `≥ 1024 px` | full sidebar (260 px), 4-col KPI grid, expense list + detail drawer side by side |
| `≥ 1440 px` | content max-width 1280 px, centered |
