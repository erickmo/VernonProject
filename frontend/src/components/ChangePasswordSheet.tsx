import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { useChangeMyPassword } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'

interface Props {
  open: boolean
  onClose: () => void
}

export function ChangePasswordSheet({ open, onClose }: Props) {
  const toast = useToast()
  const change = useChangeMyPassword()

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  if (!open) return null

  const clearFields = () => {
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const handleClose = () => {
    clearFields()
    onClose()
  }

  const save = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast('error', 'All fields are required')
      return
    }
    if (newPassword !== confirmPassword) {
      toast('error', 'Passwords do not match')
      return
    }
    try {
      await change.mutateAsync({ oldPassword, newPassword })
      toast('success', 'Password changed')
      clearFields()
      onClose()
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={handleClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Change password</h3>
          <button onClick={handleClose} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-400 focus:bg-white"
              placeholder="Enter current password"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-400 focus:bg-white"
              placeholder="Enter new password"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-400 focus:bg-white"
              placeholder="Confirm new password"
            />
          </label>
        </div>

        <button
          onClick={save}
          disabled={change.isPending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {change.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {change.isPending ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </div>
  )
}
