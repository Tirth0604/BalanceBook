import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Scale, User, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Mobile bottom tab bar (docs/06 UX rule 9) — 44px+ targets.
 * Add-Expense lives inside the Groups flow for now (that screen is built by
 * the expenses agent); the four tabs we own are real routes.
 */
const TABS = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/balances', label: 'Balances', icon: Scale },
  { to: '/profile', label: 'Profile', icon: User },
]

export function MobileTabBar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-[var(--bb-motion-colors)]',
              isActive ? 'text-primary' : 'text-caption hover:text-foreground',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className="size-5" aria-hidden strokeWidth={isActive ? 2.4 : 2} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default MobileTabBar
