# BalanceBook — REST API Contract (v1)

Base URL: `/api/v1` · Auth: `Authorization: Bearer <accessToken>` unless marked public.

## Envelope — every endpoint, no exceptions

```jsonc
// success
{ "success": true, "data": <payload>, "meta": { "page": 1, "limit": 20, "total": 143, "totalPages": 8 } }
// error (meta omitted when not paginated)
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Shares must sum to the total.", "details": [ { "path": "participants", "message": "..." } ] } }
```

HTTP codes: 200, 201 created, 204 no content, 400 bad request, 401 unauthenticated,
403 forbidden / not a member, 404 not found, 409 conflict (duplicate, unsettled balance,
idempotency), 422 semantic validation, 429 rate limited, 500 unexpected.

Error codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`RATE_LIMITED`, `FINANCIAL_INVARIANT_VIOLATION`, `UNKNOWN_CURRENCY`, `UPLOAD_INVALID`,
`INTERNAL_ERROR`.

## Money & dates over the wire

- Amounts: `*Minor` integers (paise) **and** a parallel human string, e.g.
  `{ "totalMinor": 300000, "amount": "3000.00", "currency": "INR", "display": "₹3,000.00" }`.
  Clients send decimal strings; the server converts. Clients never send `*Minor` for
  splits they did not compute — for `exact` splits they send decimal strings per member and
  the server converts + validates.
- Dates: ISO-8601 UTC strings. `expenseDate` may be date-only (`2026-11-02`).

## Shared DTO shapes

```jsonc
UserRef   { "id", "name", "email", "avatarUrl" }
Member    { "user": UserRef, "role": "admin|member", "joinedAt", "status" }
Group     { "id", "name", "description", "category", "imageUrl", "baseCurrency",
            "createdBy": UserRef, "members": [Member], "memberCount",
            "invitationCode", "isArchived", "createdAt",
            "myRole": "admin|member",            // for the requesting user
            "totals": { "expenseMinor", "settlementMinor", "netMinor" } }  // optional block
Expense   { "id", "group": { "id","name","baseCurrency" }, "title", "description",
            "category", "tags", "totalMinor", "amount", "currency", "groupAmountMinor",
            "exchangeRate", "paidBy": UserRef, "splitType",
            "participants": [ { "user": UserRef, "shareMinor", "share", "percentage", "isPayer" } ],
            "receipt": { "url","mimeType","sizeBytes","fileName" } | null,
            "expenseDate", "notes", "recurrenceId", "createdBy": UserRef,
            "createdAt", "updatedAt", "editable": Boolean, "deletable": Boolean }
Balance   { "user": UserRef, "netMinor", "net": "1000.00", "currency",
            "owedToMeMinor", "iOweMinor", "status": "creditor|debtor|settled",
            "displayName", "isMe": Boolean }
Suggested { "groupId", "currency", "algorithm": "minimum|greedy",
            "transactions": [ { "from": UserRef, "to": UserRef, "amountMinor", "amount" } ],
            "transactionCount", "naiveTransactionCount", "reductionPercent" }
Settlement{ "id", "group": {...}, "payer": UserRef, "receiver": UserRef,
            "amountMinor", "amount", "currency", "status", "paymentMethod", "note",
            "proofUrl", "initiatedBy": UserRef, "initiatedAt",
            "confirmedAt", "confirmedBy", "rejectedReason",
            "canConfirm": Boolean, "canReject": Boolean }   // server-computed permissions
Notif     { "id", "type", "title", "body", "groupId", "isRead", "readAt", "createdAt", "payload" }
```

---

## Auth — `Love Shah` (public: register, login, refresh, forgot/reset)

| Method | Path | Body / Query | `data` |
|---|---|---|---|
| POST | `/auth/register` | `{name,email,password,preferredCurrency?}` | `{user, accessToken}` + refresh cookie |
| POST | `/auth/login` | `{email,password}` | `{user, accessToken}` + refresh cookie |
| POST | `/auth/refresh` | cookie | `{accessToken, user}` (rotates cookie) |
| POST | `/auth/logout` | – | `null` (revokes family) |
| POST | `/auth/forgot-password` | `{email}` | `{resetUrl?}` (dev echo only when `NODE_ENV=development`) |
| POST | `/auth/reset-password` | `{token,password}` | `{user}` |
| POST | `/auth/verify-email` | `{token}` | `{user}` |
| GET | `/auth/me` | – | `{user}` |

`user` = `{ id, name, email, phone, avatarUrl, preferredCurrency, isEmailVerified,
notificationPreferences, createdAt, lastLoginAt }` — **never** `password`.
Rate limits: `/auth/login` 10/15min per IP+email, `/auth/register` 5/hour per IP.

## Users & Groups — `Love Shah`

| Method | Path | Notes |
|---|---|---|
| GET | `/users/me` | profile |
| PATCH | `/users/me` | `{name?,phone?,preferredCurrency?,notificationPreferences?}` |
| POST | `/users/me/avatar` | multipart `file` → `{user}` |
| POST | `/users/me/password` | `{currentPassword,newPassword}` |
| DELETE | `/users/me` | `{confirm:"DELETE"}` → soft delete + revoke tokens |
| GET | `/users/search?q=` | public-user lookup for invites (email exact / name prefix, max 10) |
| POST | `/groups` | `{name,description?,category?,baseCurrency?,members?:[email]}` → 201 |
| GET | `/groups` | `?archived=false&category=&search=&page=&limit=&sort=` |
| GET | `/groups/:id` | 403 if not an active member |
| PATCH | `/groups/:id` | admin only |
| DELETE | `/groups/:id` | admin only → archives (`{isArchived:true}`) |
| POST | `/groups/:id/invites` | admin only `{emails:[...]}` → `{invited:[],already:[],notFound:[]}` |
| POST | `/groups/:id/invites/:inviteId/accept` | invitee |
| POST | `/groups/:id/invites/:inviteId/decline` | invitee |
| POST | `/groups/join` | `{code}` → `{group}` |
| POST | `/groups/:id/members/:userId/remove` | admin; 409 `CONFLICT` if that member's net ≠ 0 |
| POST | `/groups/:id/members/:userId/role` | admin `{role}` |
| GET | `/groups/:id/invites` | admin; pending + sent |

## Expenses — `Tirth Gandhi`

| Method | Path | Notes |
|---|---|---|
| POST | `/groups/:groupId/expenses` | create, 201 |
| GET | `/expenses` | cross-group list for the caller. `?page&limit&sort=-expenseDate&search=&category=&groupId=&paidBy=&tag=&from=&to=&minAmount=&maxAmount=` |
| GET | `/expenses/:id` | member-only |
| PATCH | `/expenses/:id` | payer or group admin; full re-split allowed |
| DELETE | `/expenses/:id` | payer or admin; soft delete + audit |
| GET | `/expenses/:id/audit` | members; audit trail |
| POST | `/expenses/:id/receipt` | multipart `file` (jpg/png/webp/pdf ≤ 8 MB) → `{expense}` |
| DELETE | `/expenses/:id/receipt` | → `{expense}` |
| GET | `/meta/categories` | `{categories:[{value,label,icon}]}` |
| GET | `/meta/split-types` | `{splitTypes:[...]}` |

Create body:

```jsonc
{ "title": "Goa dinner", "description": "", "category": "food",
  "tags": ["beach"], "amount": "3000.00", "currency": "INR",
  "expenseDate": "2026-11-01", "paidBy": "<userId>", "splitType": "equal",
  "participants": [ { "userId": "<id>", "share": "1000.00", "percentage": 33.34 } ],
  "notes": "", "receiptFileId": "<optional prior upload id>" }
```

Validation matrix (enforced in `expenseService`, mirrored by zod):
- `equal`: `participants` ⊆ active members, `paidBy` ∈ participants unless intentionally
  excluded; server computes shares, client-sent shares ignored.
- `exact`: every participant needs `share`; `Σ share` must equal `amount` to the paisa →
  else 422 `VALIDATION_ERROR` with `details[0].path = "participants"`.
- `percentage`: every participant needs `percentage`; `Σ` must be `100` (±0.00 tolerance on
  2-decimal input); shares derived by largest-remainder.
- Remainder paisa go to the largest shares first, ties by `userId` ascending — deterministic.

## Balances & Settlements — `Fahim Saiyad`

| Method | Path | Notes |
|---|---|---|
| GET | `/groups/:id/balances` | `[Balance]` + `{ "groupTotalMinor", "isSettledUp" }` in `meta` |
| GET | `/groups/:id/settlements/suggested` | `{Suggested}`; `?algorithm=minimum|greedy&maxSize=12` |
| GET | `/groups/:id/settlements` | list w/ `?status=` |
| POST | `/settlements` | `{groupId,payerId,receiverId,amount,currency,paymentMethod,note?,idempotencyKey?}` → 201, status `awaiting_confirmation` |
| POST | `/settlements/:id/confirm` | **receiver only** → `completed` |
| POST | `/settlements/:id/reject` | **receiver only** `{reason}` → `rejected` |
| POST | `/settlements/:id/dispute` | payer or receiver → `disputed` |
| POST | `/settlements/:id/cancel` | initiator, while unconfirmed |
| GET | `/settlements` | all for caller `?direction=to_me|from_me&status=&groupId=&page=` |
| GET | `/settlements/history` | completed, newest first, grouped by month |
| GET | `/me/summary` | `{ totalOwedMinor, totalOwedToMeMinor, netMinor, currency, groupCount, pendingSettlements }` |

Rules: an over-payment (amount > payer's outstanding) → 422.
Confirming twice → 409. Same `idempotencyKey` → 200 with the original settlement.
Self-payment → 422. Non-member on either side → 403.

## Analytics / Notifications / Advanced

| Method | Path | Module |
|---|---|---|
| GET | `/analytics/overview?groupId=&from=&to=&range=7d|30d|this_month|last_month|this_year|custom` | Fahim/analytics |
| GET | `/analytics/categories?groupId=&from=&to=` | category pie + consumed vs paid |
| GET | `/analytics/members?groupId=&from=&to=` | contribution bars |
| GET | `/analytics/trend?groupId=&granularity=day|week|month&from=&to=` | line chart |
| GET | `/analytics/export.csv?groupId=&from=&to=` | CSV download |
| GET | `/groups/:id/insights` | rule-based smart insights |
| GET | `/notifications?unread=true&page=` | |
| GET | `/notifications/unread-count` | |
| PATCH | `/notifications/:id/read` / `POST /notifications/read-all` | |
| DELETE | `/notifications/:id` | |
| POST | `/groups/:id/recurring` · GET `/groups/:id/recurring` · PATCH/DELETE `/recurring/:id` · POST `/recurring/:id/pause` · `/resume` · GET `/recurring/:id/history` | recurring |
| PUT `/groups/:id/budgets` · GET `/groups/:id/budgets` · DELETE `/budgets/:id` | budgets; response includes `spentMinor`, `remainingMinor`, `percentUsed`, `thresholdHit` |

## Socket.IO

Namespace `/`, auth via `{ auth: { token } }`. Rooms `user:<id>`, `group:<id>`.
Server → client events: `notification:new`, `balance:changed` (`{groupId}`),
`expense:created`, `expense:updated`, `expense:deleted`, `settlement:updated`,
`invitation:new`, `presence:updated`.
Client → server: `group:subscribe`, `group:unsubscribe` (membership-checked).
