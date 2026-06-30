import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { MultiSelectChips } from '@/components/MultiSelectChips'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useResetUserPassword,
  useSetUserPassword,
  VERNON_ROLE_OPTIONS,
  MEMBER_TYPE_OPTIONS,
} from '@/hooks/useData'

const field =
  'mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none disabled:bg-canvas disabled:text-muted'

export default function UserForm() {
  const { name } = useParams<{ name: string }>()
  const isEdit = !!name
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const { data: users, isLoading } = useUsers()
  const existing = useMemo(
    () => (name ? users?.find((u) => u.name === name) : undefined),
    [users, name],
  )

  const create = useCreateUser()
  const update = useUpdateUser()
  const resetPw = useResetUserPassword()
  const setPw = useSetUserPassword()

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [memberType, setMemberType] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [sendWelcome, setSendWelcome] = useState(true)
  const [newPassword, setNewPassword] = useState('')
  const [dirty, setDirty] = useState(false)
  const [emailError, setEmailError] = useState('')

  useEffect(() => {
    if (existing) {
      setFullName(existing.full_name || '')
      setRoles(existing.roles)
      setMemberType(existing.member_type || '')
      setEnabled(!!existing.enabled)
    }
  }, [existing])

  const saving = create.isPending || update.isPending

  async function goBack() {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Leave without saving?',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
      })
      if (!ok) return
    }
    navigate('/users')
  }

  async function onSave() {
    try {
      if (isEdit) {
        await update.mutateAsync({
          user: name as string,
          payload: { full_name: fullName, roles, enabled: enabled ? 1 : 0, member_type: memberType },
        })
        toast('success', 'User updated')
      } else {
        if (!email.trim()) {
          setEmailError('Email is required')
          toast('error', 'Email is required')
          return
        }
        setEmailError('')
        await create.mutateAsync({
          email: email.trim(),
          full_name: fullName.trim() || email.trim(),
          roles,
          send_welcome: sendWelcome,
          member_type: memberType,
        })
        toast('success', 'User created')
      }
      navigate('/users', { replace: true })
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function onSetPassword() {
    const ok = await confirm({
      title: 'Set new password?',
      message: 'This immediately changes the password for ' + name + ' and logs them out of other sessions.',
      confirmLabel: 'Set',
    })
    if (!ok) return
    try {
      await setPw.mutateAsync({ user: name as string, newPassword })
      toast('success', 'Password set')
      setNewPassword('')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed to set password')
    }
  }

  async function onResetPassword() {
    const ok = await confirm({
      title: 'Send password reset?',
      message: `A reset-password email will be sent to ${name}.`,
      confirmLabel: 'Send',
    })
    if (!ok) return
    try {
      await resetPw.mutateAsync(name as string)
      toast('success', 'Reset email sent')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed to send')
    }
  }

  if (isEdit && isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (isEdit && !isLoading && !existing) {
    return (
      <ErrorState
        title="Not found"
        subtitle="This user could not be found. They may have been removed."
        onRetry={() => navigate('/users')}
      />
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
      className="space-y-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Users
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{isEdit ? 'Edit user' : 'New user'}</h1>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <BentoGrid>
        {/* Identity tile */}
        <BentoTile span="md" tone="plain" title="Identity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
            <div className="sm:col-span-2">
              <Field
                label="Email"
                required={!isEdit}
                error={emailError}
                hint={isEdit ? "Can't be changed after creation" : undefined}
              >
                {(id) => (
                  <input
                    id={id}
                    type="email"
                    value={isEdit ? (name as string) : email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setDirty(true)
                      if (emailError) setEmailError('')
                    }}
                    disabled={isEdit}
                    autoFocus={!isEdit}
                    placeholder="name@company.com"
                    className={field}
                  />
                )}
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Full name">
                {(id) => (
                  <input
                    id={id}
                    type="text"
                    value={fullName}
                    autoFocus={isEdit}
                    onChange={(e) => {
                      setFullName(e.target.value)
                      setDirty(true)
                    }}
                    className={field}
                  />
                )}
              </Field>
            </div>
          </div>
        </BentoTile>

        {/* Summary / preview tile */}
        <BentoTile span="sm" tone="tint" accent="rose" title="Summary">
          <div className="mt-1 space-y-2 text-sm">
            <div>
              <span className="text-xs text-muted">Email</span>
              <p className="font-medium truncate text-ink">
                {isEdit ? name : email || '—'}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted">Name</span>
              <p className="font-medium truncate text-ink">
                {fullName || '—'}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted">Roles</span>
              <p className="font-medium text-ink">
                {roles.length > 0 ? roles.join(', ') : 'None'}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted">Member type</span>
              <p className="font-medium text-ink">
                {memberType || 'External / none'}
              </p>
            </div>
            {isEdit && (
              <div>
                <span className="text-xs text-muted">Status</span>
                <p className={`font-medium ${enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                  {enabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            )}
          </div>
        </BentoTile>

        {/* Role & access tile */}
        <BentoTile span="md" tone="plain" title="Role & access">
          <div className="mt-1 space-y-4">
            <div>
              <span className="text-xs font-semibold text-muted">Roles</span>
              <MultiSelectChips
                options={VERNON_ROLE_OPTIONS}
                value={roles}
                onChange={(v) => {
                  setRoles(v)
                  setDirty(true)
                }}
                emptyText="No roles"
              />
            </div>

            <Field label="Member type">
              {(id) => (
                <select
                  id={id}
                  value={memberType}
                  onChange={(e) => {
                    setMemberType(e.target.value)
                    setDirty(true)
                  }}
                  className={field}
                >
                  <option value="">External / none</option>
                  {MEMBER_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            {!isEdit && (
              <label className="flex items-center justify-between rounded-xl border border-line px-3 py-3 dark:border-slate-700">
                <span className="text-sm text-slate-700 dark:text-slate-200">Send welcome email</span>
                <input
                  type="checkbox"
                  checked={sendWelcome}
                  onChange={(e) => {
                    setSendWelcome(e.target.checked)
                    setDirty(true)
                  }}
                  className="h-5 w-5 accent-brand-600"
                />
              </label>
            )}

            {isEdit && (
              <label className="flex items-center justify-between rounded-xl border border-line px-3 py-3 dark:border-slate-700">
                <span className="text-sm text-slate-700 dark:text-slate-200">Account enabled</span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    setEnabled(e.target.checked)
                    setDirty(true)
                  }}
                  className="h-5 w-5 accent-brand-600"
                />
              </label>
            )}
          </div>
        </BentoTile>

        {/* Password tile (edit mode only) */}
        {isEdit && (
          <BentoTile span="md" tone="plain" title="Password">
            <div className="mt-1 flex flex-col gap-4">
              <button
                type="button"
                onClick={onResetPassword}
                disabled={resetPw.isPending}
                className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50 transition-colors"
              >
                {resetPw.isPending ? 'Sending…' : 'Send password reset email'}
              </button>
              <Field label="Set new password">
                {(id) => (
                  <div className="flex gap-2 mt-1">
                    <input
                      id={id}
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                      autoComplete="new-password"
                      className="w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={onSetPassword}
                      disabled={!newPassword || setPw.isPending}
                      className="shrink-0 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      {setPw.isPending ? 'Setting…' : 'Set password'}
                    </button>
                  </div>
                )}
              </Field>
            </div>
          </BentoTile>
        )}
      </BentoGrid>
    </form>
  )
}
