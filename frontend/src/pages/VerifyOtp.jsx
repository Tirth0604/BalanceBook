import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ShieldCheck, RefreshCw } from 'lucide-react'
import AuthLayout from '@/components/layout/AuthLayout'
import Button from '@/components/ui/button'
import { useVerifyOtpMutation, useResendOtpMutation } from '@/services/endpoints/authApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const OTP_LENGTH = 6

export default function VerifyOtp() {
  useDocumentTitle('Verify your email')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''

  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''))
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [cooldown, setCooldown] = useState(0) // seconds until resend is allowed

  const inputRefs = useRef([])

  const [verifyOtp, { isLoading: verifying }] = useVerifyOtpMutation()
  const [resendOtp, { isLoading: resending }] = useResendOtpMutation()

  // Start cooldown timer on mount (assume OTP was just sent)
  useEffect(() => {
    setCooldown(60)
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  // Focus first empty box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const otp = digits.join('')

  function handleChange(index, value) {
    // Allow only single digit
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError(null)

    // Advance focus
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        // Clear current
        const next = [...digits]
        next[index] = ''
        setDigits(next)
      } else if (index > 0) {
        // Move back and clear
        const next = [...digits]
        next[index - 1] = ''
        setDigits(next)
        inputRefs.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handlePaste(e) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    const next = Array(OTP_LENGTH).fill('')
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setDigits(next)
    // Focus last filled or last box
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1)
    inputRefs.current[focusIdx]?.focus()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (otp.length < OTP_LENGTH) {
      setError('Please enter all 6 digits.')
      return
    }
    setError(null)
    try {
      await verifyOtp({ otp, email }).unwrap()
      const redirectParam = searchParams.get('redirect')
      const pendingCode = (() => {
        try {
          return sessionStorage.getItem('pendingJoinCode')
        } catch {
          return null
        }
      })()
      const target = redirectParam || (pendingCode ? `/join?code=${encodeURIComponent(pendingCode)}` : '/dashboard')
      navigate(target, { replace: true })
    } catch (err) {
      setError(err?.data?.message || 'Invalid or expired code. Please try again.')
      // Clear boxes on error so user can retype
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return
    setError(null)
    setSuccess(null)
    try {
      await resendOtp({ email }).unwrap()
      setSuccess('A new verification code has been sent to your email.')
      setCooldown(60)
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } catch (err) {
      setError(err?.data?.message || 'Could not resend code. Please try again.')
    }
  }

  return (
    <AuthLayout
      title="Check your email"
      subtitle={
        email
          ? `We sent a 6-digit code to ${email}. Enter it below to verify your account.`
          : 'Enter the 6-digit verification code we sent to your email.'
      }
      footer={
        <>
          Wrong email?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Go back
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-7" />
          </div>
        </div>

        {/* Error / success banners */}
        {error && (
          <div role="alert" className="rounded-control border border-danger/30 bg-danger-muted px-3.5 py-2.5 text-[13px] text-danger-foreground">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="rounded-control border border-success/30 bg-success-muted px-3.5 py-2.5 text-[13px] text-success-foreground">
            {success}
          </div>
        )}

        {/* 6-box OTP input */}
        <div className="flex justify-center gap-3" aria-label="One-time password input">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => (inputRefs.current[i] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              aria-label={`Digit ${i + 1}`}
              className={[
                'flex size-12 items-center justify-center rounded-control border bg-background text-center text-xl font-semibold tracking-widest',
                'transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50',
                digit ? 'border-primary text-foreground' : 'border-input text-muted-foreground',
                error ? 'border-danger' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          ))}
        </div>

        {/* Submit */}
        <Button type="submit" className="w-full" size="lg" loading={verifying} disabled={otp.length < OTP_LENGTH}>
          Verify email
        </Button>

        {/* Resend */}
        <div className="text-center text-sm text-caption">
          Didn't receive the code?{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || resending}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="size-3" />
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
        </div>
      </form>
    </AuthLayout>
  )
}

