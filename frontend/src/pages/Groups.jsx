import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, Plus, Users, UsersRound } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/button'
import ErrorState from '@/components/ui/error-state'
import EmptyState from '@/components/ui/empty-state'
import SearchInput from '@/components/ui/search-input'
import Pagination from '@/components/ui/pagination'
import { SkeletonCard } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import useMinDuration from '@/hooks/useMinDuration'
import { useListGroupsQuery } from '@/services/endpoints/groupsApi'
import GroupCard from '@/components/groups/GroupCard'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog'
import JoinByCodeDialog from '@/components/groups/JoinByCodeDialog'
import InvitationInbox from '@/components/groups/InvitationInbox'

const LIMIT = 12
const ANY = '__any__'

export default function Groups() {
  useDocumentTitle('My groups')
  const [searchParams, setSearchParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === '1')
  const [scope, setScope] = useState('active')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true)
  }, [searchParams])

  const queryArgs = useMemo(
    () => ({
      archived: scope === 'active' ? 'false' : scope === 'archived' ? 'true' : undefined,
      category: category || undefined,
      search: search || undefined,
      page,
      limit: LIMIT,
      sort: '-createdAt',
    }),
    [scope, category, search, page],
  )

  const { data, isLoading, isError, error, refetch, isFetching } = useListGroupsQuery(queryArgs)
  const groups = data?.items ?? (Array.isArray(data) ? data : [])
  const meta = data?.meta ?? {}
  const loading = useMinDuration(isLoading, 300)

  useEffect(() => {
    setPage(1)
  }, [scope, category, search])

  // The search box is debounced, so its URL write can land after the user has already
  // navigated into a group; setSearchParams would then resolve against this stale path and
  // push the browser back out of /groups/:id. Only sync while this page is actually mounted.
  const stillOnGroupsList = () => /^\/groups\/?$/.test(window.location.pathname)
  const syncParams = (mutate) => {
    if (!stillOnGroupsList()) return
    mutate(searchParams)
    setSearchParams(searchParams, { replace: true })
  }

  const closeCreate = (next) => {
    setCreateOpen(next)
    if (searchParams.get('create') === '1') {
      syncParams((params) => params.delete('create'))
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="My groups"
        subtitle="Every shared ledger you belong to — trips, flatmates, family. Balances shown here come from each group's own balance endpoint."
        actions={
          <>
            <JoinByCodeDialog
              trigger={
                <Button variant="outline">
                  <UsersRound aria-hidden /> Join with a code
                </Button>
              }
            />
            <CreateGroupDialog
              open={createOpen}
              onOpenChange={closeCreate}
              trigger={
                <Button>
                  <Plus aria-hidden /> New group
                </Button>
              }
            />
          </>
        }
      />

      <InvitationInbox />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={scope} onValueChange={setScope}>
          <TabsList aria-label="Group status">
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        <SearchInput
          value={search}
          onSearch={(value) => {
            setSearch(value)
            syncParams((params) => params.set('q', value))
          }}
          placeholder="Search groups…"
          ariaLabel="Search groups by name"
          className="w-full sm:max-w-64"
        />

        <Select value={category || ANY} onValueChange={(value) => setCategory(value === ANY ? '' : value)}>
          <SelectTrigger className="h-10 w-full sm:w-44" aria-label="Filter by group category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All categories</SelectItem>
            {['trip', 'home', 'family', 'office', 'friends', 'other'].map((value) => (
              <SelectItem key={value} value={value}>
                {value === 'home' ? 'Home / Roommates' : value[0].toUpperCase() + value.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isFetching && !loading ? (
          <span className="text-xs text-caption" aria-live="polite">
            Refreshing…
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={scope === 'archived' ? Archive : Users}
          title={
            scope === 'archived'
              ? 'No archived groups'
              : search || category
                ? 'Nothing matches that search'
                : 'No groups yet'
          }
          description={
            scope === 'archived'
              ? 'Archived ledgers stay here, read-only, forever.'
              : search || category
                ? 'Clear the filters, or create a fresh group for the next trip.'
                : 'A group is where a shared ledger lives: expenses, balances, settlements. Create one and invite the people who were there.'
          }
          action={
            search || category ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setCategory('')
                  setScope('active')
                }}
              >
                Clear filters
              </Button>
            ) : scope === 'archived' ? null : (
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => closeCreate(true)}>
                  <Plus aria-hidden /> New group
                </Button>
                <JoinByCodeDialog
                  trigger={
                    <Button size="sm" variant="outline">
                      Join with a code
                    </Button>
                  }
                />
              </div>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-caption" aria-live="polite">
              {meta.total ?? groups.length} group{meta.total === 1 ? '' : 's'} · {scope}
            </p>
            <div className="min-w-40 flex-1 sm:max-w-sm sm:flex-none">
              <Pagination page={meta.page ?? page} totalPages={meta.totalPages ?? 1} onPageChange={setPage} />
            </div>
            {scope === 'active' ? (
              <Button variant="ghost" size="sm" onClick={() => setScope('archived')}>
                <ArchiveRestore className="size-4" aria-hidden /> Show archived
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
