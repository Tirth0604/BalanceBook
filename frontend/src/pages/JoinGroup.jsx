import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Users2, LogIn, ArrowRight, CheckCircle2 } from 'lucide-react'
import AuthLayout from '@/components/layout/AuthLayout'
import Button from '@/components/ui/button'
import Input, { Field } from '@/components/ui/input'
import { useJoinByCodeMutation } from '@/services/endpoints/groupsApi'
import { useAuth } from '@/hooks/useAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useToast } from '@/components/ui/toast'

export default function JoinGroup() {
  useDocumentTitle('Join Group')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const codeParam = (searchParams.get('code') || '').trim().toUpperCase()
  const toast = useToast()
  const { isAuthenticated, status } = useAuth()

  const [code, setCode] = useState(codeParam)
  const [error, setError] = useState(null)
  const [joinGroup, { isLoading }] = useJoinByCodeMutation()

  // Save pending code to sessionStorage if not logged in
  useEffect(() => {
    if (codeParam) {
      setCode(codeParam)
      try {
        sessionStorage.setItem('pendingJoinCode', codeParam)
      } catch {
        /* ignore storage error */
      }
    }
  }, [codeParam])

  // If already authenticated and code is in URL, auto-attempt join once
  useEffect(() => {
    if (isAuthenticated && codeParam) {
      handleJoin(codeParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, codeParam])

  const handleJoin = async (targetCode) => {
    const value = (targetCode || code).trim().toUpperCase()
    if (!value) {
      setError('Please enter a valid invitation code.')
      return
    }
    setError(null)
    try {
      const res = await joinGroup(value).unwrap()
      const group = res?.group ?? res
      try {
        sessionStorage.removeItem('pendingJoinCode')
      } catch {}
      toast.success('Joined group!', `${group?.name || 'The group'} is now in your account.`)
      if (group?.id) {
        navigate(`/groups/${group.id}`, { replace: true })
      } else {
        navigate('/groups', { replace: true })
      }
    } catch (err) {
      setError(err?.data?.message || err?.message || 'That invitation code is invalid or has expired.')
    }
  }

  // If still checking auth status, render loading
  if (status === 'unknown' || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  // Case 1: Unauthenticated user
  if (!isAuthenticated) {
    return (
      <AuthLayout
        title="You've been invited!"
        subtitle="You received an invitation to join a group on BalanceBook."
      >
        <div className="space-y-6">
          <div className="flex justify-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users2 className="size-7" />
            </div>
          </div>

          {code && (
            <div className="rounded-control border border-border bg-card p-4 text-center">
              <p className="text-xs font-medium text-caption uppercase tracking-wider">Invitation Code</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-foreground">{code}</p>
            </div>
          )}

          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/join?code=${code}`)}`, {
                state: { from: `/join?code=${encodeURIComponent(code)}` },
              })}
            >
              <LogIn className="mr-2 size-4" /> Sign in to accept
            </Button>
            <Button
              variant="outline"
              className="w-full"
              size="lg"
              onClick={() => navigate(`/register?redirect=${encodeURIComponent(`/join?code=${code}`)}`, {
                state: { from: `/join?code=${encodeURIComponent(code)}` },
              })}
            >
              Create account
            </Button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  // Case 2: Authenticated user
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users2 className="size-7" />
          </div>
          <h1 className="mt-3 text-xl font-bold text-foreground">Join a group</h1>
          <p className="mt-1 text-sm text-caption">
            Enter or confirm your invitation code to join the shared ledger.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-control border border-danger/30 bg-danger-muted px-3.5 py-2.5 text-[13px] text-danger-foreground">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleJoin(code)
          }}
          className="space-y-4"
        >
          <Field label="Invitation code" htmlFor="join-code" required error={error}>
            <Input
              id="join-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setError(null)
              }}
              placeholder="7K2MD9"
              className="font-mono text-center text-lg tracking-widest uppercase"
              autoFocus
            />
          </Field>

          <Button type="submit" className="w-full" size="lg" loading={isLoading}>
            Join group <ArrowRight className="ml-2 size-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
