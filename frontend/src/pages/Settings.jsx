import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, KeyRound, Moon, Palette, ShieldOff, Wallet } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/button'
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Input, { Field } from '@/components/ui/input'
import Switch from '@/components/ui/switch'
import Label from '@/components/ui/label'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setTheme } from '@/store/uiSlice'
import { useGetProfileQuery, useUpdateProfileMutation, useChangePasswordMutation, useDeleteAccountMutation } from '@/services/endpoints/usersApi'
import { CURRENCY_CODES } from '@/lib/money'
import { useAuth } from '@/hooks/useAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

// Keys must match User.notificationPreferences; the API strips anything unknown, so a
// toggle named differently would appear to save and then silently do nothing.
const NOTIF_KEYS = [
  { key: 'inApp', label: 'In-app notifications', defaultOn: true },
  { key: 'expenseAdded', label: 'New expense in a group', defaultOn: true },
  { key: 'expenseUpdated', label: 'An expense you are part of was edited', defaultOn: true },
  { key: 'settlementRequested', label: 'Settlements awaiting your confirmation', defaultOn: true },
  { key: 'settlementConfirmed', label: 'Settlement confirmed or rejected', defaultOn: true },
  { key: 'budgetAlerts', label: 'Budget threshold warnings', defaultOn: true },
  { key: 'email', label: 'Email notifications', defaultOn: false },
]

export default function Settings() {
  useDocumentTitle('Settings')
  const dispatch = useAppDispatch()
  const theme = useAppSelector((state) => state.ui.theme)
  const toast = useToast()
  const navigate = useNavigate()
  const { logout } = useAuth()

  const { data: profileData } = useGetProfileQuery(undefined)
  const user = profileData?.user ?? profileData
  const [updateProfile, { isLoading: savingProfile }] = useUpdateProfileMutation()
  const [changePassword, { isLoading: savingPassword }] = useChangePasswordMutation()
  const [deleteAccount, { isLoading: deleting }] = useDeleteAccountMutation()

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [pwErrors, setPwErrors] = useState({})

  const currency = user?.preferredCurrency ?? 'INR'
  const prefs = user?.notificationPreferences ?? {}

  const setPref = async (key, value) => {
    try {
      await updateProfile({ notificationPreferences: { ...prefs, [key]: value } }).unwrap()
    } catch (err) {
      toast.error('Could not save preference', err?.message)
    }
  }

  const onChangeCurrency = async (code) => {
    try {
      await updateProfile({ preferredCurrency: code }).unwrap()
      toast.success('Currency updated', `Amounts now default to ${code}.`)
    } catch (err) {
      toast.error('Could not change currency', err?.message)
    }
  }

  const onSubmitPassword = async (e) => {
    e.preventDefault()
    const next = {}
    if (!pw.currentPassword) next.current = 'Enter your current password.'
    if (pw.newPassword.length < 8) next.new = 'Use at least 8 characters.'
    if (pw.confirm !== pw.newPassword) next.confirm = 'Passwords do not match.'
    setPwErrors(next)
    if (Object.keys(next).length) return
    try {
      await changePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }).unwrap()
      setPw({ currentPassword: '', newPassword: '', confirm: '' })
      toast.success('Password changed')
    } catch (err) {
      setPwErrors({ current: err?.message || 'Current password is incorrect.' })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Appearance, currency, notifications and security." />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-4 text-muted-foreground" aria-hidden /> Appearance
            </CardTitle>
            <CardDescription>Light is the default; dark inverts only the semantic layer.</CardDescription>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3">
              {[
                { key: 'light', label: 'Light', icon: Sun },
                { key: 'dark', label: 'Dark', icon: Moon },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={theme === key}
                  onClick={() => dispatch(setTheme(key))}
                  className={cn(
                    'flex h-24 flex-col items-center justify-center gap-2 rounded-card border-2 transition-colors',
                    theme === key
                      ? 'border-primary bg-primary-muted text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-ring/40',
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Currency */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-4 text-muted-foreground" aria-hidden /> Currency
            </CardTitle>
            <CardDescription>Your personal display currency. Groups keep their own base currency.</CardDescription>
          </CardHeader>
          <CardContent>
            <Field label="Preferred currency" htmlFor="s-currency">
              <Select value={currency} onValueChange={onChangeCurrency}>
                <SelectTrigger id="s-currency" className="max-w-60">
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
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="size-4 text-muted-foreground" aria-hidden /> Notifications
            </CardTitle>
            <CardDescription>What BalanceBook pings you about, in-app and by email.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border -mx-5">
            {NOTIF_KEYS.map(({ key, label, defaultOn }) => (
              <div key={key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <Label htmlFor={`pref-${key}`} className="cursor-pointer text-sm font-normal">
                  {label}
                </Label>
                <Switch
                  id={`pref-${key}`}
                  checked={prefs[key] ?? defaultOn}
                  onCheckedChange={(v) => setPref(key, v)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" aria-hidden /> Change password
            </CardTitle>
            <CardDescription>Signing out elsewhere is handled by the server.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmitPassword} noValidate className="space-y-4">
              <Field label="Current password" htmlFor="pw-current" required error={pwErrors.current}>
                <Input
                  id="pw-current"
                  type="password"
                  autoComplete="current-password"
                  value={pw.currentPassword}
                  onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
                  invalid={Boolean(pwErrors.current)}
                />
              </Field>
              <Field label="New password" htmlFor="pw-new" required error={pwErrors.new}>
                <Input
                  id="pw-new"
                  type="password"
                  autoComplete="new-password"
                  value={pw.newPassword}
                  onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
                  invalid={Boolean(pwErrors.new)}
                />
              </Field>
              <Field label="Confirm new password" htmlFor="pw-confirm" required error={pwErrors.confirm}>
                <Input
                  id="pw-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={pw.confirm}
                  onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                  invalid={Boolean(pwErrors.confirm)}
                />
              </Field>
              <Button type="submit" loading={savingPassword} disabled={!pw.currentPassword || !pw.newPassword}>
                Update password
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Danger zone */}
        <Card className="border-danger/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-danger-foreground">
              <ShieldOff className="size-4" aria-hidden /> Delete account
            </CardTitle>
            <CardDescription>
              Your history is soft-deleted and every session is revoked. Groups you created stay with their other
              members.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConfirmDialog
              requireText="DELETE"
              trigger={
                <Button variant="danger-outline" loading={deleting}>
                  Delete my account
                </Button>
              }
              title="Delete your BalanceBook account?"
              description="You will lose access to all groups, balances and settlement history. This cannot be undone from the app."
              confirmLabel="Permanently delete"
              onConfirm={async () => {
                await deleteAccount({ confirm: 'DELETE' }).unwrap()
                await logout()
                toast.info('Account deleted', 'Your data is no longer accessible.')
                navigate('/')
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Sun({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  )
}
