import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import AuthLayout from '@/components/layout/AuthLayout'
import Button from '@/components/ui/button'
import Input from '@/components/ui/input'
import { Field } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { humanizeApiError, fieldErrorsFrom } from '@/components/common/humanError'
import Spinner from '@/components/ui/spinner'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login() {
  useDocumentTitle('Sign in')
  const { login, isAuthenticated, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const redirectParam = searchParams.get('redirect')
  const pendingCode = (() => {
    try {
      return sessionStorage.getItem('pendingJoinCode')
    } catch {
      return null
    }
  })()
  const defaultDestination = pendingCode ? `/join?code=${encodeURIComponent(pendingCode)}` : '/dashboard'
  const from = redirectParam || location.state?.from || defaultDestination

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (status === 'authenticated' && isAuthenticated) return <Navigate to={from} replace />

  const validate = () => {
    const next = {}
    if (!email.trim()) next.email = 'Email is required.'
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.'
    if (!password) next.password = 'Password is required.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setFormError(null)
    setBusy(true)
    try {
      await login({ email: email.trim().toLowerCase(), password })
      navigate(from, { replace: true })
    } catch (err) {
      const fields = fieldErrorsFrom(err)
      if (Object.keys(fields).length) setErrors((prev) => ({ ...prev, ...fields }))
      setFormError(humanizeApiError(err, 'We could not sign you in. Check your credentials.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to see where your money stands across every group."
      footer={
        <>
          New to BalanceBook?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {status === 'loading' ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size={24} className="text-primary" />
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {formError ? (
            <div role="alert" className="rounded-control border border-danger/30 bg-danger-muted px-3.5 py-2.5 text-[13px] text-danger-foreground">
              {formError}
            </div>
          ) : null}

          <Field label="Email" htmlFor="login-email" required error={errors.email}>
            {({ describedBy }) => (
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => validate()}
                invalid={Boolean(errors.email)}
                aria-describedby={describedBy}
                placeholder="you@example.com"
              />
            )}
          </Field>

          <Field label="Password" htmlFor="login-password" required error={errors.password}>
            {({ describedBy }) => (
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => validate()}
                  invalid={Boolean(errors.password)}
                  aria-describedby={describedBy}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[6px] p-1.5 text-caption transition-colors hover:bg-muted hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            )}
          </Field>

          <div className="flex items-center justify-between">
            <Link to="/forgot-password" className="text-[13px] font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" className="w-full" size="lg" loading={busy}>
            Sign in
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
