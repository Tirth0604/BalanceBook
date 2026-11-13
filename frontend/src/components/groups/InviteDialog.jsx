import { useState } from 'react'
import { Check, Copy, Link2, Mail, Users2, X } from 'lucide-react'
import Button from '@/components/ui/button'
import Input from '@/components/ui/input'
import Badge from '@/components/ui/badge'
import Avatar from '@/components/ui/avatar'
import ErrorState from '@/components/ui/error-state'
import Skeleton from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useInviteMembersMutation, useListInvitesQuery } from '@/services/endpoints/groupsApi'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Invite flow: email invites (server buckets them), the group's invitation code
 * for a shareable link, and the pending list from GET /groups/:id/invites.
 */
export function InviteDialog({ group, canManage = true, trigger }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [emails, setEmails] = useState([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)
  const [invite, inviteState] = useInviteMembersMutation()
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  const invitesQuery = useListInvitesQuery(group?.id, { skip: !open || !canManage })
  const inviteRows = normaliseInvites(invitesQuery.data)

  const addEmail = (raw) => {
    const email = String(raw ?? '').trim().toLowerCase()
    if (!email) return
    if (!EMAIL_RE.test(email)) {
      setError('That does not look like an email address.')
      return
    }
    if (emails.includes(email)) {
      setError(`${email} is already on the list.`)
      return
    }
    setEmails((list) => [...list, email])
    setDraft('')
    setError(null)
  }

  const send = async () => {
    let finalEmails = [...emails]
    const pendingDraft = String(draft ?? '').trim().toLowerCase()
    if (pendingDraft && EMAIL_RE.test(pendingDraft) && !finalEmails.includes(pendingDraft)) {
      finalEmails.push(pendingDraft)
    }
    if (!finalEmails.length) {
      setError('Add at least one email address.')
      return
    }
    try {
      const data = await invite({ groupId: group.id, emails: finalEmails }).unwrap()
      setResult(data)
      setEmails([])
      setDraft('')
      setError(null)
      const invited = data?.invited?.length ?? finalEmails.length
      toast.success(
        invited ? `${invited} invited` : 'Invitation sent',
        'Invitation email sent with a direct link to join the group.',
      )
    } catch (err) {
      setError(err?.message || 'The server refused these invitations.')
    }
  }

  const inviteLink = group?.invitationCode
    ? `${window.location.origin}/join?code=${group.invitationCode}`
    : null

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.info(`${label} copied`)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Copy failed', 'Select the text and copy it manually.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setResult(null)
          setError(null)
        }
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite people to {group?.name}</DialogTitle>
          <DialogDescription>
            Invitations never touch money — an invitee only joins the ledger once they accept.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="text-sm font-medium">
              Email addresses
            </label>
            <div
              className={cn(
                'mt-1.5 flex min-h-10 flex-wrap items-center gap-1.5 rounded-control border border-input bg-card px-2 py-1.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
                error && 'border-danger',
              )}
            >
              {emails.map((email) => (
                <Badge key={email} tone="primary" className="gap-1 pr-1">
                  <Mail className="size-3" aria-hidden />
                  {email}
                  <button type="button" onClick={() => setEmails((l) => l.filter((e) => e !== email))} aria-label={`Remove ${email}`} className="rounded-full p-0.5 hover:bg-primary/10">
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <input
                id="invite-email"
                type="email"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addEmail(draft)
                  }
                  if (e.key === 'Backspace' && !draft && emails.length) setEmails((l) => l.slice(0, -1))
                }}
                onBlur={() => draft && addEmail(draft)}
                placeholder={emails.length ? '' : 'friend@example.com'}
                className="h-7 min-w-40 flex-1 border-none bg-transparent px-1 text-sm outline-none placeholder:text-caption"
                aria-describedby={error ? 'invite-email-error' : 'invite-email-hint'}
                disabled={inviteState.isLoading}
              />
            </div>
            <p id="invite-email-hint" className="mt-1 text-xs text-muted-foreground">
              Press Enter to add. Unknown addresses are kept as placeholders and can claim the group on signup.
            </p>
            {error ? (
              <p id="invite-email-error" role="status" className="mt-1 text-xs text-danger-foreground">
                {error}
              </p>
            ) : null}
            <Button type="button" className="mt-2" onClick={send} loading={inviteState.isLoading} disabled={!canManage}>
              Send invitations
            </Button>
          </div>

          {result ? <InviteResult result={result} /> : null}

          {inviteLink ? (
            <div className="rounded-control border border-border bg-muted/50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Link2 className="size-3.5" aria-hidden /> Invitation link
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input readOnly value={inviteLink} aria-label="Invitation link" className="flex-1 text-xs" onFocus={(e) => e.target.select()} />
                <Button type="button" variant="outline" size="sm" onClick={() => copy(inviteLink, 'Link')}>
                  {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="mt-2 text-xs text-caption">
                Code <span className="tabular font-medium text-foreground">{group.invitationCode}</span> — anyone with it
                joins as a plain member.
              </p>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending invitations</p>
            {invitesQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : invitesQuery.isError ? (
              <ErrorState compact error={invitesQuery.error} onRetry={invitesQuery.refetch} />
            ) : inviteRows.length === 0 ? (
              <p className="rounded-control border border-dashed border-border px-3 py-3 text-[13px] text-muted-foreground">
                Nothing outstanding.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-control border border-border">
                {inviteRows.map((row) => (
                  <li key={row.id ?? row.email} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                    <Avatar name={row.name ?? row.email} src={row.avatarUrl} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{row.email ?? row.name ?? 'Invited'}</span>
                    {row.expiresAt ? <span className="text-xs text-caption">expires {formatDate(row.expiresAt)}</span> : null}
                    <Badge tone={row.status === 'accepted' ? 'success' : row.status === 'declined' ? 'neutral' : 'warning'}>
                      {row.status ?? 'pending'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {!canManage ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-caption">
                <Users2 className="size-3.5" aria-hidden /> Only admins can invite.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InviteResult({ result }) {
  const buckets = [
    { key: 'invited', label: 'Invited', tone: 'success' },
    { key: 'already', label: 'Already a member', tone: 'neutral' },
    { key: 'notFound', label: 'No account yet', tone: 'warning' },
  ]
  return (
    <div className="space-y-2 rounded-control border border-border bg-card p-3" role="status" aria-live="polite">
      {buckets.map(({ key, label, tone }) => {
        const list = result?.[key] ?? []
        if (!list.length) return null
        return (
          <div key={key} className="flex flex-wrap items-center gap-1.5 text-[13px]">
            <Badge tone={tone}>{label}</Badge>
            {list.map((item) => (
              <span key={typeof item === 'string' ? item : item?.email ?? item?.id} className="rounded-pill bg-muted px-2 py-0.5 text-xs tabular">
                {typeof item === 'string' ? item : item?.email ?? item?.name ?? item?.id}
              </span>
            ))}
          </div>
        )
      })}
      {!buckets.some((b) => (result?.[b.key] ?? []).length) ? (
        <p className="text-[13px] text-muted-foreground">
          The server accepted the request but created no new invitations — these people are already in the group.
        </p>
      ) : null}
    </div>
  )
}

function normaliseInvites(data) {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.items)) return data.items
  const pending = data.pending ?? data.sent ?? []
  return Array.isArray(pending) ? pending : []
}

export default InviteDialog
