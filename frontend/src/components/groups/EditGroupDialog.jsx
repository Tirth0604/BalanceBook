import { useEffect, useState } from 'react'
import { Archive, Save } from 'lucide-react'
import Button from '@/components/ui/button'
import Input, { Field, Textarea } from '@/components/ui/input'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { useArchiveGroupMutation, useUpdateGroupMutation } from '@/services/endpoints/groupsApi'

const GROUP_CATEGORIES = [
  { value: 'trip', label: 'Trip' },
  { value: 'home', label: 'Home / Roommates' },
  { value: 'family', label: 'Family' },
  { value: 'office', label: 'Office' },
  { value: 'friends', label: 'Friends' },
  { value: 'other', label: 'Other' },
]

/** Admin-only group edit + archive. Archive is destructive-looking and named as reversible. */
export function EditGroupDialog({ group, canManage = true, trigger, onArchived }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: group?.name ?? '',
    description: group?.description ?? '',
    category: group?.category ?? 'other',
  })
  const [errors, setErrors] = useState({})
  const [updateGroup, updateState] = useUpdateGroupMutation()
  const [archiveGroup, archiveState] = useArchiveGroupMutation()

  useEffect(() => {
    if (open) {
      setForm({ name: group?.name ?? '', description: group?.description ?? '', category: group?.category ?? 'other' })
      setErrors({})
    }
  }, [open, group])

  const validate = () => {
    const next = {}
    if (!form.name.trim()) next.name = 'A group needs a name.'
    else if (form.name.trim().length > 60) next.name = 'Keep it under 60 characters.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async (event) => {
    event.preventDefault()
    if (!validate()) return
    try {
      await updateGroup({
        groupId: group.id,
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
      }).unwrap()
      toast.success('Group updated', `${form.name.trim()} saved.`)
      setOpen(false)
    } catch (err) {
      setErrors({ name: err?.message || 'The server refused this update.' })
    }
  }

  const archive = async () => {
    try {
      await archiveGroup(group.id).unwrap()
      toast.warning('Group archived', 'The ledger stays readable; nobody can add expenses.')
      onArchived?.()
    } catch (err) {
      toast.error('Could not archive', err?.message)
      throw err
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && canManage ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Group settings</DialogTitle>
          <DialogDescription>
            The base currency is fixed once expenses exist — amounts are stored in it, paisa by paisa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} noValidate className="space-y-4">
          <Field label="Name" htmlFor="eg-name" required error={errors.name}>
            <Input
              id="eg-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onBlur={validate}
              invalid={Boolean(errors.name)}
              disabled={!canManage}
            />
          </Field>

          <Field label="Description" htmlFor="eg-desc">
            <Textarea
              id="eg-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              disabled={!canManage}
            />
          </Field>

          <Field label="Category" htmlFor="eg-category">
            <Select value={form.category} onValueChange={(category) => setForm((f) => ({ ...f, category }))} disabled={!canManage}>
              <SelectTrigger id="eg-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-muted/50 p-3">
            <div>
              <p className="text-sm font-medium">Archived state</p>
              <p className="text-xs text-muted-foreground">
                {group?.isArchived ? 'This group is archived — expenses can no longer be added.' : 'Archiving keeps every number but closes the ledger.'}
              </p>
            </div>
            {group?.isArchived ? null : (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="danger-outline" size="sm" disabled={!canManage}>
                    <Archive className="size-4" aria-hidden /> Archive group
                  </Button>
                }
                title={`Archive ${group?.name}?`}
                description="Nobody can add expenses or settlements any more. The balances and history stay readable forever."
                confirmLabel="Archive group"
                onConfirm={archive}
              />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="submit" loading={updateState.isLoading || archiveState.isLoading} disabled={!canManage}>
              <Save aria-hidden /> Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default EditGroupDialog
