# BalanceBook — Development Checklist & Roadmap

Module ownership (as submitted for the project):

| Owner | GitHub | Functional module |
|---|---|---|
| Love Shah | `LoveShah21` | Authentication & Group Management (users, JWT, groups, invitations, roles, profile) |
| Tirth Gandhi | `Tirth0604` | Expense Entry & Categorisation (splits, receipts, categories/tags, edit/delete + audit) |
| Fahim Saiyad | `fahim0-3` | Balance Computation & Settlement (running balances, minimisation, debt simplification, settlement confirmation) |
| Shared | — | Analytics, notifications, recurring expenses, budgets, insights, frontend shell |

Each owner is accountable for their module's services, routes, validation and tests.

## Verified on 2026-11-02

Commands run against this working tree and their results:

- `backend: npx jest --runInBand` — 11 suites, 176 tests, all passing.
- `backend: npm run smoke` — 13/13 checks pass (login, groups, balances, ledger Σ net = 0,
  expenses, settlements, suggested plan 3 optimised vs 5 naive, `/me/summary`,
  `/meta/categories`, `/meta/split-types`, `/notifications`, `/analytics/dashboard`,
  invalid token → 401).
- `frontend: npm run build` — succeeds.
- `backend: npm run seed` — 6 users / 4 groups / 27 expenses; every group ledger nets to
  exactly 0 minor units (asserted by the script itself).
- Known red: 13 frontend tests in the Balances / Expenses / ExpenseForm suites are failing
  and under repair (`frontend: npx vitest run`); `backend: npm run lint` fails because no
  ESLint config exists despite the script being declared.

Items below are ticked only where backed by real code or one of these passing runs.

## Phase checklist

### 1 — Foundation
- [x] Environment inspection (Node 24, git, Mongo via docker-compose / memory-server for tests)
- [x] Architecture, DB schema, API contract, financial-engine and design-system docs
- [x] Backend + frontend scaffolding, dependency manifests
- [x] Env validation (`config/env.js`), `ApiError`/`ApiResponse`/`asyncHandler`, error middleware

### 2 — Data model
- [x] User, Group, Expense, Settlement, Notification, RecurringExpense, Budget,
      ExpenseAuditLog, RefreshToken, InvitationToken
      — all ten present in `backend/src/models/`
- [x] Indexes for `groupId`, `userId`, `expenseDate`, settlement `status`, unique email/invitationCode
      — `Expense.js` (`{groupId, expenseDate}` etc.), `Settlement.js` (`{groupId, status, …}`),
      `User.js` unique email, `Group.js` unique `invitationCode`
- [x] Schema-level money guards (integer minor units, `shareMinor` sum hook)
      — integer validators + `pre('validate')` share-sum hook in `Expense.js`

### 3 — Financial engine (pure, unit-tested first)
- [x] `utils/money.js` + `algorithms/currency.js` — `npx jest --runInBand tests/unit` (money.test.js)
- [x] `algorithms/splitter.js` — equal / exact / percentage, largest-remainder, deterministic ties
      — tests/unit/splits.test.js passing
- [x] `algorithms/balanceCalculator.js` — derived net balances, Σ = 0 invariant
      — tests/unit/settlement.test.js ("multiple expenses with multiple payers still net to zero")
- [x] `algorithms/greedySettlement.js` — unit tests passing
- [x] `algorithms/minimumSettlement.js` — zero-sum partition + threshold fallback
      — unit tests: "greedy is valid but not always minimal; the exact solver is",
      "falls back to greedy above the size threshold and says why"
- [x] Unit tests: rounding, remainders, degenerate cases, solver invariants
      — tests/unit (money, splits, settlement incl. randomised invariant check), all green

### 4 — Auth & users  ·Love
- [x] register / login / refresh(rotation) / logout / forgot / reset / verify-email
      — `routes/authRoutes.js`; `npx jest --runInBand tests/integration/auth.test.js` green;
      smoke run logs in over HTTP
- [x] bcrypt(12), access JWT, httpOnly refresh cookie, rate limits, helmet, CORS, sanitize
      — `User.js` (BCRYPT_ROUNDS = 12), `authService.js` (SHA-256-hashed rotating tokens,
      family reuse detection, `httpOnly`/`SameSite=strict` cookie), `app.js`, `rateLimiters.js`
- [x] profile CRUD, avatar upload, change password, account deletion, notification prefs
      — `routes/userRoutes.js`; `notificationPreferences` in `validation/userSchemas.js`

### 5 — Groups & invitations ·Love
- [x] create group, list with filters/pagination, details, edit, archive
      — tests/integration/groups.test.js ("filters by category and search text",
      "archives … keeps archived groups out of the default list")
- [x] invite by email + join-by-code, accept/decline, pending invitations
      — groups.test.js ("splits emails into invited, already and notFound", "joins through
      the invitation code", "lists pending invitations for the admin only")
- [x] admin vs member authorization (`requireGroupRole`), remove member blocked while net ≠ 0
      — `middleware/roleMiddleware.js`; `groupService.js` `memberNetBalance` guard
- [x] tests: duplicate invite, non-member access 403, last-admin protection
      — groups.test.js ("deduplicates repeat invitations", "answers 403 for a non-member",
      "blocks removing the last active admin"), all passing

### 6 — Expenses & splits ·Tirth
- [x] create with equal/exact/percentage (server computes shares), 422 on bad split
      — tests/integration/expenses.test.js ("computes equal-split shares server-side",
      "rejects an exact split whose shares do not sum to the total with 422",
      "rejects percentages that sum to 99.99 with 422")
- [x] multi-currency snapshot (`currency`, `exchangeRate`, `groupAmountMinor`)
      — expenses.test.js ("snapshots currency conversion fields at write time")
- [x] list/search/filter/sort/paginate; detail; edit + delete with recalculation
      — expenses.test.js ("filters by search, category and date range", "recalculates
      shares for a new total and writes an audit row", soft-delete suite)
- [x] receipt upload (jpg/png/webp/pdf ≤ 8 MB) via pluggable storage, delete receipt
      — `middleware/uploadMiddleware.js` (allow-list also admits heic), local + cloudinary
      drivers; expenses.test.js ("stores a png receipt … replaces it on a second upload",
      "rejects a .txt receipt file")
- [x] categories + tags, audit log for every mutation, edit history endpoint
      — `GET /expenses/:id/audit`; expenses.test.js audit-trail suite green
- [x] tests: share-sum rule, remainder paisa, non-member participant rejected, audit trail
      — tests/unit/splits.test.js (remainders), expenses.test.js ("rejects a participant
      who is not an active member", "rejects amounts with sub-paisa precision as 422")

### 7 — Balances & settlement ·Fahim
- [x] `GET /groups/:id/balances` derived engine + `assertGroupInvariant`
      — tests/integration/balances.test.js ("Σ balances = 0 …", "throws
      FINANCIAL_INVARIANT_VIOLATION when the ledger does not net to zero"); smoke asserts
      Σ net = 0 over HTTP
- [x] `GET /groups/:id/settlements/suggested` (minimum with greedy fallback)
      — smoke: 3 optimised vs 5 naive transactions; settlements.test.js suggestions suite
- [x] record → awaiting confirmation → receiver confirm / reject / dispute / cancel
      — `routes/settlementRoutes.js`; settlements.test.js lifecycle suite green
- [x] idempotency keys, duplicate-confirm 409, over-payment 422, self-payment 422
      — settlements.test.js ("returns the original settlement for a replayed idempotency
      key", duplicate confirm → 409, "rejects an over-payment", "rejects a self-payment");
      unique partial index on `idempotencyKey` in `Settlement.js`
- [x] history + `GET /me/summary` — settlements.test.js listing suite; smoke checks both
- [x] tests: multi-payer ledgers, zero-balance members, minimum ≤ greedy, spec example
      — unit/settlement.test.js ("multiple expenses with multiple payers still net to zero",
      "inactive members appear with a zero balance", "the spec example: Alice pays ₹3,000
      split three ways", greedy-vs-exact minimality), all passing

### 8 — Dashboard & analytics
- [x] overview (owed / receivable / net / totals / monthly summary / recent / pending)
      — `GET /me/summary` + `GET /analytics/dashboard` (smoke-checked); tests/integration/analytics.test.js green
- [x] aggregation pipelines: categories, members, trend (day/week/month), date filters
      — `routes/analyticsRoutes.js`, `services/analyticsService.js`; analytics.test.js green
- [x] CSV export, amounts-paid vs amounts-consumed distinction
      — `GET /analytics/export.csv`; `paidMinor`/`consumedMinor` pipeline in analyticsService.js

### 9 — Notifications + realtime
- [x] notification service (all event types — `constants.js` defines 14), list/unread/mark-read/mark-all/delete
      — `routes/notificationRoutes.js`; smoke checks `GET /notifications`
- [x] Socket.IO hub, per-user + per-group rooms, membership-checked subscribe
      — `sockets/hub.js` (`group:subscribe` re-checks `group.isMember` before joining)

### 10 — Advanced features
- [x] recurring expenses (daily/weekly/monthly, next due, pause/resume, history,
      duplicate-safe generation, no silent charging)
      — `routes/recurringRoutes.js`; unique partial `{recurrenceId, occurrenceKey}` index in
      `Expense.js`; tests/integration/recurring.test.js green
- [x] budgets (group total + per category, progress, 75/90/100 % alerts)
      — `routes/budgetRoutes.js`, threshold alerting in `budgetService.js`;
      tests/integration/budgets.test.js green
- [x] rule-based smart spending insights — `routes/insightRoutes.js` + `insightsService.js`

### 11 — Frontend
- [x] design tokens, UI primitives, app shell (sidebar/topbar/mobile tab bar)
      — `src/styles/`, `src/components/ui/` (26 primitives), `src/components/layout/`
- [x] store wiring, auth flow with refresh queue, protected routing
      — `src/store/`, `src/services/baseQuery.js` (single-flight 401 refresh-and-retry), `src/routes/`
- [x] Landing, Dashboard, Groups, GroupDetail, Expenses, AddExpense (live split preview),
      Balances, Settlements, Analytics, Notifications, Budgets, Insights, Profile, Settings
      — all present in `src/pages/`; AddExpense previews with the server's rounding rules.
      Caveat: 13 tests in Balances/Expenses/ExpenseForm suites are red and under repair
- [x] skeletons / empty states / error states / toasts / confirm dialogs
      — `skeleton.jsx`, `empty-state.jsx`, `error-state.jsx`, `toast.jsx`, `confirm-dialog.jsx`

### 12 — Verification, security, delivery
- [x] full test run (unit + integration), frontend build
      — backend `npx jest --runInBand`: 176/176 green; `frontend: npm run build`: succeeds.
      Frontend `npx vitest run` still red (13 tests under repair) — see Verified note
- [ ] browser walkthrough of the golden path + edge cases
- [x] seed script with realistic multi-group data
      — `npm run seed`: 6 users / 4 groups / 27 expenses, every ledger netting 0 minor units
- [x] README: setup, env table, architecture, API reference, testing, deployment — `README.md`
- [x] docker-compose for local Mongo replica set, Render/Vercel deploy docs
      — `docker-compose.yml` (`mongodb` + one-shot `mongo-initiate` rs.initiate); README deployment section
- [x] commits split by module owner
      — `git shortlog -sne`: Love Shah (LoveShah21), Tirth Gandhi (Tirth0604), Fahim Saiyad (fahim0-3)

## Definition of Done — tracked

Functional correctness gates the last checkbox in each phase: money is integer minor
units, `Σ balances === 0` per group, minimum solver ≤ greedy, no endpoint trusts a
client-computed amount, and no button in the UI is decorative.
