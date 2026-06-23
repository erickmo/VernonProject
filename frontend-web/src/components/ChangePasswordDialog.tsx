import { useState } from 'react'
import { useChangeMyPassword } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { parseFrappeError } from '@/lib/format'
import { Dialog } from '@web/components/overlays/Dialog'

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const change = useChangeMyPassword()
  const toast = useToast()
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [confirm, setConfirm] = useState('')

  const clearFields = () => { setOld(''); setNew(''); setConfirm('') }

  const handleClose = () => { clearFields(); onClose() }

  const submit = async () => {
    if (!oldPassword || !newPassword || !confirm) {
      toast('error', 'All fields are required')
      return
    }
    if (newPassword !== confirm) {
      toast('error', 'Passwords do not match')
      return
    }
    try {
      await change.mutateAsync({ oldPassword, newPassword })
      toast('success', 'Password changed')
      clearFields()
      onClose()
    } catch (e) {
      toast('error', parseFrappeError(e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Change password"
      footer={<>
        <button
          onClick={handleClose}
          className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={change.isPending}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-60 hover:bg-brand-700"
        >
          {change.isPending ? 'Saving…' : 'Change password'}
        </button>
      </>}
    >
      <div className="space-y-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
          Current password
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Enter current password"
            value={oldPassword}
            onChange={(e) => setOld(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
          New password
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
        </label>
      </div>
    </Dialog>
  )
}
