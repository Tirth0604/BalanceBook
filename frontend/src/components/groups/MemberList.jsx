import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Crown, ShieldQuestion, Trash2, UserRound } from 'lucide-react'
import Avatar from '@/components/ui/avatar'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import EmptyState from '@/components/ui/empty-state'
import ErrorState from '@/components/ui/error-state'
import Skeleton from '@/components/ui/skeleton'
import Money from '@/components/money/Money'
import { useToast } from '@/components/ui/toast'
import { formatDate } from '@/lib/dates'
import {
  useRemoveMemberMutation,
  useSetMemberRoleMutation,
} from '@/services/endpoints/groupsApi'
import { useGetGroupBalancesQuery } from '@/services/endpoints/balancesApi'

/**
 * Member roster with roles. Removal is destructive and the server may refuse it
 * (409 CONFLICT while that member still owes or is owed) — the API's own words
 * are surfaced next to the member, not swallowed by a toast.
 */
export function MemberList({ group, canManage = false, myId = null }) {
  const toast = useToast()
  const [removeMember, removeState] = useRemoveMemberMutation()
  const [setRole, roleState] = useSetMemberRoleMutation()
  const [pendingRemove, setPendingRemove] = useState(null)
  const [blocker, setBlocker] = useState({})

  const balancesQuery = useGetGroupBalancesQuery(group.id)
  const balances = balancesQuery.data?.items ?? (Array.isArray(balancesQuery.data) ? balancesQuery.data : [])
  const netOf = (userId) => balances.find((b) => b.user?.id === userId)?.netMinor

  const members = group.members ?? []
  if (members.length === 0) {
    return (
      <EmptyState
        compact
        icon={UserRound}
        title="Nobody in this group yet"
        description="Invite people by email or share the invitation code — balances start at zero."
      />
    )
  }

  const confirmRemove = async () => {
    const member = pendingRemove
    if (!member) return
    try {
      await removeMember({ groupId: group.id, userId: member.user.id }).unwrap()
      toast.success('Member removed', `${member.user.name} no longer sees this group's ledger.`)
      setBlocker((b) => ({ ...b, [member.user.id]: null }))
      setPendingRemove(null)
    } catch (err) {
      const message =
        err?.code === 'CONFLICT' || err?.status === 409
          ? err.message
          : err?.message || 'The server refused this removal.'
      setBlocker((b) => ({ ...b, [member.user.id]: message }))
      toast.error('Removal blocked', message)
      setPendingRemove(null)
    }
  }

  const changeRole = async (member, role) => {
    try {
      await setRole({ groupId: group.id, userId: member.user.id, role }).unwrap()
      toast.success('Role updated', `${member.user.name} is now ${role === 'admin' ? 'an admin' : 'a member'}.`)
    } catch (err) {
      toast.error('Could not change the role', err?.message)
    }
  }

  return (
    <div className="divide-y divide-border">
      {members.map((member) => {
        const userId = member.user?.id
        const isMe = userId === myId
        const net = netOf(userId)
        const inactive = (member.status ?? 'active') !== 'active'
        return (
          <div key={userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <Avatar name={member.user?.name} src={member.user?.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                <span className="truncate">{member.user?.name ?? 'Member'}</span>
                {isMe ? <Badge tone="primary" className="py-0">you</Badge> : null}
                {member.role === 'admin' ? (
                  <Badge tone="info" className="py-0">
                    <Crown className="size-3" aria-hidden /> admin
                  </Badge>
                ) : null}
                {inactive ? <Badge tone="warning" className="py-0">{member.status}</Badge> : null}
              </p>
              <p className="truncate text-xs text-caption">
                {member.user?.email ?? '—'} · joined {formatDate(member.joinedAt)}
              </p>
              {blocker[userId] ? (
                <p role="status" className="mt-1 rounded-control bg-danger-muted px-2 py-1 text-xs text-danger-foreground">
                  {blocker[userId]}{' '}
                  <Link to={`/settlements?groupId=${group.id}`} className="font-medium underline underline-offset-2">
                    Settle up
                  </Link>
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {balancesQuery.isLoading ? (
                <Skeleton className="h-5 w-20 rounded-pill" />
              ) : balancesQuery.isError ? (
                <Badge tone="outline">balance n/a</Badge>
              ) : (
                <span className="tabular text-sm font-medium" title="net position (positive = owed to them)">
                  <span className={net > 0 ? 'text-success-foreground' : net < 0 ? 'text-danger-foreground' : 'text-muted-foreground'}>
                    {net === 0 ? 'settled' : net > 0 ? '+' : '−'}
                    {net == null ? '—' : <Money minor={Math.abs(net)} currency={balancesQuery.data?.meta?.currency ?? group.baseCurrency} />}
                  </span>
                </span>
              )}

              {canManage && !isMe && !inactive ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={roleState.isLoading}
                    onClick={() => changeRole(member, member.role === 'admin' ? 'member' : 'admin')}
                  >
                    <ShieldQuestion className="size-4" aria-hidden />
                    {member.role === 'admin' ? 'Make member' : 'Make admin'}
                  </Button>
                  <Button
                    type="button"
                    variant="danger-outline"
                    size="icon-sm"
                    aria-label={`Remove ${member.user?.name ?? 'member'}`}
                    onClick={() => {
                      setBlocker((b) => ({ ...b, [userId]: null }))
                      setPendingRemove(member)
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        )
      })}

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null)
        }}
        title={pendingRemove ? `Remove ${pendingRemove.user?.name}?` : 'Remove member?'}
        description="They lose access to the group's expenses, balances and settlements. The server refuses this while their net balance is not zero — they must settle up first."
        confirmLabel="Remove member"
        onConfirm={confirmRemove}
      />
      {removeState.isError && !blocker[pendingRemove?.user?.id ?? ''] ? (
        <ErrorState compact error={removeState.error} message={removeState.error?.message} />
      ) : null}
    </div>
  )
}

export default MemberList
