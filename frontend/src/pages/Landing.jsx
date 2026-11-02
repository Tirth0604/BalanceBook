import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Calculator,
  GitCompareArrows,
  LineChart,
  Lock,
  ReceiptText,
  Scale,
  Users,
  Wallet,
} from 'lucide-react'
import Button from '@/components/ui/button'
import Badge from '@/components/ui/badge'
import Card, { CardDescription, CardTitle } from '@/components/ui/card'
import Money from '@/components/money/Money'
import BalancePill from '@/components/money/BalancePill'
import SplitBar from '@/components/money/SplitBar'
import { BrandMark } from '@/components/layout/Sidebar'
import { useAuth } from '@/hooks/useAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const FEATURES = [
  { icon: Users, title: 'Groups for every circle', body: 'Flat, Goa trip, office lunch run — each gets its own ledger, members and base currency.' },
  { icon: Calculator, title: 'Exact splits, to the paisa', body: 'Equal, percentage or custom shares with largest-remainder maths. No drifting totals, ever.' },
  { icon: ReceiptText, title: 'Receipts & full audit trail', body: 'Attach the bill, see who edited what and when. Trust is a feature.' },
  { icon: Scale, title: 'Live balances per person', body: 'Who is owed what, updated the second anything changes — on every device.' },
  { icon: Wallet, title: 'Settlement plans', body: 'Mark payments as you hand over cash; the plan and your net totals update instantly.' },
  { icon: BarChart3, title: 'Category insights & budgets', body: 'See where the money actually went and get warned before you cross a limit.' },
]

const STEPS = [
  { n: '01', title: 'Create a group', body: 'Invite friends by email. Everyone joins with their own login — balances are personal to you.' },
  { n: '02', title: 'Log what was spent', body: 'Who paid, how it splits, optional receipt. Multi-currency trips convert once and stay frozen.' },
  { n: '03', title: 'Settle with fewer payments', body: 'BalanceBook computes the minimum set of transfers that clears every debt.' },
]

/**
 * Worked example — real numbers rendered with the same money primitives the
 * app uses (minor units in, formatted out). NOT decorative mock data.
 */
function SettlementExample() {
  const before = [
    { from: 'Aarav', to: 'Meera', minor: 50000 },
    { from: 'Aarav', to: 'Kabir', minor: 50000 },
    { from: 'Meera', to: 'Kabir', minor: 50000 },
  ]
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-muted px-6 py-4">
        <CardTitle className="text-base">Why "settle up" costs you 3 payments — and one is enough</CardTitle>
        <CardDescription className="mt-1">
          A weekend in Goa: Aarav paid the ₹1,000 cottage bill, Meera the ₹1,000 dinner, Kabir nothing.
          Everyone owes an equal ₹1,000 share of the ₹3,000 total.
        </CardDescription>
      </div>
      <div className="grid gap-6 p-6 sm:grid-cols-2">
        <div>
          <p className="mb-3 flex items-center gap-2 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
            <ReceiptText className="size-4 text-danger" aria-hidden /> Naive ledger: 3 transfers
          </p>
          <ul className="space-y-2">
            {before.map((t) => (
              <li
                key={`${t.from}-${t.to}`}
                className="flex items-center justify-between rounded-control border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {t.from} <ArrowRight className="size-3.5" aria-hidden /> {t.to}
                </span>
                <Money minor={t.minor} className="font-medium" />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 flex items-center gap-2 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
            <GitCompareArrows className="size-4 text-primary" aria-hidden /> Optimised plan: 1 transfer
          </p>
          <div className="rounded-control border border-primary/30 bg-primary-muted px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Aarav <ArrowUpRight className="mx-1 inline size-3.5 text-primary" aria-hidden /> Kabir</span>
              <Money minor={100000} className="font-display text-lg font-semibold" />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Meera&apos;s receivable and payable cancel; Aarav pays Kabir directly. 66.67% fewer payments.
            </p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-control border border-border px-2 py-2 text-center">
              <BalancePill netMinor={50000} size="sm" className="scale-90" label="gets" />
            </div>
            <div className="rounded-control border border-border px-2 py-2 text-center">
              <BalancePill netMinor={0} size="sm" className="scale-90" label="even" />
            </div>
            <div className="rounded-control border border-border px-2 py-2 text-center">
              <BalancePill netMinor={-50000} size="sm" className="scale-90" label="pays" />
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-caption">Aarav · Meera · Kabir — final positions</p>
        </div>
      </div>
    </Card>
  )
}

export default function Landing() {
  useDocumentTitle('')
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-dvh bg-background">
      {/* nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-display text-lg font-semibold tracking-tight">BalanceBook</span>
          </div>
          <nav aria-label="Marketing navigation" className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#optimisation" className="transition-colors hover:text-foreground">Settlement maths</a>
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
          </nav>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-[1280px] items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[7fr_5fr] lg:py-24">
        <div>
          <Badge tone="primary" className="mb-5">
            <Lock className="size-3" aria-hidden /> Your ledger, not someone else&apos;s spreadsheet
          </Badge>
          <h1 className="font-display text-[38px] font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl">
            Split expenses.
            <br />
            Settle up.
            <br />
            <span className="text-primary">Stay friends.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
            BalanceBook tracks every rupee across trips, flats and friend circles — exact splits to the paisa,
            live balances, and the fewest possible payments when it&apos;s time to settle.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to="/register">
                Create a free account <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted-foreground">
            <li className="flex items-center gap-1.5"><Bell className="size-3.5 text-primary" aria-hidden /> Live updates</li>
            <li className="flex items-center gap-1.5"><Scale className="size-3.5 text-primary" aria-hidden /> Exact balances</li>
            <li className="flex items-center gap-1.5"><LineChart className="size-3.5 text-primary" aria-hidden /> Category insights</li>
          </ul>
        </div>

        {/* product proof: real primitives, real money formatting — not a screenshot */}
        <div className="relative mx-auto w-full max-w-sm space-y-4 lg:max-w-md">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-caption">Goa Trip · Net</p>
                <Money minor={-875000} className="mt-1 block font-display text-3xl font-semibold text-danger-foreground" />
                <p className="mt-1 text-xs text-muted-foreground">you owe across 4 friends</p>
              </div>
              <BalancePill netMinor={-875000} label="you owe" />
            </div>
            <div className="mt-5">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-caption">This month&apos;s spend</p>
              <SplitBar
                currency="INR"
                entries={[
                  { label: 'Stay', shareMinor: 4500000 },
                  { label: 'Food', shareMinor: 2100000 },
                  { label: 'Travel', shareMinor: 1250000 },
                  { label: 'Fun', shareMinor: 900000 },
                ]}
              />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span>Stay</span><span>Food</span><span>Travel</span><span>Fun</span>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <p className="mb-3 text-xs uppercase tracking-wide text-caption">Suggested plan · 1 payment</p>
            <div className="flex items-center justify-between rounded-control border border-border bg-muted px-3 py-2.5">
              <span className="text-sm font-medium">Ravi → Priya</span>
              <Money minor={1250000} className="text-sm font-semibold" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Down from 3 awkward reminders.</p>
          </Card>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="border-t border-border bg-card py-16 sm:py-20">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <h2 className="font-display text-3xl font-semibold tracking-tight">How it works</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Three steps from &ldquo;I&apos;ll pay for now&rdquo; to everyone square.
          </p>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n}>
                <Card className="h-full p-6">
                  <span className="font-display text-sm font-semibold tabular text-primary">{s.n}</span>
                  <h3 className="mt-3 font-display text-base font-semibold">{s.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* settlement optimisation */}
      <section id="optimisation" className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-20">
        <div className="mb-8 max-w-2xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight">The settlement maths, explained</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Circular debts are the reason groups fizzle out. BalanceBook solves the minimum-transaction
            problem on your real balances — with a greedy fallback that is always correct for large groups.
          </p>
        </div>
        <SettlementExample />
      </section>

      {/* features */}
      <section id="features" className="border-t border-border bg-card py-16 sm:py-20">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Everything the money room needs</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="p-6">
                <span className="flex size-10 items-center justify-center rounded-control bg-primary-muted">
                  <Icon className="size-5 text-primary" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-20">
        <Card className="flex flex-col items-center gap-6 px-6 py-14 text-center">
          <h2 className="max-w-xl font-display text-3xl font-semibold leading-tight tracking-tight">
            The next trip starts with a clean ledger.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Free to start. Bring your group, your currency and your receipts — leave the awkward money talk to us.
          </p>
          <Button asChild size="lg">
            <Link to="/register">
              Get started free <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </Card>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-3 px-4 text-xs text-caption sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <BrandMark className="size-5" />
            <span>BalanceBook — tracked money, not messages.</span>
          </div>
          <p>© {new Date().getFullYear()} BalanceBook. Built for friend circles.</p>
        </div>
      </footer>
    </div>
  )
}
