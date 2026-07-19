import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Sparkles, ChevronRight } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { MultiSelectChips } from '@/components/MultiSelectChips'
import { SearchableSelect } from '@/components/SearchableSelect'
import { LeaderNotesSection } from '@/components/LeaderNotesSection'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import {
  useUsers,
  useCreateUser,
  useResetUserPassword,
  useDeleteUser,
  useSetUserPassword,
  useImpersonate,
  useBoot,
  VERNON_ROLE_OPTIONS,
  MEMBER_TYPE_OPTIONS,
  keys,
} from '@/hooks/useData'
import { mobileApi } from '@/lib/api'
import type { LeaveBalance } from '@/lib/types'

const field =
  'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function UserFormScreen() {
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
  const qc = useQueryClient()
  const saveWithProfile = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      mobileApi.saveUserWithProfile(name as string, payload),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.users }),
  })
  const resetPw = useResetUserPassword()
  const del = useDeleteUser()
  const setPw = useSetUserPassword()
  const impersonate = useImpersonate()
  const { data: boot } = useBoot()

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [memberType, setMemberType] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [sendWelcome, setSendWelcome] = useState(true)
  const [newPassword, setNewPassword] = useState('')

  // Employee profile — legal/contract/leave (edit mode only)
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null)
  const [nikKtp, setNikKtp] = useState('')
  const [npwp, setNpwp] = useState('')
  const [bpjsKes, setBpjsKes] = useState('')
  const [bpjsTk, setBpjsTk] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccountNo, setBankAccountNo] = useState('')
  const [bankAccountHolder, setBankAccountHolder] = useState('')
  const [employmentStatus, setEmploymentStatus] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [dateJoined, setDateJoined] = useState('')
  const [contractStart, setContractStart] = useState('')
  const [contractEnd, setContractEnd] = useState('')
  const [annualLeaveQuota, setAnnualLeaveQuota] = useState<number | ''>('')
  const [priorLeaveTaken, setPriorLeaveTaken] = useState<number | ''>('')

  useEffect(() => {
    if (existing) {
      setFullName(existing.full_name || '')
      setRoles(existing.roles)
      setMemberType(existing.member_type || '')
      setEnabled(!!existing.enabled)
    }
  }, [existing])

  useEffect(() => {
    if (!name) return
    mobileApi.getEmployeeProfile(name).then((ep) => {
      setNikKtp(ep.nik_ktp ?? '')
      setNpwp(ep.npwp ?? '')
      setBpjsKes(ep.bpjs_kesehatan ?? '')
      setBpjsTk(ep.bpjs_ketenagakerjaan ?? '')
      setBankName(ep.bank_name ?? '')
      setBankAccountNo(ep.bank_account_no ?? '')
      setBankAccountHolder(ep.bank_account_holder ?? '')
      setEmploymentStatus(ep.employment_status ?? '')
      setJobTitle(ep.job_title ?? '')
      setDateJoined(ep.date_joined ?? '')
      setContractStart(ep.contract_start ?? '')
      setContractEnd(ep.contract_end ?? '')
      setAnnualLeaveQuota(ep.annual_leave_quota ?? '')
      setPriorLeaveTaken(ep.prior_leave_taken ?? '')
      setLeaveBalance(ep.leave ?? null)
    }).catch(() => {
      // non-fatal: admin fields stay blank if fetch fails
    })
  }, [name])

  const saving = create.isPending || saveWithProfile.isPending

  async function onSave() {
    try {
      if (isEdit) {
        await saveWithProfile.mutateAsync({
          full_name: fullName, roles, enabled: enabled ? 1 : 0, member_type: memberType,
          nik_ktp: nikKtp, npwp, bpjs_kesehatan: bpjsKes, bpjs_ketenagakerjaan: bpjsTk,
          bank_name: bankName, bank_account_no: bankAccountNo, bank_account_holder: bankAccountHolder,
          employment_status: employmentStatus, job_title: jobTitle, date_joined: dateJoined,
          contract_start: contractStart, contract_end: contractEnd,
          annual_leave_quota: annualLeaveQuota === '' ? null : annualLeaveQuota,
          prior_leave_taken: priorLeaveTaken === '' ? null : priorLeaveTaken,
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

  // Gate on the SAVED roles (existing), not the editable `roles` state — that
  // matches what the server checks. Self + Administrator carry System Manager,
  // so this also hides the button on those records.
  const canImpersonate = isEdit && !!existing && !existing.roles.includes('System Manager')

  async function onImpersonate() {
    const ok = await confirm({
      title: `Impersonate ${name}?`,
      message: `You'll be logged in as ${name} and the app will reload. Log out and back in to return to your own account.`,
      confirmLabel: 'Impersonate',
    })
    if (!ok) return
    try {
      await impersonate.mutateAsync(name as string)
      // Hard reload so the SPA boots with the impersonated session + fresh csrf.
      window.location.href = '/m'
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not impersonate')
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

  // Hide Delete for your own account; the server also blocks self/protected and
  // refuses (link error) while the user is still assigned to a project or task.
  const canDelete = isEdit && !!existing && existing.name !== boot?.user

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete user?',
      message: `Permanently delete ${name}? This cannot be undone. It is blocked automatically if they are still assigned to any project or task.`,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await del.mutateAsync(name as string)
      toast('success', 'User deleted')
      navigate('/users', { replace: true })
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (isEdit && isLoading) {
    return (
      <DetailScreen title="Edit User" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  return (
    <DetailScreen
      title={isEdit ? 'Edit User' : 'New User'}
      right={
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
          <User className="h-6 w-6" />
        </div>
        <label className="block">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Email</span>
          <input
            type="email"
            value={isEdit ? (name as string) : email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isEdit}
            placeholder="name@company.com"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 dark:disabled:bg-slate-900"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Full name</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
          />
        </label>

        <div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Roles</span>
          <MultiSelectChips
            options={VERNON_ROLE_OPTIONS}
            value={roles}
            onChange={setRoles}
            emptyText="No roles"
          />
        </div>

        <label className="block">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Member type</span>
          <SearchableSelect
            value={memberType}
            onChange={(v) => setMemberType(v)}
            options={[{ value: '', label: 'External / none' }, ...MEMBER_TYPE_OPTIONS]}
          />
        </label>

        {!isEdit && (
          <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:bg-slate-800 dark:border-slate-700">
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
          <>
            <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:bg-slate-800 dark:border-slate-700">
              <span className="text-sm text-slate-700 dark:text-slate-200">Account enabled</span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-5 w-5 accent-brand-600"
              />
            </label>

            {/* Legal & ID */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-800 dark:border-slate-700">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Legal &amp; ID</p>
              <div className="flex flex-col gap-3">
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">NIK KTP</span>
                  <input type="text" value={nikKtp} onChange={(e) => setNikKtp(e.target.value)} className={field} /></label>
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">NPWP</span>
                  <input type="text" value={npwp} onChange={(e) => setNpwp(e.target.value)} className={field} /></label>
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">BPJS Kesehatan</span>
                  <input type="text" value={bpjsKes} onChange={(e) => setBpjsKes(e.target.value)} className={field} /></label>
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">BPJS Ketenagakerjaan</span>
                  <input type="text" value={bpjsTk} onChange={(e) => setBpjsTk(e.target.value)} className={field} /></label>
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Bank name</span>
                  <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} className={field} /></label>
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Account number</span>
                  <input type="text" value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} className={field} /></label>
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Account holder name</span>
                  <input type="text" value={bankAccountHolder} onChange={(e) => setBankAccountHolder(e.target.value)} className={field} /></label>
              </div>
              {/* ponytail: attach_ktp + attach_npwp omitted — no generic private uploader exists (parity with web) */}
            </div>

            {/* Contract */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-800 dark:border-slate-700">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Contract</p>
              <div className="flex flex-col gap-3">
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Employment status</span>
                  <SearchableSelect
                    value={employmentStatus}
                    onChange={(v) => setEmploymentStatus(v)}
                    placeholder="— select —"
                    options={[
                      { value: 'Permanent', label: 'Permanent' },
                      { value: 'Contract', label: 'Contract' },
                      { value: 'Probation', label: 'Probation' },
                      { value: 'Intern', label: 'Intern' },
                    ]}
                  /></label>
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Job title</span>
                  <input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={field} /></label>
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Date joined</span>
                  <input type="date" value={dateJoined} onChange={(e) => setDateJoined(e.target.value)} className={field} /></label>
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Contract start</span>
                  <input type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} className={field} /></label>
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Contract end</span>
                  <input type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} className={field} /></label>
              </div>
            </div>

            {/* Leave */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-800 dark:border-slate-700">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Leave</p>
              <div className="flex flex-col gap-3">
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Annual leave quota (days)</span>
                  <input type="number" min={0} value={annualLeaveQuota}
                    onChange={(e) => setAnnualLeaveQuota(e.target.value === '' ? '' : Number(e.target.value))} className={field} /></label>
                <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Leave already taken this year (pre-system, days)</span>
                  <input type="number" min={0} value={priorLeaveTaken}
                    onChange={(e) => setPriorLeaveTaken(e.target.value === '' ? '' : Number(e.target.value))} className={field} /></label>
                {leaveBalance && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm dark:bg-slate-900 dark:border-slate-700">
                    <span className="block text-xs text-slate-500 dark:text-slate-400">This year</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{leaveBalance.remaining}</span>
                    <span className="text-slate-500 dark:text-slate-400"> / {leaveBalance.quota} days remaining</span>
                    {typeof leaveBalance.prior === 'number' && leaveBalance.prior > 0 && (
                      <span className="text-slate-500 dark:text-slate-400"> · {leaveBalance.used} used (incl. {leaveBalance.prior} pre-system)</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {canImpersonate && (
              <button
                onClick={onImpersonate}
                disabled={impersonate.isPending}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 active:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300 dark:active:bg-indigo-500/25"
              >
                {impersonate.isPending ? 'Switching…' : `Log in as ${name}`}
              </button>
            )}
            <button
              onClick={onResetPassword}
              disabled={resetPw.isPending}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 active:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:active:bg-slate-700/50"
            >
              {resetPw.isPending ? 'Sending…' : 'Send password reset email'}
            </button>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Set new password</span>
              <div className="mt-1 flex gap-2">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                />
                <button
                  onClick={onSetPassword}
                  disabled={!newPassword || setPw.isPending}
                  className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:active:bg-slate-700/50"
                >
                  {setPw.isPending ? 'Setting…' : 'Set password'}
                </button>
              </div>
            </label>
            {canDelete && (
              <button
                onClick={onDelete}
                disabled={del.isPending}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 active:bg-rose-100 disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300 dark:active:bg-rose-500/25"
              >
                {del.isPending ? 'Deleting…' : 'Delete user'}
              </button>
            )}

            <button
              onClick={() => navigate(`/superpowers/${name}`)}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 active:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:active:bg-slate-700/50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
                <Sparkles className="h-5 w-5" />
              </span>
              <span className="flex-1">Kekuatan Super</span>
              <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
            </button>

            <LeaderNotesSection user={name as string} />
          </>
        )}
      </div>
    </DetailScreen>
  )
}
