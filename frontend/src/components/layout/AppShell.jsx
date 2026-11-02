import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAppSelector } from '@/store/hooks'
import { MobileSidebarOverlay, Sidebar } from './Sidebar'
import MobileTabBar from './MobileTabBar'
import Topbar from './Topbar'

/** App frame: sidebar (desktop) / drawer (mobile) + topbar + content + tab bar. */
export function AppShell() {
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed)
  const [drawer, setDrawer] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar />
      <MobileSidebarOverlay open={drawer} onClose={() => setDrawer(false)} />

      <div
        className={
          collapsed
            ? 'transition-[padding] duration-[var(--bb-motion-entrance)] md:pl-[72px]'
            : 'transition-[padding] duration-[var(--bb-motion-entrance)] md:pl-[260px]'
        }
      >
        <Topbar onOpenMobileNav={() => setDrawer(true)} />

        <main
          className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-6 sm:px-6 md:pb-10 md:pt-8 lg:px-8"
          key={location.pathname}
        >
          <Outlet />
        </main>
      </div>

      <MobileTabBar />
    </div>
  )
}

export default AppShell
