import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import Button from '@/components/ui/button'
import Input, { Field } from '@/components/ui/input'
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
import { useJoinByCodeMutation } from '@/services/endpoints/groupsApi'

/** POST /groups/join with an invitation code — the accept path for a shared link. */
export function JoinByCodeDialog({ trigger, defaultCode = '' }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(defaultCode)
  const [error, setError] = useState(null)
  const [join, joinState] = useJoinByCodeMutation()

  const submit = async (event) => {
    event.preventDefault()
    const value = code.trim().toUpperCase()
    if (!value) {
      setError('Paste the invitation code from your invite email or link.')
      return
    }
    try {
      const group = await join(value).unwrap()
      toast.success('Group joined', group?.name ? `${group.name} is in your list.` : 'The group is in your list now.')
      setOpen(false)
      if (group?.id) navigate(`/groups/${group.id}`)
    } catch (err) {
      setError(err?.message || 'That code did not work.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Join with a code</DialogTitle>
          <DialogDescription>
            Your friend's invitation link ends in a code like <span className="tabular font-medium">7K2MD9</span>. Joining
            adds you to the ledger at a zero balance.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate>
          <Field label="Invitation code" htmlFor="join-code" required error={error} hint="Case-insensitive; spaces are ignored.">
            <Input
              id="join-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setError(null)
              }}
              invalid={Boolean(error)}
              placeholder="7K2MD9"
              className="tabular uppercase"
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={joinState.isLoading}>
              <LogIn aria-hidden /> Join group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default JoinByCodeDialog
