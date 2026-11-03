import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { HandCoins, Plus } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/button'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import useGroupAccess from '@/hooks/useGroupAccess'
import { useGetGroupQuery, useListGroupsQuery } from '@/services/endpoints/groupsApi'
import SuggestedPlan from '@/components/settlements/SuggestedPlan'
import PendingConfirmations from '@/components/settlements/PendingConfirmations'
import SettlementHistory from '@/components/settlements/SettlementHistory'
import RecordSettlementDialog from '@/components/settlements/RecordSettlementDialog'
import GroupPicker from '@/components/groups/GroupPicker'

export default function Settlements() {
  useDocumentTitle('Settlements')
  const [search, setSearch] = useSearchParams()
  const groupId = search.get('groupId') ?? ''
  const [tab, setTab] = useState('suggested')
  const [algorithm, setAlgorithm] = useState('minimum')
  const [dialog, setDialog] = useState({ open: false, initial: {} })

  const groupsQuery = useListGroupsQuery({ archived: 'false', limit: 50 })
  const groups = groupsQuery.data?.items ?? groupsQuery.data ?? []
  const groupQuery = useGetGroupQuery(groupId, { skip: !groupId })
  const group = groupQuery.data ?? groups.find((g) => g.id === groupId) ?? null
  const access = useGroupAccess(group)

  const members = useMemo(() => group?.members ?? [], [group])
  const initial = useMemo(
    () => ({
      payerId: search.get('payer') ?? undefined,
      receiverId: search.get('receiver') ?? undefined,
    }),
    [search],
  )

  const pickGroup = (next) => {
    const params = new URLSearchParams(search)
    if (next) params.set('groupId', next)
    else params.delete('groupId')
    setSearch(params, { replace: true })
  }

  const openRecord = (override = {}) => setDialog({ open: true, initial: { ...initial, ...override } })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settlements"
        subtitle="Cash that already moved, recorded here so the ledger can shrink. A settlement never charges anybody by itself — the receiver has to confirm it."
        actions={
          <>
            {groupId ? (
              <Button variant="outline" onClick={() => pickGroup('')}>
                All my payments
              </Button>
            ) : null}
            <Button onClick={() => openRecord()} disabled={!groupId || group?.isArchived}>
              <Plus aria-hidden /> Record payment
            </Button>
          </>
        }
      />

      <GroupPicker groups={groups} value={groupId} onChange={pickGroup} loading={groupsQuery.isLoading} />

      {!groupId ? (
        <Card>
          <EmptyState
            icon={HandCoins}
            title="Choose a group to optimise"
            description="Suggested settlements are computed from one group's balances. Pick a group above, or see every payment you are part of in the history tab."
            action={
              <Button variant="outline" size="sm" onClick={() => setTab('history')}>
                Show my payment history
              </Button>
            }
          />
        </Card>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full" aria-label="Settlement views">
            <TabsTrigger value="suggested" className="flex-1">
              Suggested plan
            </TabsTrigger>
            <TabsTrigger value="pending" className="flex-1">
              Awaiting confirmation
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="suggested">
            <Card className="p-0">
              {group ? (
                <SuggestedPlan
                  group={group}
                  algorithm={algorithm}
                  onAlgorithmChange={setAlgorithm}
                  onRecord={(transaction) => openRecord(transaction)}
                  loading={groupQuery.isLoading}
                />
              ) : null}
            </Card>
          </TabsContent>

          <TabsContent value="pending">
            <Card className="p-0">
              <PendingConfirmations groupId={groupId} onRecord={() => openRecord()} />
            </Card>
            <p className="mt-2 text-xs text-caption">
              Confirm / reject are receiver-only, dispute is either side, cancel is whoever recorded it — the same rules
              the API enforces.{' '}
              <Link to={`/balances?groupId=${groupId}`} className="font-medium text-primary underline-offset-2 hover:underline">
                See balances
              </Link>
            </p>
          </TabsContent>

          <TabsContent value="history">
            <Card className="p-0">
              <SettlementHistory groupId={groupId} />
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {group ? (
        <RecordSettlementDialog
          group={group}
          members={members.length ? members : group.members ?? []}
          open={dialog.open}
          onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
          initial={dialog.initial}
          onRecorded={() => {
            if (tab === 'suggested') return
            setTab('pending')
          }}
        />
      ) : null}

      {!access.canSpend && groupId ? (
        <p className="text-xs text-caption" aria-live="polite">
          {group?.isArchived ? 'This group is archived — its settlements stay as they are.' : 'You need group access to record a payment here.'}
        </p>
      ) : null}
    </div>
  )
}
