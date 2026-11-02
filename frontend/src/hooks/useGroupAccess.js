import { useCallback } from 'react'
import { useAppSelector } from '@/store/hooks'

/**
 * Derived permissions for one group DTO (docs/03 Group shape).
 * Server is the truth for actions; this only decides what we render.
 */
export function useGroupAccess(group) {
  const myId = useAppSelector((state) => state.auth.user?.id)

  const isMember = useCallback(() => {
    if (!group?.members) return false
    return group.members.some(
      (m) => (m.user?.id ?? m.userId) === myId && (m.status ?? 'active') === 'active',
    )
  }, [group, myId])

  const isAdmin = group?.myRole === 'admin' || isMember() &&
    group?.members?.find((m) => (m.user?.id ?? m.userId) === myId)?.role === 'admin'

  return {
    myId,
    isMe: (userId) => userId === myId,
    isMember: Boolean(group) ? isAdmin || isMember() : false,
    isAdmin: Boolean(isAdmin),
    canManage: Boolean(isAdmin), // admin-only surfaces: invites, members, budgets edit
    canSpend: Boolean(group) && !group.isArchived && (isAdmin || isMember()),
    currency: group?.baseCurrency || 'INR',
  }
}

export default useGroupAccess
