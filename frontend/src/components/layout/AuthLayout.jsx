import { Link } from 'react-router-dom'
import { ArrowLeftRight, BadgeCheck, ShieldCheck, Zap } from 'lucide-react'
import { BrandMark } from './Sidebar'

/**
 * Split-screen auth layout: left brand panel with product proof, right form.
 * The brand panel hides below lg; forms are max-w on mobile.
 */
export function AuthLayout({ title, subtitle, children, footer, brandTitle = 'Split expenses. Settle up. Stay friends.' }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* brand panel */}
      <aside className="relative hidden flex-col justify-between bg-foreground p-12 text-background lg:flex dark:bg-muted">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-display text-lg font-semibold text-white">BalanceBook</span>
        </Link>

        <div className="max-w-md space-y-8">
          <h2 className="font-display text-[30px] font-semibold leading-tight text-white">
            {brandTitle}
          </h2>
          <ul className="space-y-4 text-[15px] leading-relaxed text-white/75">
            <li className="flex items-start gap-3">
              <ArrowLeftRight className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              Every rupee tracked to the paisa — splits are exact, never "close enough".
            </li>
            <li className="flex items-start gap-3">
              <Zap className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              Settlement optimisation collapses circular debts into the fewest payments.
            </li>
            <li className="flex items-start gap-3">
              <BadgeCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              Live balances, category insights and budgets for every group you share.
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              A full audit trail on every expense — no silent edits, ever.
            </li>
          </ul>
        </div>

        <p className="text-sm text-white/45">Tracked money, not messages.</p>
      </aside>

      {/* form panel */}
      <main className="flex flex-col justify-center px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <BrandMark />
            <span className="font-display text-base font-semibold">BalanceBook</span>
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
    </div>
  )
}

export default AuthLayout
