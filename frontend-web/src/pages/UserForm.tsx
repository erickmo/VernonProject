import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { MultiSelectChips } from '@/components/MultiSelectChips'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { mobileApi } from '@/lib/api'
import type { LeaveBalance } from '@/lib/types'
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
        await mobileApi.updateEmployeeProfile(name as string, {
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

        {/* Legal / ID tile (edit mode only) */}
        {isEdit && (
          <BentoTile span="md" tone="plain" title="Legal & ID">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
              <Field label="NIK KTP">
                {(id) => (
                  <input id={id} type="text" value={nikKtp} onChange={(e) => { setNikKtp(e.target.value); setDirty(true) }} className={field} />
                )}
              </Field>
              <Field label="NPWP">
                {(id) => (
                  <input id={id} type="text" value={npwp} onChange={(e) => { setNpwp(e.target.value); setDirty(true) }} className={field} />
                )}
              </Field>
              <Field label="BPJS Kesehatan">
                {(id) => (
                  <input id={id} type="text" value={bpjsKes} onChange={(e) => { setBpjsKes(e.target.value); setDirty(true) }} className={field} />
                )}
              </Field>
              <Field label="BPJS Ketenagakerjaan">
                {(id) => (
                  <input id={id} type="text" value={bpjsTk} onChange={(e) => { setBpjsTk(e.target.value); setDirty(true) }} className={field} />
                )}
              </Field>
              <Field label="Bank name">
                {(id) => (
                  <input id={id} type="text" value={bankName} onChange={(e) => { setBankName(e.target.value); setDirty(true) }} className={field} />
                )}
              </Field>
              <Field label="Account number">
                {(id) => (
                  <input id={id} type="text" value={bankAccountNo} onChange={(e) => { setBankAccountNo(e.target.value); setDirty(true) }} className={field} />
                )}
              </Field>
              <div className="sm:col-span-2">
                <Field label="Account holder name">
                  {(id) => (
                    <input id={id} type="text" value={bankAccountHolder} onChange={(e) => { setBankAccountHolder(e.target.value); setDirty(true) }} className={field} />
                  )}
                </Field>
              </div>
              {/* ponytail: attach_ktp + attach_npwp omitted — no generic private uploader exists; add when uploadPrivateFile helper is built */}
            </div>
          </BentoTile>
        )}

        {/* Contract tile (edit mode only) */}
        {isEdit && (
          <BentoTile span="md" tone="plain" title="Contract">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
              <Field label="Employment status">
                {(id) => (
                  <select id={id} value={employmentStatus} onChange={(e) => { setEmploymentStatus(e.target.value); setDirty(true) }} className={field}>
                    <option value="">— select —</option>
                    <option value="Permanent">Permanent</option>
                    <option value="Contract">Contract</option>
                    <option value="Probation">Probation</option>
                    <option value="Intern">Intern</option>
                  </select>
                )}
              </Field>
              <Field label="Job title">
                {(id) => (
                  <input id={id} type="text" value={jobTitle} onChange={(e) => { setJobTitle(e.target.value); setDirty(true) }} className={field} />
                )}
              </Field>
              <Field label="Date joined">
                {(id) => (
                  <input id={id} type="date" value={dateJoined} onChange={(e) => { setDateJoined(e.target.value); setDirty(true) }} className={field} />
                )}
              </Field>
              <div />
              <Field label="Contract start">
                {(id) => (
                  <input id={id} type="date" value={contractStart} onChange={(e) => { setContractStart(e.target.value); setDirty(true) }} className={field} />
                )}
              </Field>
              <Field label="Contract end">
                {(id) => (
                  <input id={id} type="date" value={contractEnd} onChange={(e) => { setContractEnd(e.target.value); setDirty(true) }} className={field} />
                )}
              </Field>
              {/* ponytail: attach_contract omitted — no generic private uploader exists; add when uploadPrivateFile helper is built */}
            </div>
          </BentoTile>
        )}

        {/* Leave tile (edit mode only) */}
        {isEdit && (
          <BentoTile span="sm" tone="plain" title="Leave">
            <div className="mt-1 space-y-4">
              <Field label="Annual leave quota (days)">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={0}
                    value={annualLeaveQuota}
                    onChange={(e) => { setAnnualLeaveQuota(e.target.value === '' ? '' : Number(e.target.value)); setDirty(true) }}
                    className={field}
                  />
                )}
              </Field>
              <Field label="Leave already taken this year (pre-system, days)">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={0}
                    value={priorLeaveTaken}
                    onChange={(e) => { setPriorLeaveTaken(e.target.value === '' ? '' : Number(e.target.value)); setDirty(true) }}
                    className={field}
                  />
                )}
              </Field>
              {leaveBalance && (
                <div className="rounded-xl border border-line bg-canvas px-3 py-3 text-sm">
                  <span className="text-xs text-muted block mb-1">This year</span>
                  <span className="font-semibold text-ink">
                    {leaveBalance.remaining}
                  </span>
                  <span className="text-muted"> / {leaveBalance.quota} days remaining</span>
                  {typeof leaveBalance.prior === 'number' && leaveBalance.prior > 0 && (
                    <span className="text-muted"> · {leaveBalance.used} used (incl. {leaveBalance.prior} pre-system)</span>
                  )}
                </div>
              )}
            </div>
          </BentoTile>
        )}

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
