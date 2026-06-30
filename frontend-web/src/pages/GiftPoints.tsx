import { useMemo, useState } from 'react'
import { Search, Send, Users } from 'lucide-react'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { useGiftRecipients, useGiftPoints, useWallet } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import type { GiftUser } from '@/lib/types'
import { formatNumber } from '@/lib/format'
import { Dialog } from '@web/components/overlays/Dialog'
import { ErrorState } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'

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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink">Gift Points</h1>

      <BentoGrid>
        {/* Balance summary tile */}
        <BentoTile span="sm" tone="solid" accent="amber" title="Your balance">
          <BentoStat
            value={formatNumber(balance)}
            label="available to gift"
          />
        </BentoTile>

        {/* Hint tile */}
        <BentoTile span="sm" tone="tint" accent="amber">
          <p className="text-sm text-muted">
            Pick someone to send points. Gifts come out of your balance and can't be undone.
          </p>
        </BentoTile>

        {/* Recipient picker tile */}
        <BentoTile span="full" tone="plain" title="Choose recipient">
          <div className="mt-1 space-y-5">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {filtered.map((u) => (
                  <button
                    key={u.name}
                    type="button"
                    onClick={() => {
                      setSelected(u)
                      setAmount('')
                      setNote('')
                    }}
                    aria-label={`Gift points to ${u.full_name}`}
                    className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 text-left hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-hover/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition"
                  >
                    <Avatar name={u.full_name} image={u.user_image} config={u.avatar_config} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {u.full_name}
                      </p>
                      <p className="truncate text-xs text-muted">{u.name}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600">
                      <Send className="h-3 w-3" />
                      Gift
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </BentoTile>
      </BentoGrid>

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
            <div className="flex items-center gap-3 rounded-lg bg-hover/[0.04] p-4">
              <Avatar name={selected.full_name} image={selected.user_image} config={selected.avatar_config} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{selected.full_name}</p>
                <p className="truncate text-sm text-muted">{selected.name}</p>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Points</span>
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
                    : 'border-line focus:border-brand-500'
                }`}
              />
              {amountError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{amountError}</p>}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Note (optional)
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Say something nice"
                className="w-full resize-none rounded-lg border border-line bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-slate-50 outline-none focus:border-brand-500"
              />
            </label>

            <p className="text-xs text-muted">
              Your balance:{' '}
              <span className="font-semibold text-muted">{formatNumber(balance)}</span>
            </p>
          </div>
        )}
      </Dialog>
    </div>
  )
}
