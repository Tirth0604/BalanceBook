import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, ShieldX } from 'lucide-react'
import AuthLayout from '@/components/layout/AuthLayout'
import Button from '@/components/ui/button'
import Input, { Field } from '@/components/ui/input'
import { authApi } from '@/services/endpoints/authApi'
import { useAppDispatch } from '@/store/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function ResetPassword() {
  useDocumentTitle('Set a new password')
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!token) {
    return (
      <AuthLayout title="Reset link not valid" subtitle="Open the newest link from your email, or request a fresh one.">
        <div className="flex flex-col items-center gap-4 rounded-card border border-border bg-card p-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-pill bg-danger-muted">
            <ShieldX className="size-5.5 text-danger-foreground" aria-hidden />
          </span>
          <Button asChild>
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const next = {}
    if (password.length < 8) next.password = 'Use at least 8 characters.'
    if (confirm !== password) next.confirm = 'Passwords do not match.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setFormError(null)
    setBusy(true)
    try {
      await dispatch(authApi.endpoints.resetPassword.initiate({ token, password })).unwrap()
      navigate('/login', { replace: true })
    } catch (err) {
      setFormError(err?.message || 'This reset link has expired. Request a new one.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose something you have not used here before.">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError ? (
          <div role="alert" className="rounded-control border border-danger/30 bg-danger-muted px-3.5 py-2.5 text-[13px] text-danger-foreground">
            {formError}
          </div>
        ) : null}

        <Field label="New password" htmlFor="reset-password" required error={errors.password}>
          {({ describedBy }) => (
            <div className="relative">
              <Input
                id="reset-password"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => onSubmit.length && setErrors((prev) => ({ ...prev }))}
                invalid={Boolean(errors.password)}
                aria-describedby={describedBy}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[6px] p-1.5 text-caption transition-colors hover:bg-muted hover:text-foreground"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>

        <Field label="Confirm new password" htmlFor="reset-confirm" required error={errors.confirm}>
          {({ describedBy }) => (
            <Input
              id="reset-confirm"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              invalid={Boolean(errors.confirm)}
              aria-describedby={describedBy}
            />
          )}
        </Field>

        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  )
}
