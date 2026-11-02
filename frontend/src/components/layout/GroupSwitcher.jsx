import { Link, useLocation, useParams } from 'react-router-dom'
import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useListGroupsQuery } from '@/services/endpoints/groupsApi'
import Button from '@/components/ui/button'
import Avatar from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Topbar group switcher — jump between your most recent groups or into a
 * specific one from any screen. Every entry is a real route; the group list
 * comes from GET /groups (same query the sidebar uses, shared RTK cache).
 */
export function GroupSwitcher({ className }) {
  const { groupId } = useParams()
  const location = useLocation()
  const { data } = useListGroupsQuery({ archived: 'false', limit: 25, sort: '-createdAt' })
  const groups = (data?.items ?? data ?? []).slice(0, 8)

  const onGroupRoute = /^\/groups\/[^/]+/.test(location.pathname)
  const active = onGroupRoute ? groups.find((g) => String(g.id) === String(groupId)) : null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('max-w-52 gap-2', className)}
          aria-label="Switch group"
        >
          {active ? (
            <Avatar name={active.name} src={active.imageUrl} size="sm" className="size-5 rounded-[6px]" />
          ) : (
            <Building2 className="size-4 text-muted-foreground" aria-hidden />
          )}
          <span className="hidden truncate sm:inline">{active?.name ?? 'Groups'}</span>
          <ChevronsUpDown className="size-3.5 text-caption" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Jump to a group</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {groups.length === 0 ? (
          <DropdownMenuItem disabled>
            <Building2 aria-hidden /> No groups yet
          </DropdownMenuItem>
        ) : (
          groups.map((g) => (
            <DropdownMenuItem key={g.id} asChild>
              <Link to={`/groups/${g.id}`} className="gap-2">
                <Avatar name={g.name} src={g.imageUrl} size="sm" className="size-6 rounded-[6px]" />
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                <span className="text-[11px] text-caption tabular">{g.memberCount ?? g.members?.length ?? ''}</span>
                {active && String(active.id) === String(g.id) ? (
                  <Check className="size-4 text-primary" aria-hidden />
                ) : null}
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/groups">
            <Building2 aria-hidden /> All groups
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/groups?create=1">
            <Plus aria-hidden /> New group
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default GroupSwitcher
