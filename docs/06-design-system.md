# BalanceBook — Design System (Tailwind v4 tokens)

Three layers: **primitive → semantic → component**. No component may use a raw hex value;
everything resolves through a token. Implement in `frontend/src/styles/theme.css`
(imported once from `frontend/src/index.css`).

## 1. Brand intent

A calm, trustworthy money room. Off-white canvas, deep navy ink, one indigo accent used
sparingly (primary actions, active nav, chart series 1). Financial direction is encoded by
**green = money coming to you, red = money going out** — never decorative. Cards are flat
with a hairline border and a whisper of shadow; the premium feel comes from spacing,
tabular numerals and 150 ms micro-interactions, not gradients.

## 2. Primitive palette

| token | value | role |
|---|---|---|
| `--bb-navy-900` | `#0B1524` | deepest ink / dark panels |
| `--bb-navy-800` | `#122036` | headings on light |
| `--bb-slate-600` | `#4A5B72` | secondary text |
| `--bb-slate-400` | `#8A99AD` | tertiary / captions |
| `--bb-line` | `#E3E8EF` | hairlines |
| `--bb-canvas` | `#F6F7F9` | page background |
| `--bb-surface` | `#FFFFFF` | cards, sheets |
| `--bb-surface-sunken` | `#F1F4F8` | wells, table headers, skeletons |
| `--bb-indigo-600` | `#4F46E5` | primary |
| `--bb-indigo-700` | `#4338CA` | primary hover |
| `--bb-indigo-50` | `#EEF0FE` | primary tint |
| `--bb-emerald-600` | `#059669` | receivable |
| `--bb-emerald-50` | `#ECFDF5` | receivable tint |
| `--bb-rose-600` | `#E11D48` | payable |
| `--bb-rose-50` | `#FFF1F3` | payable tint |
| `--bb-amber-500` | `#D97706` | warning / thresholds |
| `--bb-sky-500` | `#0284C7` | info |

Chart series (fixed order, ≤ 10 categories): indigo `#4F46E5`, teal `#0D9488`,
amber `#D97706`, rose `#E11D48`, violet `#7C3AED`, sky `#0284C7`, lime `#65A30D`,
slate `#64748B`, pink `#DB2777`, cyan `#0891B2`.

## 3. Semantic layer (`:root`, mirrored in `.dark`)

```css
--background        var(--bb-canvas)
--foreground        var(--bb-navy-800)
--card              var(--bb-surface)
--card-foreground   var(--bb-navy-800)
--muted             var(--bb-surface-sunken)
--muted-foreground  var(--bb-slate-600)
--border            var(--bb-line)
--input             var(--bb-line)
--ring              var(--bb-indigo-600)
--primary / --primary-foreground
--success/--success-muted/--success-foreground   (receivable)
--danger/--danger-muted/--danger-foreground      (payable)
--warning, --info
```

Dark mode is an inversion of the semantic layer only (`--background: #0B1524`,
`--surface: #12203B`, lines `#22304A`, accent lifted to indigo-400 `#8B93F8`). Components
never change; they consume semantics.

## 4. Typography

- `--font-display: "Sora"` — page titles, KPI numbers, empty-state headings (600/700).
- `--font-sans: "Inter"` — everything else.
- Money **always** gets `.tabular` (`font-variant-numeric: tabular-nums; letter-spacing:-0.01em`)
  so columns of rupee amounts align. Loaded via `<link>` in `index.html` with a system
  fallback stack; the app must look correct before fonts land (`font-display: swap`).

Scale (rem): `12 / 13 / 14(body) / 16(label-strong) / 20(section) / 24(page) / 30(KPI) / 38(hero)`.

## 5. Space, radius, elevation

- 4 px spacing grid: `4 8 12 16 20 24 32 40 56`. Card padding `20`, section gap `24`,
  page padding `24` (mobile `16`), sidebar `260 px`.
- Radius: control `10 px`, card `14 px`, sheet/dialog `18 px`, pill `999 px`.
- Elevation (never more than 3 layers):
  - `--shadow-sm: 0 1px 2px rgb(11 21 36 / .05)`
  - `--shadow-md: 0 2px 4px rgb(11 21 36 / .04), 0 8px 24px -12px rgb(11 21 36 / .12)`
  - `--shadow-lg: 0 12px 40px -12px rgb(11 21 36 / .22)`

## 6. Motion

`150 ms` colors/borders, `200 ms / cubic-bezier(.2,.8,.2,1)` transforms and entrances.
Skeleton shimmer is a `1.4s` linear background sweep. Respect
`@media (prefers-reduced-motion: reduce)` → all durations become `0ms`.

## 7. Money-screen UX rules (enforced in review)

1. Every amount shows sign + colour + optional arrow; `₹0.00` is rendered as a neutral
   `—` in muted, never green/red zero.
2. Amount columns are **right-aligned**, tabular, with the currency symbol rendered once in
   the column header when space is tight.
3. Never use colour alone: debt/credit pairs colour with an icon or the words
   "you owe" / "owed to you" (WCAG 1.4.1).
4. Numbers over `99,999` compact to `1.2L`/`3.4K` **only** in KPI tiles; tables and
   expense rows keep full precision to the paisa.
5. Destructive actions (delete expense, remove member, delete account) use
   `--danger` outline + a confirm dialog naming the consequence.
6. Every list has three states: skeleton (first paint, ≥ 300 ms so it doesn't flash),
   empty (illustrated icon + one action), error (message + retry button).
7. Forms: label above control, `aria-describedby` for helper/error, submit disabled while
   mutating, inline error on blur + on submit, never a toast for a field error.
8. Split-preview rows in Add Expense update as the user types (debounced 250 ms) and show
   the exact paisa each person carries, including the remainder paisa.
9. Touch targets ≥ 44 px; bottom nav on mobile for Dashboard / Groups / Add / Balances / Profile.
10. Focus ring always visible: `2px --ring` with `2px` offset.
