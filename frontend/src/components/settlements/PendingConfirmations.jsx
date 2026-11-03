import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, HandCoins, Plus } from 'lucide-react'
import Button from '@/components/ui/button'
import EmptyState from '@/components/ui/empty-state'
import ErrorState from '@/components/ui/error-state'
import { SkeletonList } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppSelector } from '@/store/hooks'
import { useListGroupSettlementsQuery, useListMySettlementsQuery } from '@/services/endpoints/settlementsApi'
import SettlementRow from './SettlementRow'

const PENDING = 'awaiting_confirmation'

/**
 * The awaiting-confirmation queue. `groupId` scopes it to one ledger; without a
 * group it spans everything, split by which side of the payment you are on.
 */
export function PendingConfirmations({ groupId, onChanged, onRecord }) {
  const myId = useAppSelector((state) => state.auth.user?.id)
  const [tab, setTab] = useState('all')

  const groupQuery = useListGroupSettlementsQuery({ groupId, status: PENDING }, { skip: !groupId })
  const myQuery = useListMySettlementsQuery(
    { status: PENDING, direction: tab === 'all' ? undefined : tab, limit: 50 },
    { skip: Boolean(groupId) },
  )

  const active = groupId ? groupQuery : myQuery
  const rows = active.data?.items ?? (Array.isArray(active.data) ? active.data : [])
  const refresh = () => (groupId ? groupQuery.refetch() : myQuery.refetch())

  if (active.isLoading) {
    return (
      <div className="p-4" aria-busy="true">
        <SkeletonList rows={3} className="[&>div]:p-3" />
      </div>
    )
  }
  if (active.isError) return <ErrorState error={active.error} onRetry={active.refetch} className="m-4" />

  const empty = (
    <EmptyState
      className="m-4"
      icon={HandCoins}
      title="Nothing waiting for a tap"
      description="A recorded payment sits here until the receiver confirms it. Nothing is charged by the app itself."
      action={
        onRecord ? (
          <Button size="sm" onClick={onRecord}>
            <Plus className="size-4" aria-hidden /> Record a payment
          </Button>
        ) : null
      }
    />
  )

  if (rows.length === 0) return empty

  return (
    <div>
      {!groupId ? (
        <Tabs value={tab} onValueChange={setTab} className="px-4 pt-4">
          <TabsList aria-label="Which side of the payment">
            <TabsTrigger value="all">Everything</TabsTrigger>
            <TabsTrigger value="to_me">
              <ArrowDownLeft className="size-3.5" aria-hidden /> You should confirm
            </TabsTrigger>
            <TabsTrigger value="from_me">
              <ArrowUpRight className="size-3.5" aria-hidden /> You are waiting
            </TabsTrigger>
          </TabsList>
          <TabsContent value={tab}>
            <PendingList rows={rows} myId={myId} onChanged={onChanged ?? refresh} />
          </TabsContent>
        </Tabs>
      ) : (
        <PendingList rows={rows} myId={myId} onChanged={onChanged ?? refresh} />
      )}
    </div>
  )
}

function PendingList({ rows, myId, onChanged }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        className="m-4"
        icon={HandCoins}
        title="Nothing waiting for a tap"
        description="A recorded payment sits here until the receiver confirms it."
      />
    )
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((settlement) => (
        <SettlementRow key={settlement.id} settlement={settlement} myId={myId} onMutated={onChanged} />
      ))}
    </ul>
  )
}

export default PendingConfirmations
