import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, X } from 'lucide-react'
import Button from '@/components/ui/button'
import Input, { Field } from '@/components/ui/input'
import { Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import Avatar from '@/components/ui/avatar'
import Badge from '@/components/ui/badge'
import Spinner from '@/components/ui/spinner'
import { CURRENCY_CODES } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useCreateGroupMutation } from '@/services/endpoints/groupsApi'
import { useSearchUsersQuery } from '@/services/endpoints/usersApi'
import { useToast } from '@/components/ui/toast'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Vocabulary accepted by the backend's group category enum (z.enum(groupCategoryValues)).
// /meta/categories serves EXPENSE categories — sending one of those to POST /groups is a
// 422 — so the create-group form keeps its own list, identical to the Groups.jsx filter.
const GROUP_CATEGORY_OPTIONS = [
  { value: 'other', label: 'Other' },
  { value: 'trip', label: 'Trip' },
  { value: 'home', label: 'Home / Roommates' },
  { value: 'family', label: 'Family' },
  { value: 'office', label: 'Office' },
  { value: 'friends', label: 'Friends' },
]

/** Create-group dialog with invite-by-email (user search + chips). */
export function CreateGroupDialog({ open, onOpenChange, trigger, defaultCategory, categories }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [createGroup, { isLoading }] = useCreateGroupMutation()
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: defaultCategory || 'other',
    baseCurrency: 'INR',
  })
  const [emails, setEmails] = useState([])
  const [emailInput, setEmailInput] = useState('')
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, name: '', description: '' }))
      setEmails([])
      setEmailInput('')
      setErrors({})
    }
  }, [open])

  const categoryOptions = categories ?? GROUP_CATEGORY_OPTIONS

  const addEmail = (raw) => {
    const email = raw.trim().toLowerCase()
    if (!email) return
    if (!EMAIL_RE.test(email)) {
      setErrors((e) => ({ ...e, email: 'Enter a valid email address.' }))
      return
    }
    if (emails.includes(email)) return
    setEmails((list) => [...list, email])
    setEmailInput('')
    setErrors((e) => ({ ...e, email: null }))
  }

  const validate = () => {
    const next = {}
    if (!form.name.trim()) next.name = 'Group name is required.'
    else if (form.name.trim().length > 60) next.name = 'Keep the name under 60 characters.'
    setErrors((e) => ({ ...e, ...next }))
    return Object.keys(next).length === 0
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    try {
      const created = await createGroup({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        baseCurrency: form.baseCurrency,
        members: emails.length ? emails : undefined,
      }).unwrap()
      // POST /groups returns { group: {...} }; unwrap before reading id/name.
      const createdGroup = created?.group ?? created
      toast.success('Group created', `${createdGroup?.name ?? 'Your group'} is ready — invite more people any time.`)
      onOpenChange?.(false)
      if (createdGroup?.id) navigate(`/groups/${createdGroup.id}`)
    } catch (err) {
      toast.error('Could not create the group', err?.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>A shared ledger for a trip, flat, or any circle that spends together.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Name" htmlFor="cg-name" required error={errors.name}>
            {({ describedBy }) => (
              <Input
                id="cg-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onBlur={validate}
                invalid={Boolean(errors.name)}
                aria-describedby={describedBy}
                placeholder="Goa 2026"
                autoFocus
              />
            )}
          </Field>

          <Field label="Description" htmlFor="cg-desc" hint="Optional — what this group is for.">
            <Textarea
              id="cg-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Flat, scooter, and one unforgettable dhaba."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="cg-category">
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger id="cg-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label ?? c.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Base currency" htmlFor="cg-currency">
              <Select value={form.baseCurrency} onValueChange={(v) => setForm((f) => ({ ...f, baseCurrency: v }))}>
                <SelectTrigger id="cg-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <InviteEmails
            emails={emails}
            onAdd={addEmail}
            onRemove={(email) => setEmails((list) => list.filter((e) => e !== email))}
            input={emailInput}
            onInputChange={setEmailInput}
            error={errors.email}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading}>
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Email chips + type-ahead user lookup so you invite real accounts. */
function InviteEmails({ emails, onAdd, onRemove, input, onInputChange, error }) {
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), 300)
    return () => clearTimeout(t)
  }, [input])

  const looksLikeEmail = EMAIL_RE.test(input.trim())
  const { data: found, isFetching } = useSearchUsersQuery(debounced, {
    skip: looksLikeEmail || debounced.length < 2,
  })
  const users = found?.items ?? found ?? []

  return (
    <Field label="Invite by email" htmlFor="cg-invite" hint="Press Enter to add. They get an invite; balances start at zero." error={error}>
      <div>
        <div
          className={cn(
            'flex min-h-10 flex-wrap items-center gap-1.5 rounded-control border border-input bg-card px-2 py-1.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
          )}
        >
          {emails.map((email) => (
            <Badge key={email} tone="primary" className="gap-1 pr-1">
              {email}
              <button type="button" onClick={() => onRemove(email)} aria-label={`Remove ${email}`} className="rounded-full p-0.5 hover:bg-primary/10">
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <input
            id="cg-invite"
            type="email"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onAdd(input)
              }
              if (e.key === 'Backspace' && !input && emails.length) onRemove(emails[emails.length - 1])
            }}
            placeholder={emails.length ? '' : 'friend@example.com'}
            className="h-7 min-w-40 flex-1 border-none bg-transparent px-1 text-sm outline-none placeholder:text-caption"
            aria-label="Friend email to invite"
          />
          {isFetching ? <Spinner size={14} className="text-caption" /> : null}
        </div>
        {!looksLikeEmail && debounced.length >= 2 && users.length > 0 ? (
          <ul className="mt-1.5 divide-y divide-border overflow-hidden rounded-control border border-border bg-card" aria-label="Matching users">
            {users.slice(0, 5).map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onAdd(u.email)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-muted"
                >
                  <Avatar name={u.name} src={u.avatarUrl} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  <span className="truncate text-xs text-caption">{u.email}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  )
}

export default CreateGroupDialog
