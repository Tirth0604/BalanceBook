import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import AuthLayout from '@/components/layout/AuthLayout'
import Button from '@/components/ui/button'
import Input, { Field } from '@/components/ui/input'
import { authApi } from '@/services/endpoints/authApi'
import { useAppDispatch } from '@/store/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPassword() {
  useDocumentTitle('Forgot password')
  const dispatch = useAppDispatch()
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [resetUrl, setResetUrl] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const res = await dispatch(
        authApi.endpoints.forgotPassword.initiate({ email: email.trim().toLowerCase() }),
      )
      const data = 'data' in res ? res.data : undefined
      if (data?.resetUrl) setResetUrl(data.resetUrl) // dev echo only (docs/03)
      setSent(true)
    } catch (err) {
      setError(err?.message || 'We could not send the reset link. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title={sent ? 'Check your inbox' : 'Reset your password'}
      subtitle={
        sent
          ? `If an account exists for ${email.trim()}, a reset link is on its way. The link expires in 30 minutes.`
          : 'We will email you a secure link to set a new password.'
      }
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-card p-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-pill bg-success-muted">
            <MailCheck className="size-5.5 text-success" aria-hidden />
          </span>
          <p className="text-sm text-muted-foreground">
            No email? <Link to="/register" className="text-primary hover:underline">Create an account</Link> instead.
          </p>
          {resetUrl ? (
            <Button variant="outline" size="sm" asChild className="mt-1">
              <Link to={`/reset-password?token=dev&resetUrl=${encodeURIComponent(resetUrl)}`}>
                Open reset link (dev)
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <Field label="Email" htmlFor="forgot-email" required error={error}>
            {({ describedBy }) => (
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                invalid={Boolean(error)}
                aria-describedby={describedBy}
                placeholder="you@example.com"
              />
            )}
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
