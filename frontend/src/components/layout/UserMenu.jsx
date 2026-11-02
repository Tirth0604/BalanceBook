import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Moon, Settings, Sun, User } from 'lucide-react'
import Avatar from '@/components/ui/avatar'
import Button from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { toggleTheme } from '@/store/uiSlice'
import { useAuth } from '@/hooks/useAuth'
import { useAppLogout } from '@/components/common/useAppLogout'

/** Topbar avatar menu: profile, settings, theme toggle, logout. */
export function UserMenu() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const theme = useAppSelector((state) => state.ui.theme)
  const { user } = useAuth()
  const signOut = useAppLogout()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu" className="rounded-pill">
          <Avatar name={user?.name ?? '?'} src={user?.avatarUrl} size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <div className="flex items-center gap-2.5 py-1">
            <Avatar name={user?.name ?? '?'} src={user?.avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <User aria-hidden /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings aria-hidden /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => dispatch(toggleTheme())}>
          {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onSelect={async () => {
            await signOut()
            navigate('/login', { replace: true })
          }}
        >
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default UserMenu
