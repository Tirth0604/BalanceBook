# BalanceBook — System Architecture

## 1. Shape of the system

```
balancebook/
├── backend/          Express + Mongoose REST/WS API  (port 5000, prefix /api/v1)
├── frontend/         Vite + React SPA                (port 5173)
├── docs/             architecture / schema / api contract / engine notes
└── docker-compose.yml  local MongoDB (replica set, so transactions work)
```

Two npm projects, no shared runtime code. The API contract in `docs/03-api-contract.md`
is the only coupling between them, so the teams can build in parallel.

## 2. Layering (backend)

```
routes/     thin: HTTP verb + path + auth/validation middleware only
controllers translate req <-> DTO, no business rules
services    business logic, transactions, invariants — the only layer that touches models
models      Mongoose schemas, indexes, hooks
algorithms/ PURE functions, zero I/O (money, splits, balances, settlement solvers)
utils/      ApiError / ApiResponse / asyncHandler / money / csv / pagination
middleware/ auth, role, validation, upload, error, notFound
sockets/    Socket.IO hub (rooms = `user:<id>`, `group:<id>`)
```

The rule that keeps this maintainable: **`algorithms/` never imports mongoose, express or
config.** Anything that can be computed is computed there and unit-tested without a
database. Services persist the result of those pure functions.

## 3. Money pipeline (single source of truth)

1. Client sends amounts as decimal **strings** (`"3000.00"`) plus a currency code.
2. `money.toMinor()` converts to an integer minor unit (paise / cents). Never `parseFloat`
   arithmetic downstream.
3. `splitter.js` distributes the integer total across participants with the
   **largest-remainder method**, so `sum(shares) === totalMinor` exactly.
4. `balanceCalculator.js` derives each member's net balance from **expense shares minus
   confirmed settlements**. Balances are *derived*, never stored as an editable field.
5. `greedySettlement.js` / `minimumSettlement.js` turn those balances into the smallest set
   of "who pays whom" transfers.
6. Every write path runs inside a MongoDB transaction when one is available
   (`withTransaction()` helper degrades gracefully on standalone mongod, and asserts the
   group invariant afterwards).

## 4. Real-time

Socket.IO shares the HTTP server. On JWT connect the socket joins `user:<id>` and
`group:<id>` rooms for every group the user belongs to. Notification and balance-changed
events are emitted from services through `sockets/hub.js`, never from controllers.

## 5. AuthN / AuthZ

- Access token: short-lived JWT (15 min) in `Authorization: Bearer`.
- Refresh token: 30-day random token, SHA-256 hashed at rest in MongoDB, delivered in an
  `httpOnly` `SameSite=strict` cookie scoped to `/api/v1/auth`. Rotation on every refresh.
- Passwords: bcrypt cost 12.
- Authorization is two-tier: global middleware proves *who you are*; `requireGroupRole()`
  proves you are a member (or admin) of the group in the request. No endpoint may trust an
  id coming from the body without this check.

## 6. Configuration

Everything comes from `backend/.env` (see `backend/.env.example`). Secrets are never
committed; production requires `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and
`MONGODB_URI` to be present or boot fails loudly (`config/env.js` validates with zod).

## 7. Deployment

- API → Render / Railway (Node 20+), MongoDB → Atlas replica set (transactions supported).
- SPA → Vercel/Netlify static build with `VITE_API_BASE_URL` pointing at the API.
- Socket.IO needs sticky sessions disabled (single instance) or a redis adapter (multi).
- `docker-compose.yml` provides a local single-node replica set for development.
