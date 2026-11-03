import { Link } from 'react-router-dom'
import { Archive, Plus } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import { formatDate } from '@/lib/dates'

/** Page header for a single group: identity, state, and the actions the API allows. */
export function GroupDetailsHeader({ group, access, inviteSlot, settingsSlot }) {
  return (
    <PageHeader
      back="Groups"
      backTo="/groups"
      title={group?.name ?? 'Group'}
      subtitle={
        <>
          {group?.description || 'No description yet.'}
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{group?.baseCurrency}</Badge>
            <Badge tone="outline">{group?.category ?? 'general'}</Badge>
            {group?.myRole ? <Badge tone={group.myRole === 'admin' ? 'info' : 'neutral'}>{group.myRole}</Badge> : null}
            {group?.isArchived ? (
              <Badge tone="warning">
                <Archive className="size-3" aria-hidden /> archived
              </Badge>
            ) : null}
            <span className="text-caption">created {formatDate(group?.createdAt)}</span>
          </span>
        </>
      }
      actions={
        <>
          {inviteSlot}
          {settingsSlot}
          <Button asChild disabled={!access?.canSpend}>
            <Link to={`/groups/${group?.id}/expenses/new`}>
              <Plus aria-hidden /> Add expense
            </Link>
          </Button>
        </>
      }
    />
  )
}

export default GroupDetailsHeader
