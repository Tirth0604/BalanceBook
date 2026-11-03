import { useMemo, useState } from 'react'
import { MailOpen } from 'lucide-react'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import Card from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { relativeTime } from '@/lib/dates'
import { useListNotificationsQuery, useMarkReadMutation } from '@/services/endpoints/notificationsApi'
import { useJoinByCodeMutation } from '@/services/endpoints/groupsApi'

/**
 * Invitations addressed to you arrive as `group_invitation` notifications whose
 * payload carries the group's invitation code — accepting means joining with it
 * (POST /groups/join), which is the same state transition the server performs.
 */
export function InvitationInbox() {
  const toast = useToast()
  const [hidden, setHidden] = useState([])
  const notificationsQuery = useListNotificationsQuery({ unread: true, limit: 20 })
  const [joinByCode, joinState] = useJoinByCodeMutation()
  const [markRead] = useMarkReadMutation()

  const invites = useMemo(
    () =>
      (notificationsQuery.data?.items ?? notificationsQuery.data ?? []).filter(
        (n) => n.type === 'group_invitation' && !hidden.includes(n.id),
      ),
    [notificationsQuery.data, hidden],
  )

  if (notificationsQuery.isError || invites.length === 0) return null

  const accept = async (notification) => {
    const code = notification.payload?.invitationCode ?? notification.payload?.code
    if (!code) {
      toast.error('This invitation has no code', 'Ask the group admin to resend the link.')
      return
    }
    try {
      const group = await joinByCode(code).unwrap()
      await markRead(notification.id).unwrap().catch(() => {})
      setHidden((list) => [...list, notification.id])
      toast.success('Invitation accepted', group?.name ? `You are in ${group.name}.` : 'The group is yours now.')
    } catch (err) {
      toast.error('Could not accept', err?.message || 'The invitation may have expired.')
    }
  }

  const decline = async (notification) => {
    try {
      await markRead(notification.id).unwrap()
    } catch {
      /* local dismiss still counts */
    }
    setHidden((list) => [...list, notification.id])
    toast.info('Invitation declined', 'Nothing was changed — you can accept later from notifications.')
  }

  return (
    <Card className="border-primary/30 bg-primary-muted/40">
      <ul className="divide-y divide-primary/15 p-1">
        {invites.map((notification) => (
          <li key={notification.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <MailOpen className="size-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{notification.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {notification.body} · {relativeTime(notification.createdAt)}
              </p>
            </div>
            <Badge tone="primary">invitation</Badge>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => decline(notification)} disabled={joinState.isLoading}>
                Decline
              </Button>
              <Button size="sm" onClick={() => accept(notification)} loading={joinState.isLoading}>
                Accept &amp; join
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default InvitationInbox
