import { useMemo, useState } from 'react'
import { Search, Send, Users } from 'lucide-react'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { useGiftRecipients, useGiftPoints, useWallet } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import type { GiftUser } from '@/lib/types'
import { formatNumber } from '@/lib/format'
import { Dialog } from '@web/components/overlays/Dialog'
import { ErrorState, rowButtonProps } from '@web/components/ui'

export default function GiftPoints() {
  const toast = useToast()
  const confirm = useConfirm()
  const { data: wallet } = useWallet()
  const recipients = useGiftRecipients()
  const { data, isLoading } = recipients
  const gift = useGiftPoints()

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<GiftUser | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const balance = wallet?.balance ?? 0
  const users = data?.users ?? []

  const amt = Number(amount)
  const amountError =
    amount.trim() === ''
      ? ''
      : !Number.isInteger(amt) || amt <= 0
        ? 'Enter a whole number greater than zero'
        : amt > balance
          ? 'Not enough points'
          : ''
  const canSubmit = amount.trim() !== '' && !amountError && !gift.isPending
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => u.full_name?.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
    )
  }, [users, search])

  const closeDialog = () => {
    if (gift.isPending) return
    setSelected(null)
    setAmount('')
    setNote('')
  }

  const submit = async () => {
    if (gift.isPending || !selected) return
    if (!Number.isInteger(amt) || amt <= 0) return toast('error', 'Enter a whole number greater than zero')
    if (amt > balance) return toast('error', 'Not enough points')
    const ok = await confirm({
      title: `Gift ${amt} points to ${selected.full_name}?`,
      confirmLabel: 'Gift points',
    })
    if (!ok) return
    try {
      const res = await gift.mutateAsync({ toUser: selected.name, amount: amt, note: note.trim() || undefined })
      toast('success', `Gifted ${res.gifted} to ${selected.full_name}. New balance ${res.balance}.`)
      setSelected(null)
      setAmount('')
      setNote('')
      setSearch('')
    } catch (e: any) {
      toast('error', e?.message || 'Gift failed')
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Gift Points</h1>

      <p className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 text-sm text-slate-500 shadow-card max-w-sm">
        Your balance:{' '}
        <span className="font-semibold text-slate-900 dark:text-slate-50">{formatNumber(balance)}</span>
      </p>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm focus:border-brand-600 focus:outline-none dark:text-slate-100"
        />
      </div>

      {recipients.isError ? (
        <ErrorState onRetry={() => recipients.refetch()} />
      ) : isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No users" />
      ) : (
        <div className="max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((u) => (
                <tr
                  key={u.name}
                  {...rowButtonProps(() => {
                    setSelected(u)
                    setAmount('')
                    setNote('')
                  })}
                  aria-label={`Gift points to ${u.full_name}`}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.full_name} image={u.user_image} size={36} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                          {u.full_name}
                        </p>
                        <p className="truncate text-xs text-slate-400">{u.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                      <Send className="h-3 w-3" />
                      Gift
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={!!selected}
        onClose={closeDialog}
        title="Gift points"
        onSubmit={submit}
        footer={
          <>
            <button
              type="button"
              onClick={closeDialog}
              disabled={gift.isPending}
              className="rounded-lg bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400"
            >
              {gift.isPending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              Gift points
            </button>
          </>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800 p-4">
              <Avatar name={selected.full_name} image={selected.user_image} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900 dark:text-slate-50">{selected.full_name}</p>
                <p className="truncate text-sm text-slate-400">{selected.name}</p>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Points</span>
              <input
                type="number"
                inputMode="numeric"
                autoFocus
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                aria-invalid={!!amountError}
                className={`w-full rounded-lg border bg-transparent px-3 py-2.5 text-lg font-semibold text-slate-900 dark:text-slate-50 outline-none ${
                  amountError
                    ? 'border-red-400 focus:border-red-500'
                    : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                }`}
              />
              {amountError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{amountError}</p>}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Note (optional)
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Say something nice"
                className="w-full resize-none rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-slate-50 outline-none focus:border-brand-500"
              />
            </label>

            <p className="text-xs text-slate-400">
              Your balance:{' '}
              <span className="font-semibold text-slate-600 dark:text-slate-300">{formatNumber(balance)}</span>
            </p>
          </div>
        )}
      </Dialog>
    </div>
  )
}
