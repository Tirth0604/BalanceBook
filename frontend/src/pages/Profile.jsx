import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Camera,
  KeyRound,
  MailCheck,
  ShieldOff,
  User as UserIcon,
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/button'
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Input, { Field } from '@/components/ui/input'
import Avatar from '@/components/ui/avatar'
import Badge from '@/components/ui/badge'
import Switch from '@/components/ui/switch'
import Label from '@/components/ui/label'
import Skeleton from '@/components/ui/skeleton'
import ErrorState from '@/components/ui/error-state'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useGetProfileQuery,
  useUpdateProfileMutation,
  useUploadAvatarMutation,
  useChangePasswordMutation,
  useDeleteAccountMutation,
} from '@/services/endpoints/usersApi'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useToast } from '@/components/ui/toast'
import { useAppLogout } from '@/components/common/useAppLogout'
import { humanizeApiError } from '@/components/common/humanError'
import { formatDate } from '@/lib/dates'
import { CURRENCY_CODES } from '@/lib/money'

/** Keys the backend persists (validation/userSchemas strips the rest). */
const NOTIF_CHANNELS = [
  { key: 'inApp', label: 'In-app notifications', hint: 'The bell and your inbox.' },
  { key: 'email', label: 'Email notifications', hint: 'Sums up what you missed, to your inbox.' },
]

const NOTIF_EVENTS = [
  { key: 'expenseAdded', label: 'New expense in a group' },
  { key: 'expenseUpdated', label: 'Expense edited or deleted' },
  { key: 'settlementRequested', label: 'Settlement awaiting your confirmation' },
  { key: 'settlementConfirmed', label: 'Settlement confirmed or rejected' },
  { key: 'budgetAlerts', label: 'Budget threshold warnings' },
]

export default function Profile() {
  useDocumentTitle('Profile')
  const { user: authUser } = useAuth()
  const profile = useGetProfileQuery(undefined, { skip: !authUser })
  const showSkeleton = useMinDuration(profile.isLoading, 300)
  const [updateProfile, { isLoading: saving }] = useUpdateProfileMutation()
  const [uploadAvatar, { isLoading: uploading }] = useUploadAvatarMutation()
  const toast = useToast()
  const fileRef = useRef(null)

  const user = profile.data?.user ?? profile.data ?? authUser
  const [form, setForm] = useState(null)
  const values = form ?? {
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    preferredCurrency: user?.preferredCurrency ?? 'INR',
  }
  const [errors, setErrors] = useState({})

  const onPickAvatar = async (file) => {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      await uploadAvatar(fd).unwrap()
      profile.refetch()
      toast.success('Photo updated')
    } catch (err) {
      toast.error('Could not upload photo', humanizeApiError(err))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!values.name.trim()) next.name = 'Name is required.'
    else if (values.name.trim().length < 2) next.name = 'Name must be at least 2 characters.'
    if (values.phone.trim() && values.phone.trim().length > 20) next.phone = 'Phone is too long.'
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      await updateProfile({
        name: values.name.trim(),
        phone: values.phone.trim() || undefined,
        preferredCurrency: values.preferredCurrency,
      }).unwrap()
      setForm(null)
      profile.refetch()
      toast.success('Profile saved')
    } catch (err) {
      toast.error('Could not save profile', humanizeApiError(err))
    }
  }

  if (profile.isError && !user) {
    return (
      <div className="space-y-6">
        <PageHeader title="Profile" />
        <ErrorState error={profile.error} onRetry={profile.refetch} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle="Your identity across every group — name, photo, currency and security." />

      {showSkeleton ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-48 rounded-card" />
          <Skeleton className="h-48 rounded-card lg:col-span-2" />
          <Skeleton className="h-72 rounded-card" />
          <Skeleton className="h-72 rounded-card lg:col-span-2" />
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
                <div className="relative">
                  <Avatar name={user?.name} src={user?.avatarUrl} size="xl" />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    aria-label="Change profile photo"
                    disabled={uploading}
                    className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-pill border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground disabled:opacity-60"
                  >
                    <Camera className={uploading ? 'size-4 animate-pulse' : 'size-4'} aria-hidden />
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => onPickAvatar(e.target.files?.[0])}
                  />
                </div>
                <div>
                  <p className="font-display text-lg font-semibold">{user?.name}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                </div>
                {user?.isEmailVerified ? (
                  <Badge tone="success">
                    <MailCheck className="size-3" aria-hidden /> Email verified
                  </Badge>
                ) : (
                  <Badge tone="warning">Email not verified</Badge>
                )}
                <p className="text-xs text-caption">Joined {formatDate(user?.createdAt)}</p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserIcon className="size-4 text-muted-foreground" aria-hidden /> Personal details
                </CardTitle>
                <CardDescription>Used on expenses, settlements and member lists.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={onSubmit} noValidate className="max-w-lg space-y-5">
                  <Field label="Full name" htmlFor="p-name" required error={errors.name}>
                    {({ describedBy }) => (
                      <Input
                        id="p-name"
                        autoComplete="name"
                        value={values.name}
                        onChange={(e) => setForm({ ...values, name: e.target.value })}
                        invalid={Boolean(errors.name)}
                        aria-describedby={describedBy}
                      />
                    )}
                  </Field>
                  <Field label="Phone" htmlFor="p-phone" hint="Optional — never shown to other members." error={errors.phone}>
                    <Input
                      id="p-phone"
                      type="tel"
                      autoComplete="tel"
                      value={values.phone}
                      onChange={(e) => setForm({ ...values, phone: e.target.value })}
                    />
                  </Field>
                  <Field label="Preferred currency" htmlFor="p-currency" hint="Your personal display currency. Each group keeps its own base currency.">
                    <Select
                      value={values.preferredCurrency}
                      onValueChange={(v) => setForm({ ...values, preferredCurrency: v })}
                    >
                      <SelectTrigger id="p-currency">
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
                  <div className="flex justify-end gap-2">
                    <Button type="submit" loading={saving}>
                      Save changes
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <PasswordCard />
            <NotificationPreferencesCard
              prefs={user?.notificationPreferences ?? {}}
              saving={saving}
              onSave={async (patch) => {
                try {
                  await updateProfile({ notificationPreferences: patch }).unwrap()
                  profile.refetch()
                } catch (err) {
                  toast.error('Could not save preference', humanizeApiError(err))
                  throw err
                }
              }}
            />
          </div>

          <DeleteAccountCard />
        </>
      )}
    </div>
  )
}

function PasswordCard() {
  const toast = useToast()
  const [changePassword, { isLoading }] = useChangePasswordMutation()
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [errors, setErrors] = useState({})

  const set = (key) => (e) => setPw((p) => ({ ...p, [key]: e.target.value }))

  const onSubmit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!pw.currentPassword) next.currentPassword = 'Enter your current password.'
    if (pw.newPassword.length < 8) next.newPassword = 'Use at least 8 characters.'
    if (pw.confirm !== pw.newPassword) next.confirm = 'Passwords do not match.'
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      await changePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }).unwrap()
      setPw({ currentPassword: '', newPassword: '', confirm: '' })
      toast.success('Password changed')
    } catch (err) {
      if (err?.code === 'UNAUTHORIZED' || err?.status === 401) {
        setErrors({ currentPassword: 'That current password is not correct.' })
      } else {
        setErrors({ newPassword: humanizeApiError(err, 'Could not change your password.') })
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden /> Password
        </CardTitle>
        <CardDescription>Other sessions stay signed out after a change.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="max-w-md space-y-5">
          <Field label="Current password" htmlFor="p-pw-current" required error={errors.currentPassword}>
            {({ describedBy }) => (
              <Input
                id="p-pw-current"
                type="password"
                autoComplete="current-password"
                value={pw.currentPassword}
                onChange={set('currentPassword')}
                invalid={Boolean(errors.currentPassword)}
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Field label="New password" htmlFor="p-pw-new" required hint="At least 8 characters." error={errors.newPassword}>
            {({ describedBy }) => (
              <Input
                id="p-pw-new"
                type="password"
                autoComplete="new-password"
                value={pw.newPassword}
                onChange={set('newPassword')}
                invalid={Boolean(errors.newPassword)}
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Field label="Confirm new password" htmlFor="p-pw-confirm" required error={errors.confirm}>
            {({ describedBy }) => (
              <Input
                id="p-pw-confirm"
                type="password"
                autoComplete="new-password"
                value={pw.confirm}
                onChange={set('confirm')}
                invalid={Boolean(errors.confirm)}
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={isLoading}>
              Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function NotificationPreferencesCard({ prefs, onSave, saving }) {
  const toast = useToast()
  const [pendingKey, setPendingKey] = useState(null)

  const toggle = async (key, value) => {
    setPendingKey(key)
    try {
      await onSave({ ...prefs, [key]: value })
      toast.success('Notification settings saved')
    } catch {
      /* caller toasted; UI reverts on refetch */
    } finally {
      setPendingKey(null)
    }
  }

  const row = ({ key, label, hint }) => (
    <div key={key} className="flex items-center justify-between gap-4 py-2">
      <Label htmlFor={`pref-${key}`} className="flex flex-col gap-0.5 font-normal">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint ? <span className="text-xs text-caption">{hint}</span> : null}
      </Label>
      <Switch
        id={`pref-${key}`}
        checked={prefs[key] ?? key === 'inApp'}
        disabled={Boolean(pendingKey) || saving}
        onCheckedChange={(v) => toggle(key, v)}
      />
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" aria-hidden /> Notifications
        </CardTitle>
        <CardDescription>Choose where BalanceBook reaches you.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {NOTIF_CHANNELS.map(row)}
        {NOTIF_EVENTS.map(row)}
      </CardContent>
    </Card>
  )
}

function DeleteAccountCard() {
  const toast = useToast()
  const navigate = useNavigate()
  const signOut = useAppLogout()
  const [deleteAccount] = useDeleteAccountMutation()
  const [open, setOpen] = useState(false)

  const run = async () => {
    try {
      await deleteAccount({ confirm: 'DELETE' }).unwrap()
      await signOut()
      toast.info('Your account has been deleted')
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error('Could not delete account', humanizeApiError(err))
      throw err
    }
  }

  return (
    <Card className="border-danger/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-danger-foreground">
          <ShieldOff className="size-4" aria-hidden /> Danger zone
        </CardTitle>
        <CardDescription>
          Deleting your account removes your access to all groups. Outstanding balances are archived with them —
          this cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="danger-outline" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </CardContent>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete your BalanceBook account?"
        description="You will be signed out immediately and cannot sign back in. Every group you created keeps its history for the other members."
        requireText="DELETE"
        confirmLabel="Delete my account"
        onConfirm={run}
      />
    </Card>
  )
}
