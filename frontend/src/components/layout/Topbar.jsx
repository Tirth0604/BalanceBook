import { useLocation, useNavigate } from 'react-router-dom'
import { Menu } from 'lucide-react'
import SearchInput from '@/components/ui/search-input'
import Button from '@/components/ui/button'
import GroupSwitcher from './GroupSwitcher'
import NotificationBell from './NotificationBell'
import UserMenu from './UserMenu'

/**
 * Sticky application topbar: mobile menu trigger + brand, contextual search,
 * and the account/notification cluster. Extracted from AppShell so the header
 * is its own primitive and stays ≥44px touch-friendly.
 */
export function Topbar({ onOpenMobileNav }) {
  const location = useLocation()
  const navigate = useNavigate()
  const showSearch = location.pathname.startsWith('/groups')

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card/95 px-4 backdrop-blur-sm sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation menu"
        onClick={onOpenMobileNav}
      >
        <Menu className="size-5" />
      </Button>
      <p className="font-display text-sm font-semibold md:hidden">BalanceBook</p>

      <div className="hidden min-w-0 flex-1 items-center sm:flex lg:max-w-96">
        {showSearch ? (
          <SearchInput
            className="w-full"
            ariaLabel="Search groups"
            placeholder="Search groups…"
            onSearch={(q) => navigate(`/groups?search=${encodeURIComponent(q)}`)}
          />
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <GroupSwitcher />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  )
}

export default Topbar
