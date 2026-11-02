# BalanceBook

A MERN group-expense and debt-settlement platform. Members create groups, record shared
expenses with equal / exact / percentage splits, and the server derives who owes whom and
proposes the smallest set of transfers to settle up.

The financial engine is the point of the project: all money is handled as **integer minor
units** (paise / cents), splits use **largest-remainder allocation** so shares always sum
exactly to the total, balances are **derived** from expenses plus confirmed settlements
(never stored), and every group ledger satisfies the invariant **Σ net = 0**.

- Backend: Express 4 + Mongoose 8 (CommonJS), in `backend/`
- Frontend: Vite 6 + React 18 + Tailwind v4 + RTK Query + Recharts, in `frontend/`
- Database: MongoDB 7 as a single-node replica set (`docker-compose.yml`) — financial
  writes use multi-document transactions, which a standalone `mongod` cannot run
- Design docs: `docs/01`–`docs/06`

## Table of contents

1. [Architecture](#architecture)
2. [Folder layout](#folder-layout)
3. [The financial engine](#the-financial-engine)
4. [Getting started (fresh clone)](#getting-started-fresh-clone)
5. [Demo accounts (seed data)](#demo-accounts-seed-data)
6. [Environment variables](#environment-variables)
7. [API reference](#api-reference)
8. [Security](#security)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Team and contribution](#team-and-contribution)
12. [Status / known gaps](#status--known-gaps)

## Architecture

Two npm projects with no shared runtime code; the API contract (`docs/03-api-contract.md`)
is the only coupling. The backend is layered so that all money arithmetic lives in pure
functions with zero I/O:

```
backend/src/
├── routes/       HTTP verb + path + auth/validation middleware only (MOUNTS manifest in index.js)
├── controllers/  req <-> DTO translation, no business rules
├── services/     business logic, transactions, invariants — the only layer that touches models
├── models/       Mongoose schemas, indexes, hooks
├── algorithms/   PURE functions: money, splits, balances, settlement solvers (no mongoose/express/config imports)
├── utils/        ApiError / ApiResponse / asyncHandler / money / constants / pagination
├── middleware/   auth, group role, zod validation, upload, rate limiters, error, notFound
├── sockets/      Socket.IO hub (rooms: user:<id>, group:<id>)
├── config/       env.js (zod-validated) and db.js (connection + transaction helper)
└── scripts/      seed.js
```

The frontend is a Vite SPA: RTK Query endpoint slices under `src/services/endpoints/`, a
`baseQuery` that unwraps the API envelope and performs single-flight 401 refresh-and-retry,
`authSlice`/`uiSlice` in `src/store/`, page components in `src/pages/`, and a design-token
layer (Tailwind v4) described in `docs/06-design-system.md`. In dev, Vite proxies `/api`,
`/uploads` and `/socket.io` to the backend on port 5000.

Real-time: Socket.IO shares the HTTP server. On JWT-authenticated connect a socket joins
`user:<id>` plus `group:<id>` rooms for the user's groups; `group:subscribe` re-checks
membership before joining. Notification and balance events are emitted from services via
`sockets/hub.js`.

## Folder layout

```
BalanceBook/
├── backend/               Express + Mongoose API (port 5000, prefix /api/v1)
│   ├── src/
│   ├── scripts/smoke.mjs  golden-path HTTP smoke run
│   └── tests/             unit/ (financial engine) + integration/ (supertest)
├── frontend/              Vite + React SPA (port 5173)
│   └── src/{pages,components,services,store,styles,routes,hooks,lib}
├── docs/                  01 architecture · 02 schema · 03 API contract ·
│                          04 financial engine · 05 frontend · 06 design system
├── docker-compose.yml     local MongoDB replica set + one-shot rs.initiate
└── DEVELOPMENT_CHECKLIST.md
```

## The financial engine

All of it lives in `backend/src/algorithms/` and is unit-tested without a database
(`backend/tests/unit/`).

- **Integer minor units only.** Clients send decimal strings (`"3000.00"`);
  `utils/money.js` (`toMinor`/`fromMinor`) converts once, and no float arithmetic happens
  downstream. Schema validators on `Expense` reject non-integer `shareMinor`,
  `totalMinor` and `groupAmountMinor`.
- **Largest-remainder allocation** (`algorithms/splitter.js`). Equal, exact-amount and
  percentage splits all reduce to integer weights distributed by quotient + remainder;
  leftover minor units go to the largest remainders with a **deterministic tie-break on
  participant id**, so `sum(shares) === totalMinor` exactly and re-running a split is
  reproducible. The `Expense` model additionally has a `pre('validate')` hook that fails
  any document whose participant shares do not sum to the total.
- **Derived balances** (`algorithms/balanceCalculator.js`). A member's net is
  `amounts paid − amounts consumed (expense shares) − settlements sent + settlements
  received (confirmed only)`. There is no balances collection; `GET /groups/:id/balances`
  recomputes from expenses + settlements every time and runs `assertGroupInvariant`.
- **Per-group invariant Σ net = 0.** Every payer is also a possible consumer, so the
  ledger must net to zero in minor units. The seed script asserts this per group, the
  balance service asserts it per request, and the smoke run asserts it over HTTP.
- **Greedy settlement solver** (`algorithms/greedySettlement.js`). Repeatedly matches the
  largest creditor with the largest debtor; produces at most `n − 1` transactions for `n`
  non-zero balances.
- **Exact minimum solver** (`algorithms/minimumSettlement.js`). If the non-zero balances
  partition into `p` independent zero-sum subsets, the optimum is exactly `n − p`
  transfers. The solver maximises `p` with bitmask-DP zero-sum partitioning (memoised),
  then settles each part greedily. Because this is exponential, it only runs up to
  `SETTLEMENT_EXACT_MAX_SIZE` participants (default 12, max 20) and **falls back to
  greedy above the threshold**, reporting why. `GET /groups/:id/settlements/suggested`
  exposes this; the smoke run verifies minimum ≤ naive (3 optimised vs 5 naive
  transactions on seeded data).
- `algorithms/currency.js` handles multi-currency expenses: each expense stores `currency`,
  `exchangeRate` and `groupAmountMinor`, and shares are re-allocated in the group currency.
- `algorithms/settlementValidator.js` proves a proposed plan actually clears the balances.

## Getting started (fresh clone)

Prerequisites: Node.js ≥ 20 (backend `engines` requires it; CI uses Node 22), Docker, npm.

```bash
git clone https://github.com/Tirth0604/BalanceBook.git
cd BalanceBook

# 1. MongoDB as a single-node replica set ("rs0").
#    docker-compose.yml starts `mongodb` with --replSet rs0 and a one-shot
#    `mongo-initiate` service that runs rs.initiate() on first boot.
docker compose up -d

# 2. Backend
cd backend
npm ci
cp .env.example .env          # then set real JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (≥ 32 chars)
npm run seed                  # wipe + seed demo data (refuses to run against production)
npm run dev                   # http://localhost:5000, API at /api/v1, GET /health

# 3. Frontend (new terminal)
cd frontend
npm ci
npm run dev                   # http://localhost:5173, proxies /api, /uploads, /socket.io to :5000
```

`npm run seed -- --keep` adds missing data without wiping. Seed data: 6 users, 4 groups
(Goa Getaway, Flat 704, Reunion 2026, Squad Lunches), 27 expenses written through the real
split engine, plus settlements, 2 recurring rules, 3 budgets and 3 notifications — every
group ledger nets to exactly 0 minor units (the seed asserts this and fails otherwise).

## Demo accounts (seed data)

For local demo use only — created by `npm run seed`, never use these credentials anywhere
else. Shared password: `Balance@123` (override with `SEED_PASSWORD`).

| Email | Name | Notes |
|---|---|---|
| `love@balancebook.app` | Love Shah | admin of Goa Getaway |
| `tirth@balancebook.app` | Tirth Gandhi | sees both creditor and debtor views |
| `fahim@balancebook.app` | Fahim Saiyad | |
| `ananya@balancebook.app` | Ananya Rao | admin of Reunion 2026 |
| `vikram@balancebook.app` | Vikram Mehta | |
| `sofia@balancebook.app` | Sofia Alvarez | USD-preferred, admin of Squad Lunches (USD group) |

## Environment variables

`backend/src/config/env.js` validates the environment with zod at boot and **fails fast** —
a half-configured financial service will not start. Copy `backend/.env.example` to
`backend/.env`; **`backend/.env` is gitignored** (`.gitignore` excludes `.env` and
`**/.env`, keeping only `*.example`). Never commit real secrets.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `PORT` | no | `5000` | HTTP port |
| `HOST` | no | `0.0.0.0` | Bind address |
| `API_PREFIX` | no | `/api/v1` | Route prefix |
| `MONGODB_URI` | **yes** | — | e.g. `mongodb://127.0.0.1:27017/balancebook?replicaSet=rs0` |
| `MONGODB_DB_NAME` | no | from URI | Explicit database name |
| `USE_TRANSACTIONS` | no | `true` | Master switch; boot-time probe may still degrade (see [Testing](#testing)) |
| `JWT_ACCESS_SECRET` | **yes** | — | ≥ 32 characters |
| `JWT_REFRESH_SECRET` | **yes** | — | ≥ 32 characters |
| `JWT_ACCESS_TTL` | no | `15m` | Access-token lifetime |
| `JWT_REFRESH_TTL` | no | `30d` | Refresh-token lifetime |
| `COOKIE_SECURE` | no | `false` | Set `true` in production (HTTPS) |
| `COOKIE_DOMAIN` | no | — | Optional cookie domain scope |
| `CLIENT_URL` | no | `http://localhost:5173` | Used for email links |
| `CORS_ORIGINS` | no | `http://localhost:5173` | Comma-separated allow-list |
| `TRUST_PROXY` | no | `false` | Set `true` behind Render/Railway/Fly proxies |
| `UPLOAD_DRIVER` | no | `local` | `local` or `cloudinary` |
| `UPLOAD_DIR` | no | `backend/uploads` | Local storage directory |
| `PUBLIC_URL` | no | `http://localhost:5000` | Base URL for served uploads |
| `MAX_UPLOAD_BYTES` | no | `8388608` (8 MB) | Receipt/avatar size cap |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | only for cloudinary | — | Cloudinary credentials |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | no | — | When unset, email is captured to a console outbox |
| `MAIL_FROM` | no | `BalanceBook <no-reply@balancebook.app>` | Sender header |
| `SETTLEMENT_EXACT_MAX_SIZE` | no | `12` | Exact minimum-solver threshold (2–20) |
| `SEED_PASSWORD` | no | `Balance@123` | Demo-only seed password |
| `LOG_LEVEL` | no | `info` | `silent`/`error`/`warn`/`info`/`http`/`debug` |

Frontend (optional, read from `import.meta.env`): `VITE_API_BASE_URL` (defaults to
`/api/v1`, which the Vite dev server proxies) and `VITE_SOCKET_URL` (defaults to
same-origin).

## API reference

All paths are relative to `http://localhost:5000/api/v1` unless noted. Everything except
`/auth/*`, `GET /health` (mounted at the server root, outside the prefix) and the
auth-flow endpoints requires `Authorization: Bearer <access token>`. **Group-scoped**
means the router is mounted under `/groups/:id/...` and guarded by `requireGroupMember`
(membership is checked against the group document, never trusted from the body).

### Auth — `/auth`
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | rate-limited |
| POST | `/auth/login` | rate-limited; sets httpOnly refresh cookie |
| POST | `/auth/refresh` | rotates the refresh token |
| POST | `/auth/logout` | revokes the token family |
| POST | `/auth/forgot-password` | rate-limited |
| POST | `/auth/reset-password` | rate-limited |
| POST | `/auth/verify-email` | |
| GET | `/auth/me` | current user |

### Users — `/users`
| Method | Path | Notes |
|---|---|---|
| GET | `/users/me` | profile |
| PATCH | `/users/me` | update profile / notification preferences |
| POST | `/users/me/avatar` | avatar upload (jpeg/png/webp) |
| POST | `/users/me/password` | change password |
| DELETE | `/users/me` | account deletion (password-confirmed) |
| GET | `/users/search` | find users to invite |

### Groups — `/groups` (group-scoped from `/:id` down)
| Method | Path | Notes |
|---|---|---|
| POST | `/groups` | create |
| GET | `/groups` | list with filters/pagination |
| POST | `/groups/join` | join by invitation code |
| GET | `/groups/:id` | details — group-scoped |
| PATCH | `/groups/:id` | edit — group-scoped, admin only |
| DELETE | `/groups/:id` | archive — group-scoped, admin only |
| POST | `/groups/:id/invites` | invite by email — group-scoped, admin only |
| GET | `/groups/:id/invites` | pending invitations — group-scoped, admin only |
| POST | `/groups/:id/invites/:inviteId/accept` | invitee-side (invitation checked, not membership) |
| POST | `/groups/:id/invites/:inviteId/decline` | invitee-side |
| POST | `/groups/:id/members/:userId/remove` | group-scoped, admin only; blocked while member net ≠ 0 |
| POST | `/groups/:id/members/:userId/role` | group-scoped, admin only; last-admin protected |

### Expenses — `/expenses` (reads/writes) + creation under the group path
| Method | Path | Notes |
|---|---|---|
| POST | `/groups/:groupId/expenses` | create — group-scoped; server computes shares from split type |
| GET | `/expenses` | cross-group list: search, filter, sort, paginate (`?groupId=` to scope) |
| GET | `/expenses/:id` | detail |
| PATCH | `/expenses/:id` | edit with recalculation + audit entry |
| DELETE | `/expenses/:id` | soft delete with audit entry |
| GET | `/expenses/:id/audit` | edit history (append-only log) |
| POST | `/expenses/:id/receipt` | multipart receipt upload (jpeg/png/webp/heic/pdf, ≤ 8 MB) |
| DELETE | `/expenses/:id/receipt` | remove receipt |

### Balances & settlements — group-scoped
| Method | Path | Notes |
|---|---|---|
| GET | `/groups/:id/balances` | derived net balances; asserts Σ net = 0 |
| GET | `/groups/:id/settlements/suggested` | minimum plan with greedy fallback (`?algorithm=` supported) |
| GET | `/groups/:id/settlements` | group settlement history |

### Settlement lifecycle — `/settlements`
| Method | Path | Notes |
|---|---|---|
| POST | `/settlements` | record a payment; accepts an `idempotencyKey`; over-payment and self-payment rejected 422 |
| GET | `/settlements` | my settlements |
| GET | `/settlements/history` | history |
| POST | `/settlements/:id/confirm` | receiver confirms (duplicate confirm → 409) |
| POST | `/settlements/:id/reject` | receiver rejects |
| POST | `/settlements/:id/dispute` | receiver disputes |
| POST | `/settlements/:id/cancel` | initiator cancels |

### Me / analytics / notifications / meta
| Method | Path | Notes |
|---|---|---|
| GET | `/me/summary` | owed / receivable / net / recent activity |
| GET | `/analytics/overview` | totals + monthly summary (`?groupId=` optional) |
| GET | `/analytics/categories` | category breakdown |
| GET | `/analytics/members` | per-member paid vs consumed |
| GET | `/analytics/trend` | day/week/month trend |
| GET | `/analytics/dashboard` | combined dashboard payload |
| GET | `/analytics/reconcile/:id` | group-scoped reconciliation |
| GET | `/analytics/export.csv` | CSV export (only non-JSON response) |
| GET | `/notifications` | list (paginated, unread filter) |
| GET | `/notifications/unread-count` | |
| POST | `/notifications/read-all` | |
| PATCH | `/notifications/:id/read` | |
| DELETE | `/notifications/:id` | |
| GET | `/meta/categories` | expense category vocabulary |
| GET | `/meta/split-types` | split-type vocabulary |
| GET | `/health` | liveness (server root, no prefix, no auth) |

### Recurring expenses — mounted at both `/recurring` and `/groups/:id/recurring`
| Method | Path | Notes |
|---|---|---|
| GET | `/` | list rules |
| POST | `/` | create (group-scoped mount, or `groupId` in body) |
| GET | `/:recurringId` | detail |
| PATCH | `/:recurringId` | update |
| DELETE | `/:recurringId` | delete |
| POST | `/:recurringId/pause` | pause — missed dates are reported, never silently charged |
| POST | `/:recurringId/resume` | resume |
| GET | `/:recurringId/history` | generated occurrences |

### Budgets — mounted at both `/budgets` and `/groups/:id/budgets`
| Method | Path | Notes |
|---|---|---|
| GET | `/` | list budgets + progress |
| PUT | `/` | upsert (group total or per-category; 75/90/100 % alerts) |
| GET | `/:budgetId` | detail |
| DELETE | `/:budgetId` | delete |

### Insights — `/groups/:id/insights` (group-scoped)
| Method | Path | Notes |
|---|---|---|
| GET | `/` | rule-based spending insights for the group |

## Security

What is actually implemented (see `backend/src/app.js`, `middleware/`, `services/authService.js`):

- **JWT access tokens** (15 min default) + **refresh tokens**: 30-day random tokens stored
  only as SHA-256 digests, delivered in an `httpOnly`, `SameSite=strict` cookie scoped to
  the auth path, **rotated on every refresh** with **family-based reuse detection** — a
  rotated-out digest coming back revokes the whole family (`models/RefreshToken.js`).
- **bcrypt cost 12** for passwords (`models/User.js`).
- **Two-tier authorization**: `requireAuth` proves identity; `requireGroupMember` /
  `requireGroupRole('admin')` (`middleware/roleMiddleware.js`) prove membership/role
  against the group document. No endpoint trusts an id from the body without it.
- **Rate limiting** (`middleware/rateLimiters.js`): login (15-min window), register and
  password-reset (hourly windows); disabled under `RATE_LIMIT_TEST` in CI.
- **helmet**, **CORS allow-list** (`CORS_ORIGINS`), **express-mongo-sanitize**,
  compression, cookie-parser.
- **Upload allow-lists** (`middleware/uploadMiddleware.js`): receipts
  jpeg/png/webp/heic/pdf, avatars jpeg/png/webp, size cap `MAX_UPLOAD_BYTES` (8 MB
  default), randomised stored filenames; pluggable local/Cloudinary storage.
- **Transactions for multi-document financial writes** via `withTransaction()`
  (`config/db.js`), with a boot-time capability probe and graceful degradation.
- **Idempotency keys on settlements**: unique partial index on `idempotencyKey`, so a
  retried `POST /settlements` returns the original record instead of double-paying.
- **Unique partial occurrence keys** on expenses generated from recurring rules
  (`{ recurrenceId, occurrenceKey }` unique where `occurrenceKey` is a string) — a
  re-run of the generator cannot double-charge.
- **Append-only audit logs** (`models/ExpenseAuditLog.js`): every expense create/edit/
  delete writes an entry, exposed via `GET /expenses/:id/audit`.
- **Zod validation** on every body/query/params at the route layer; server-side money
  guards in the schemas (integer validators + share-sum hook) mean no endpoint trusts a
  client-computed amount.

## Testing

### Backend

```bash
cd backend
npm test               # jest --runInBand, all suites
npm run test:unit      # tests/unit — pure financial engine (money, splits, settlement solvers)
npm run test:integration  # tests/integration — supertest against mongodb-memory-server
npm run test:coverage
npm run smoke          # golden-path HTTP walk (scripts/smoke.mjs)
```

Integration tests run against an in-process MongoDB memory server; the financial-write
paths get a replica-set instance so transactions are exercised.

`npm run smoke` boots the **real API** (`src/server.js`) against an **ephemeral in-process
MongoDB replica set** (`MongoMemoryReplSet`), runs the seed against it, then walks the
golden path over HTTP: login → groups → balances → **asserts the ledger nets to zero
(Σ net = 0 minor units)** → expenses → settlements → suggested plan (verifies the
optimised plan beats the naive one, 3 vs 5 transactions on seed data) → `/me/summary` →
`/meta/*` → `/notifications` → `/analytics/dashboard` → invalid token rejected with 401.
13/13 checks must pass or it exits non-zero. Point it at a running instance with
`MONGODB_URI=... PORT=... node scripts/smoke.mjs`.

**Standalone-mongod constraint:** MongoDB transactions require a replica set. A plain
standalone `mongod` cannot run the multi-document financial writes. `backend/src/config/db.js`
therefore probes once at boot with a **real in-transaction write** (an empty transaction
commits even on a standalone, so the probe inserts and drops a document inside
`session.withTransaction`). If the probe fails, `withTransaction()` degrades to
single-document writes with `session: null` and logs a warning; services still assert
their invariants either way. Use `docker compose up -d` (or Atlas) for real transaction
support.

### Frontend

```bash
cd frontend
npx vitest run         # component/store tests (jsdom + Testing Library)
npm run build          # production build
```

### CI

`.github/workflows/ci.yml` runs on pushes to `master` and all PRs: backend install →
lint (if present) → unit tests → integration tests (with throwaway JWT secrets and
`RATE_LIMIT_TEST=0`) → the smoke run against an ephemeral replica set; and a separate
frontend job: install → `vitest run` → production build.

## Deployment

- **API** → Render, Railway or Fly.io (Node ≥ 20). Set `NODE_ENV=production`,
  `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (both ≥ 32 chars — boot fails
  without them), `TRUST_PROXY=true` (platform proxy), `COOKIE_SECURE=true`,
  `CORS_ORIGINS=<frontend URL>`, `CLIENT_URL`, `PUBLIC_URL`. `UPLOAD_DRIVER=local` needs a
  persistent volume; otherwise use `cloudinary`. Socket.IO: single instance, or add a
  Redis adapter for multiple instances.
- **Database** → MongoDB Atlas **replica set** (any M-tier cluster is one) so financial
  transactions work. Never deploy against a standalone mongod expecting atomic writes.
- **Frontend** → Vercel (or Netlify): build command `npm run build`, output `dist`, set
  `VITE_API_BASE_URL=https://<api-host>/api/v1` and `VITE_SOCKET_URL=https://<api-host>`
  at build time. SPA rewrite all routes to `index.html`.

## Team and contribution

Commits are authored per module; each owner is accountable for their module's services,
routes, validation and tests.

| Module | Owner | GitHub |
|---|---|---|
| Authentication & group management (users, JWT, groups, invitations, roles, profile) | Love Shah | [@LoveShah21](https://github.com/LoveShah21) |
| Expense entry & categorisation (splits, receipts, categories/tags, edit/delete + audit) | Tirth Gandhi | [@Tirth0604](https://github.com/Tirth0604) |
| Balance computation & settlement (derived balances, minimisation, settlement lifecycle) | Fahim Saiyad | [@fahim0-3](https://github.com/fahim0-3) |
| Analytics, notifications, recurring, budgets, insights, frontend shell | shared | — |

Contribution rules that follow from the architecture: money math goes in
`backend/src/algorithms/` (pure, unit-tested first, no mongoose/express imports);
services persist the result and assert invariants; routes stay thin; no endpoint may trust
a client-computed amount or an unverified group id. Progress is tracked in
`DEVELOPMENT_CHECKLIST.md`.

## Status / known gaps

Honest state as of 2026-11-02:

- Backend: 11 jest suites / 176 tests passing; `npm run smoke` 13/13; seed produces
  6 users / 4 groups / 27 expenses with every ledger netting exactly 0.
- Frontend: `npm run build` succeeds. **13 frontend tests in the Balances, Expenses and
  ExpenseForm suites are currently failing and being repaired** — treat `npx vitest run`
  as red until that lands.
- `backend/package.json` declares a `lint` script (`eslint src`) but the repo contains
  **no ESLint configuration**, so `npm run lint` fails until a config is added (CI runs it
  with `--if-present`, which still invokes the existing script).
- The API contract (`docs/03-api-contract.md`) lists a `receiptFileId` field on expense
  creation; the zod create-expense schema **strips/rejects it**. Receipts are attached
  after creation via multipart `POST /expenses/:id/receipt` instead.
