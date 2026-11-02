import { Link } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/dates'
import Button from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import Spinner from '@/components/ui/spinner'
import { useUnreadCountQuery, useMarkAllReadMutation, useListNotificationsQuery } from '@/services/endpoints/notificationsApi'

/** Bell with unread badge + dropdown of the latest notifications. */
export function NotificationBell() {
  const { data: countData } = useUnreadCountQuery(undefined, { pollingInterval: 60000 })
  const { data: listData } = useListNotificationsQuery({ limit: 6 })
  const [markAllRead] = useMarkAllReadMutation()

  const unread =
    typeof countData === 'number'
      ? countData
      : (countData?.unread ?? countData?.count ?? 0)
  const items = listData?.items ?? listData ?? []

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <span className="relative">
            <Bell className="size-5" aria-hidden />
            {unread > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex min-h-4 min-w-4 items-center justify-center rounded-pill bg-danger px-1 text-[10px] font-semibold tabular text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            ) : null}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between normal-case tracking-normal">
          Notifications
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => markAllRead()}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <CheckCheck className="size-3.5" aria-hidden /> Mark all read
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {listData === undefined ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">You're all caught up.</p>
        ) : (
          items.slice(0, 6).map((n) => (
            <DropdownMenuItem key={n.id} asChild>
              <Link to={`/notifications`} className={cn('flex-col items-start gap-0.5 py-2', !n.isRead && 'bg-primary-muted/40')}>
                <span className="line-clamp-1 w-full text-[13px] font-medium text-foreground">{n.title}</span>
                <span className="line-clamp-2 w-full text-xs font-normal text-muted-foreground">
                  {n.body} · {relativeTime(n.createdAt)}
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/notifications" className="justify-center text-primary">
            View all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default NotificationBell
