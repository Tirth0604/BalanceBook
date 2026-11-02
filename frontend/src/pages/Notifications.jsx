import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, CheckCheck, Inbox, MailOpen, Trash2 } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/button'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import Skeleton, { SkeletonList } from '@/components/ui/skeleton'
import EmptyState from '@/components/ui/empty-state'
import ErrorState from '@/components/ui/error-state'
import Pagination from '@/components/ui/pagination'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import Tabs, { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useListNotificationsQuery,
  useUnreadCountQuery,
  useMarkReadMutation,
  useMarkAllReadMutation,
  useDeleteNotificationMutation,
} from '@/services/endpoints/notificationsApi'
import { useToast } from '@/components/ui/toast'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDate, relativeTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

/**
 * Notifications inbox. Real-time updates arrive via the socket bridge
 * (RootLayout invalidates the 'Notification' tag on `notification:new`);
 * 60 s polling is the graceful fallback when the socket is unavailable.
 */
export default function Notifications() {
  useDocumentTitle('Notifications')
  const toast = useToast()
  const [tab, setTab] = useState('all')
  const [page, setPage] = useState(1)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const queryParams = { page, limit: PAGE_SIZE, unread: tab === 'unread' ? 'true' : undefined }
  const list = useListNotificationsQuery(queryParams, { pollingInterval: 60000 })
  const unread = useUnreadCountQuery(undefined, { pollingInterval: 60000 })
  const [markRead] = useMarkReadMutation()
  const [markAllRead, { isLoading: markingAll }] = useMarkAllReadMutation()
  const [deleteNotification] = useDeleteNotificationMutation()

  const unreadCount = pickCount(unread.data)
  const items = list.data?.items ?? list.data ?? []
  const meta = list.data?.meta ?? {}
  const showSkeleton = useMinDuration(list.isLoading, 300)

  const open = async (n) => {
    if (!n.isRead) {
      try {
        await markRead(n.id).unwrap()
      } catch {
        /* badge state will correct on next poll/socket event */
      }
    }
    if (n.groupId) {
      // Navigating away; no toast needed.
    }
  }

  const onDelete = async (n) => {
    try {
      await deleteNotification(n.id).unwrap()
      toast.success('Notification deleted')
    } catch (err) {
      toast.error('Could not delete', err?.message)
    } finally {
      setConfirmDelete(null)
    }
  }

  const onMarkAll = async () => {
    try {
      await markAllRead().unwrap()
      toast.success('All notifications marked as read')
    } catch (err) {
      toast.error('Could not mark all read', err?.message)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Settlement requests, expense updates and invitations from across your groups."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground" aria-live="polite">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </span>
            <Button variant="outline" size="sm" onClick={onMarkAll} disabled={unreadCount === 0} loading={markingAll}>
              <CheckCheck className="size-4" aria-hidden />
              Mark all read
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1) }}>
        <TabsList aria-label="Filter notifications">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">
            Unread
            {unreadCount > 0 ? (
              <span className="ml-1.5 rounded-pill bg-danger px-1.5 text-[11px] font-semibold tabular text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {showSkeleton ? (
            <SkeletonList rows={5} />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={list.refetch} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={tab === 'unread' ? MailOpen : Inbox}
              title={tab === 'unread' ? 'Nothing unread' : 'No notifications yet'}
              description={
                tab === 'unread'
                  ? 'You have read everything — new activity will show up here.'
                  : 'When someone settles up, invites you, or spends in a group, it lands here.'
              }
              action={
                tab === 'unread' ? (
                  <Button variant="outline" size="sm" onClick={() => setTab('all')}>
                    See all notifications
                  </Button>
                ) : (
                  <Button asChild size="sm">
                    <Link to="/groups">Browse your groups</Link>
                  </Button>
                )
              }
            />
          ) : (
            <ul className="space-y-2" aria-live="polite">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationRow
                    notification={n}
                    onOpen={() => open(n)}
                    onDelete={() => setConfirmDelete(n)}
                  />
                </li>
              ))}
            </ul>
          )}

          {meta?.totalPages > 1 ? (
            <Pagination
              page={meta.page ?? page}
              totalPages={meta.totalPages}
              onPageChange={setPage}
              className="mt-6"
            />
          ) : null}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete this notification?"
        description={
          confirmDelete
            ? `"${confirmDelete.title}" will be removed from your inbox. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => onDelete(confirmDelete)}
      />
    </div>
  )
}

function NotificationRow({ notification: n, onOpen, onDelete }) {
  const body = (
    <div
      className={cn(
        'flex items-start gap-3 rounded-card border bg-card px-4 py-3.5 text-left transition-colors',
        n.isRead ? 'border-border hover:bg-muted/60' : 'border-primary/30 bg-primary-muted/30 hover:bg-primary-muted/50',
      )}
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-pill bg-muted">
        <BellRing className={cn('size-4', n.isRead ? 'text-caption' : 'text-primary')} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn('truncate text-sm', n.isRead ? 'font-medium text-muted-foreground' : 'font-semibold text-foreground')}>
            {n.title}
          </p>
          {!n.isRead ? <Badge tone="primary" className="shrink-0">New</Badge> : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{n.body}</p>
        <p className="mt-1 text-xs text-caption" title={formatDate(n.createdAt)}>
          {relativeTime(n.createdAt)}
        </p>
      </div>
    </div>
  )

  return (
    <div className="group flex items-center gap-1">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left rounded-card">
        {body}
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        aria-label={`Delete notification: ${n.title}`}
        className="shrink-0 text-caption transition-opacity group-hover:opacity-100 hover:text-danger-foreground focus-visible:opacity-100 sm:opacity-0"
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </div>
  )
}

function pickCount(data) {
  if (typeof data === 'number') return data
  return data?.unread ?? data?.count ?? 0
}
