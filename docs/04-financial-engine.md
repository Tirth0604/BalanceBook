# BalanceBook — Financial Calculation Strategy

This file is the spec for `backend/src/algorithms/*` and `backend/src/utils/money.js`.
Those modules are **pure**: no mongoose, no express, no `Date.now()` inside a calculation.

## 1. Money representation

- One unit: integer minor units (paise for `INR`, cents for `USD`, …).
- `CURRENCIES[currency].decimals` → 2 for INR/USD/EUR/GBP/AED/SGD/AUD/CAD/CHF/SAR/QAR.
- `money.toMinor("3000.007", "INR")` → **throws** `MONEY_PRECISION` (more decimals than the
  currency allows). We never silently round user input for `exact` splits.
- `money.fromMinor(300000, "INR")` → `"3000.00"`.
- `money.format(300000, "INR")` → `"₹3,000.00"` (grouping per locale of the currency).
- Guards: `|minor| < 2^53`, no `NaN`, no floats reaching `*Minor` fields.
- All arithmetic is integer `+ - * /` with `Math.trunc`-style helpers; the only float that
  ever appears is an `exchangeRate`, and it is applied once at write time then stored.

## 2. Splitting (`splitter.js`)

```
splitEqual(totalMinor, participantIds[])          → [{userId, shareMinor}]
splitPercentage(totalMinor, [{userId, percentage}]) → [{userId, shareMinor, percentage}]
splitExact(totalMinor,    [{userId, shareMinor|string}]) → [{userId, shareMinor}]
```

**Largest-remainder (Hamilton) allocation** for equal/percentage:

1. `base = Math.floor(totalMinor * weight / Σweight)` per participant.
2. `remainder = totalMinor − Σbase` (always `0 ≤ remainder < n`).
3. Sort by fractional part `totalMinor*w/Σw − base` descending; ties broken by `userId`
   ascending (lexicographic) so results are deterministic across processes and replays.
4. Hand out one extra paisa to the first `remainder` participants.

`splitExact` performs **no** redistribution: it rejects (throws `SHARE_SUM_MISMATCH`)
whenever `Σ share ≠ totalMinor`, including negative or zero shares.

Percentage input is accepted with up to 2 decimals; `Σ percentage` must equal `100.00`
(`PERCENTAGE_SUM_INVALID` otherwise). Derived shares still sum to exactly `totalMinor`.

Edge cases with expected results (all covered by tests):

| case | expected |
|---|---|
| ₹100.00 equal among 3 | `3334, 3333, 3333` (paisa to lowest userId first when fractions tie) |
| ₹0.01 equal among 2 | `1, 0` — a zero share is legal, the payer keeps the residue |
| 33.33/33.33/33.34% of ₹5000 | `166650, 166650, 166700` — sums to 500000 |
| 1 participant | whole amount |
| duplicate participant id | `DUPLICATE_PARTICIPANT` |
| empty participants | `NO_PARTICIPANTS` |

## 3. Balance calculation (`balanceCalculator.js`)

```
computeNetBalances({ expenses, settlements, memberIds }) → [{ userId, netMinor }]
```

`net = Σ paid(groupAmountMinor by payer) − Σ share − Σ received(completed settlements)
      + Σ paid(completed settlements)`

Positive = is owed money (creditor). Negative = owes money (debtor).

Input is already-converted to the **group base currency** (`groupAmountMinor`); mixing
currencies inside one group ledger is not allowed by design.

The function asserts, and tests assert:
- `Σ net === 0` for a closed group (no partially-paid expenses).
- Members with no activity appear with `net === 0` (`status: 'settled'`).
- Non-member ids appearing in expenses are surfaced as `LEDGER_MEMBER_MISMATCH` rather
  than silently dropped (a real data-integrity bug shouldn't hide behind a zero).

## 4. Settlement optimisation

### 4.1 `greedySettlement.js`

Sort creditors and debtors, repeatedly match the largest debtor against the largest
creditor, `amount = min(|debt|, credit)`. Produces ≤ `n − 1` transfers, always valid,
`O(n log n)`. Used for large groups and as the correctness reference.

### 4.2 `minimumSettlement.js`

Exact minimum-transaction solver:
1. Partition balances into **zero-sum subsets** (backtracking / bitmask subset-sum) —
   maximising the number of independent zero-sum groups.
2. Inside each subset of size `k`, settle with `k − 1` transfers (greedy is provably
   optimal once a subset has no proper zero-sum sub-partition).
3. Total transactions = `n − (number of zero-sum parts)`.

Complexity is `O(2^n)` worst case, so:
- `MAX_EXACT_SIZE` (default 12, configurable) → beyond it, fall back to greedy and report
  `algorithm: "greedy"` with `fallbackReason: "GROUP_TOO_LARGE"`.
- Deterministic tie-breaking (smallest id first) so two runs on the same ledger give the
  same plan; memoised on `frozen balance multiset`.

### 4.3 Shared post-conditions — asserted by both solvers and by tests

- No self-transfer, no zero/negative amount, every `amountMinor` is a positive integer.
- Each debtor pays **exactly** their outstanding amount; each creditor receives exactly
  theirs; `Σ amounts in == Σ amounts out == Σ positive balances`.
- `minimum.transactions.length <= greedy.transactions.length` always.
- Already-settled groups return `transactions: []`.
- The 3-member spec example (A→B 500, A→C 500, B→C 500) reduces to a single
  `A → C 1000`, and `naiveTransactionCount = 3`, `reductionPercent = 66.67`.

## 5. Currency conversion (`currency.js`)

`convert(minor, from, to, rate)` → integer minor units in the target currency using
`Math.round(minor * rate * 10^(to.decimals − from.decimals))`. Rates are snapshots stored
on the expense (`exchangeRate`, `groupAmountMinor`) so historical balances never drift when
rates change. `rate` must be `> 0` and finite. Same-currency is an identity (no rounding).

## 6. Where rounding bias is allowed to exist

Only in the *allocation of indivisible paisa*. It is (a) deterministic, (b) always
conserves the total, (c) visible in the expense detail UI (each participant row shows the
exact paisa assigned). Re-running a split on unchanged inputs must reproduce identical
shares — that is what the tie-break rule guarantees.
