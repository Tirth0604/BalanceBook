# BalanceBook — Development Checklist & Roadmap

Module ownership (as submitted for the project):

| Owner | GitHub | Functional module |
|---|---|---|
| Love Shah | `LoveShah21` | Authentication & Group Management (users, JWT, groups, invitations, roles, profile) |
| Tirth Gandhi | `Tirth0604` | Expense Entry & Categorisation (splits, receipts, categories/tags, edit/delete + audit) |
| Fahim Saiyad | `fahim0-3` | Balance Computation & Settlement (running balances, minimisation, debt simplification, settlement confirmation) |
| Shared | — | Analytics, notifications, recurring expenses, budgets, insights, frontend shell |

Each owner is accountable for their module's services, routes, validation and tests.

## Phase checklist

### 1 — Foundation
- [x] Environment inspection (Node 24, git, Mongo via docker-compose / memory-server for tests)
- [x] Architecture, DB schema, API contract, financial-engine and design-system docs
- [x] Backend + frontend scaffolding, dependency manifests
- [x] Env validation (`config/env.js`), `ApiError`/`ApiResponse`/`asyncHandler`, error middleware

### 2 — Data model
- [ ] User, Group, Expense, Settlement, Notification, RecurringExpense, Budget,
      ExpenseAuditLog, RefreshToken, InvitationToken
- [ ] Indexes for `groupId`, `userId`, `expenseDate`, settlement `status`, unique email/invitationCode
- [ ] Schema-level money guards (integer minor units, `shareMinor` sum hook)

### 3 — Financial engine (pure, unit-tested first)
- [ ] `utils/money.js` + `algorithms/currency.js`
- [ ] `algorithms/splitter.js` — equal / exact / percentage, largest-remainder, deterministic ties
- [ ] `algorithms/balanceCalculator.js` — derived net balances, Σ = 0 invariant
- [ ] `algorithms/greedySettlement.js`
- [ ] `algorithms/minimumSettlement.js` — zero-sum partition + threshold fallback
- [ ] Unit tests: rounding, remainders, degenerate cases, solver invariants

### 4 — Auth & users  ·Love
- [ ] register / login / refresh(rotation) / logout / forgot / reset / verify-email
- [ ] bcrypt(12), access JWT, httpOnly refresh cookie, rate limits, helmet, CORS, sanitize
- [ ] profile CRUD, avatar upload, change password, account deletion, notification prefs

### 5 — Groups & invitations ·Love
- [ ] create group, list with filters/pagination, details, edit, archive
- [ ] invite by email + join-by-code, accept/decline, pending invitations
- [ ] admin vs member authorization (`requireGroupRole`), remove member blocked while net ≠ 0
- [ ] tests: duplicate invite, non-member access 403, last-admin protection

### 6 — Expenses & splits ·Tirth
- [ ] create with equal/exact/percentage (server computes shares), 422 on bad split
- [ ] multi-currency snapshot (`currency`, `exchangeRate`, `groupAmountMinor`)
- [ ] list/search/filter/sort/paginate; detail; edit + delete with recalculation
- [ ] receipt upload (jpg/png/webp/pdf ≤ 8 MB) via pluggable storage, delete receipt
- [ ] categories + tags, audit log for every mutation, edit history endpoint
- [ ] tests: share-sum rule, remainder paisa, non-member participant rejected, audit trail

### 7 — Balances & settlement ·Fahim
- [ ] `GET /groups/:id/balances` derived engine + `assertGroupInvariant`
- [ ] `GET /groups/:id/settlements/suggested` (minimum with greedy fallback)
- [ ] record → awaiting confirmation → receiver confirm / reject / dispute / cancel
- [ ] idempotency keys, duplicate-confirm 409, over-payment 422, self-payment 422
- [ ] history + `GET /me/summary`
- [ ] tests: multi-payer ledgers, zero-balance members, minimum ≤ greedy, spec example

### 8 — Dashboard & analytics
- [ ] overview (owed / receivable / net / totals / monthly summary / recent / pending)
- [ ] aggregation pipelines: categories, members, trend (day/week/month), date filters
- [ ] CSV export, amounts-paid vs amounts-consumed distinction

### 9 — Notifications + realtime
- [ ] notification service (all 13 event types), list/unread/mark-read/mark-all/delete
- [ ] Socket.IO hub, per-user + per-group rooms, membership-checked subscribe

### 10 — Advanced features
- [ ] recurring expenses (daily/weekly/monthly, next due, pause/resume, history,
      duplicate-safe generation, no silent charging)
- [ ] budgets (group total + per category, progress, 75/90/100 % alerts)
- [ ] rule-based smart spending insights

### 11 — Frontend
- [ ] design tokens, UI primitives, app shell (sidebar/topbar/mobile tab bar)
- [ ] store wiring, auth flow with refresh queue, protected routing
- [ ] Landing, Dashboard, Groups, GroupDetail, Expenses, AddExpense (live split preview),
      Balances, Settlements, Analytics, Notifications, Budgets, Insights, Profile, Settings
- [ ] skeletons / empty states / error states / toasts / confirm dialogs

### 12 — Verification, security, delivery
- [ ] full test run (unit + integration), frontend build
- [ ] browser walkthrough of the golden path + edge cases
- [ ] seed script with realistic multi-group data
- [ ] README: setup, env table, architecture, API reference, testing, deployment
- [ ] docker-compose for local Mongo replica set, Render/Vercel deploy docs
- [ ] commits split by module owner

## Definition of Done — tracked

Functional correctness gates the last checkbox in each phase: money is integer minor
units, `Σ balances === 0` per group, minimum solver ≤ greedy, no endpoint trusts a
client-computed amount, and no button in the UI is decorative.
