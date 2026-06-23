import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Spinner } from '@/components/ui'
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
} from '@/hooks/useData'

const field =
  'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 dark:disabled:bg-slate-900'

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
  const [enabled, setEnabled] = useState(true)
  const [sendWelcome, setSendWelcome] = useState(true)
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    if (existing) {
      setFullName(existing.full_name || '')
      setRoles(existing.roles)
      setEnabled(!!existing.enabled)
    }
  }, [existing])

  const saving = create.isPending || update.isPending

  async function onSave() {
    try {
      if (isEdit) {
        await update.mutateAsync({
          user: name as string,
          payload: { full_name: fullName, roles, enabled: enabled ? 1 : 0 },
        })
        toast('success', 'User updated')
      } else {
        if (!email.trim()) {
          toast('error', 'Email is required')
          return
        }
        await create.mutateAsync({
          email: email.trim(),
          full_name: fullName.trim() || email.trim(),
          roles,
          send_welcome: sendWelcome,
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

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <button
            onClick={() => navigate('/users')}
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Users
          </button>
          <h1 className="text-2xl font-bold">{isEdit ? 'Edit user' : 'New user'}</h1>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-card p-6 flex flex-col gap-4">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Email</span>
          <input
            type="email"
            value={isEdit ? (name as string) : email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isEdit}
            placeholder="name@company.com"
            className={field}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Full name</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={field}
          />
        </label>

        <div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Roles</span>
          <MultiSelectChips
            options={VERNON_ROLE_OPTIONS}
            value={roles}
            onChange={setRoles}
            emptyText="No roles"
          />
        </div>

        {!isEdit && (
          <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-700">
            <span className="text-sm text-slate-700 dark:text-slate-200">Send welcome email</span>
            <input
              type="checkbox"
              checked={sendWelcome}
              onChange={(e) => setSendWelcome(e.target.checked)}
              className="h-5 w-5 accent-brand-600"
            />
          </label>
        )}

        {isEdit && (
          <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-700">
            <span className="text-sm text-slate-700 dark:text-slate-200">Account enabled</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-5 w-5 accent-brand-600"
            />
          </label>
        )}
      </div>

      {isEdit && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-card p-6 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Password
          </h2>
          <button
            onClick={onResetPassword}
            disabled={resetPw.isPending}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50 transition-colors"
          >
            {resetPw.isPending ? 'Sending…' : 'Send password reset email'}
          </button>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Set new password</span>
            <div className="mt-1 flex gap-2">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
              />
              <button
                onClick={onSetPassword}
                disabled={!newPassword || setPw.isPending}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50 transition-colors"
              >
                {setPw.isPending ? 'Setting…' : 'Set password'}
              </button>
            </div>
          </label>
        </div>
      )}
    </div>
  )
}
