import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Wallet,
  ChevronLeft,
  HandCoins,
  LayoutDashboard,
  Lightbulb,
  ListFilter,
  ReceiptText,
  Settings,
  Scale,
  Users,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setSidebarCollapsed, toggleSidebar } from '@/store/uiSlice'
import { useListGroupsQuery } from '@/services/endpoints/groupsApi'
import Money from '@/components/money/Money'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/groups', label: 'My Groups', icon: Users, exact: true },
  { to: '/expenses', label: 'Expenses', icon: ReceiptText },
  { to: '/balances', label: 'Balances', icon: Scale },
  { to: '/settlements', label: 'Settlements', icon: HandCoins },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/budgets', label: 'Budgets', icon: Wallet },
  { to: '/insights', label: 'Insights', icon: Lightbulb },
  { to: '/notifications', label: 'Notifications', icon: ListFilter },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Profile', icon: UserRound, exact: true },
]

export function Sidebar({ mobileOpen = false, onNavigate }) {
  const dispatch = useAppDispatch()
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed)
  const { data } = useListGroupsQuery({ archived: 'false', limit: 50, sort: '-createdAt' })
  const groups = data?.items ?? data ?? []
  const location = useLocation()

  const width = collapsed ? 'w-[72px]' : 'w-[260px]'

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-card transition-[width] duration-[var(--bb-motion-entrance)] md:flex',
        width,
        mobileOpen && 'flex animate-slide-right',
      )}
      aria-label="Primary navigation"
    >
      {/* brand */}
      <div className={cn('flex h-16 items-center gap-2.5 border-b border-border px-4', collapsed && 'justify-center px-0')}>
        <BrandMark />
        {!collapsed ? (
          <span className="font-display text-[17px] font-semibold tracking-tight">BalanceBook</span>
        ) : null}
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <li key={to}>
              <NavLink
                to={to}
                title={collapsed ? label : undefined}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-[var(--bb-motion-colors)]',
                    collapsed && 'justify-center px-0',
                    isActive || (!exact && location.pathname.startsWith(to))
                      ? 'bg-primary-muted text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
                aria-label={label}
              >
                <Icon className="size-4.5 shrink-0" aria-hidden />
                {!collapsed ? label : null}
              </NavLink>
            </li>
          ))}
        </ul>

        {!collapsed && groups.length > 0 ? (
          <div className="mt-6">
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-caption">
              Your groups
            </p>
            <ul className="space-y-0.5">
              {groups.slice(0, 6).map((g) => (
                <li key={g.id}>
                  <NavLink
                    to={`/groups/${g.id}`}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex h-9 items-center gap-2 rounded-control px-3 text-[13px] transition-colors',
                        isActive ? 'bg-primary-muted text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )
                    }
                  >
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    {g.totals?.netMinor != null ? (
                      <Money
                        minor={g.totals.netMinor}
                        currency={g.baseCurrency}
                        compact
                        mutedWhenZero
                        className="text-[11px] text-caption"
                      />
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </nav>

      <div className="hidden border-t border-border p-3 md:block">
        <button
          type="button"
          onClick={() => dispatch(toggleSidebar())}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-control px-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft className={cn('size-4 transition-transform', collapsed && 'rotate-180')} aria-hidden />
          {!collapsed ? 'Collapse' : null}
        </button>
      </div>
    </aside>
  )
}

export function BrandMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7 shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M9 21.5 15.5 9l6.5 12.5" stroke="var(--primary-foreground)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M11.4 17.5h8.2" stroke="var(--primary-foreground)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

/** Mobile drawer wrapper reuses the same Sidebar content without collapse. */
export function MobileSidebarOverlay({ open, onClose }) {
  const dispatch = useAppDispatch()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <button
        type="button"
        aria-label="Close navigation"
        className="absolute inset-0 h-full w-full bg-navy-900/45"
        onClick={() => {
          onClose()
          dispatch(setSidebarCollapsed(false))
        }}
      />
      <Sidebar mobileOpen onNavigate={onClose} />
    </div>
  )
}

export default Sidebar
