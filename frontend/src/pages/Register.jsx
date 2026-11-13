import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import AuthLayout from '@/components/layout/AuthLayout'
import Button from '@/components/ui/button'
import Input, { Field } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CURRENCY_CODES } from '@/lib/money'
import { useAuth } from '@/hooks/useAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { humanizeApiError, fieldErrorsFrom } from '@/components/common/humanError'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Register() {
  useDocumentTitle('Create account')
  const { register } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', email: '', password: '', preferredCurrency: 'INR' })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (v) => setForm((f) => ({ ...f, [key]: typeof v === 'string' ? v : v }))

  const validate = () => {
    const next = {}
    if (!form.name.trim()) next.name = 'Name is required.'
    else if (form.name.trim().length < 2) next.name = 'Name must be at least 2 characters.'
    if (!form.email.trim()) next.email = 'Email is required.'
    else if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.'
    if (!form.password) next.password = 'Password is required.'
    else if (form.password.length < 8) next.password = 'Use at least 8 characters.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setFormError(null)
    setBusy(true)
    try {
      const result = await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        preferredCurrency: form.preferredCurrency,
      })
      // If the backend requires OTP verification, redirect to the OTP page.
      if (result?.requiresOtpVerification) {
        navigate(`/verify-otp?email=${encodeURIComponent(form.email.trim().toLowerCase())}`, { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      const fields = fieldErrorsFrom(err)
      if (Object.keys(fields).length) setErrors((prev) => ({ ...prev, ...fields }))
      setFormError(humanizeApiError(err, 'We could not create your account. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="One room per trip, flat, or friend circle — with balances that are always exact."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError ? (
          <div role="alert" className="rounded-control border border-danger/30 bg-danger-muted px-3.5 py-2.5 text-[13px] text-danger-foreground">
            {formError}
          </div>
        ) : null}

        <Field label="Full name" htmlFor="reg-name" required error={errors.name}>
          {({ describedBy }) => (
            <Input
              id="reg-name"
              autoComplete="name"
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              onBlur={validate}
              invalid={Boolean(errors.name)}
              aria-describedby={describedBy}
              placeholder="Priya Sharma"
            />
          )}
        </Field>

        <Field label="Email" htmlFor="reg-email" required error={errors.email}>
          {({ describedBy }) => (
            <Input
              id="reg-email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => set('email')(e.target.value)}
              onBlur={validate}
              invalid={Boolean(errors.email)}
              aria-describedby={describedBy}
              placeholder="you@example.com"
            />
          )}
        </Field>

        <Field
          label="Password"
          htmlFor="reg-password"
          required
          hint="At least 8 characters."
          error={errors.password}
        >
          {({ describedBy }) => (
            <div className="relative">
              <Input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => set('password')(e.target.value)}
                onBlur={validate}
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

        <Field label="Preferred currency" htmlFor="reg-currency" hint="Used for your totals. Each group keeps its own base currency.">
          <Select value={form.preferredCurrency} onValueChange={(v) => set('preferredCurrency')(v)}>
            <SelectTrigger id="reg-currency">
              <SelectValue placeholder="INR — Indian Rupee" />
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

        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
