import { useMemo, useState } from 'react'
import { Search, Send, Users } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { useGiftRecipients, useGiftPoints, useWallet } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import type { GiftUser } from '@/lib/types'

export default function GiftPointsScreen() {
  const toast = useToast()
  const confirm = useConfirm()
  const { data: wallet } = useWallet()
  const { data, isLoading } = useGiftRecipients()
  const gift = useGiftPoints()

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<GiftUser | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const balance = wallet?.balance ?? 0
  const users = data?.users ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => u.full_name?.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
    )
  }, [users, search])

  const submit = async () => {
    if (gift.isPending || !selected) return
    const amt = Number(amount)
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
    <DetailScreen title="Gift Points" right={null}>
      <p className="mb-3 rounded-2xl bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-500 shadow-card">
        Your balance: <span className="font-semibold text-slate-900 dark:text-slate-50">{balance}</span>
      </p>
      {selected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-card">
            <Avatar name={selected.full_name} image={selected.user_image} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900 dark:text-slate-50">{selected.full_name}</p>
              <p className="truncate text-sm text-slate-400">{selected.name}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-sm font-medium text-brand-600">
              Change
            </button>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-card space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Points</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-lg font-semibold text-slate-900 dark:text-slate-50 outline-none focus:border-brand-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Note (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Say something nice"
                className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-slate-50 outline-none focus:border-brand-500"
              />
            </label>
          </div>

          <button
            onClick={submit}
            disabled={gift.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white active:scale-[0.99] disabled:opacity-60"
          >
            {gift.isPending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            Gift points
          </button>
        </div>
      ) : (
        <>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
            />
          </div>
          {isLoading ? (
            <Spinner className="mx-auto h-5 w-5 text-slate-400" />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Users} title="No users" />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-card">
              {filtered.map((u) => (
                <button
                  key={u.name}
                  onClick={() => setSelected(u)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-700/50"
                >
                  <Avatar name={u.full_name} image={u.user_image} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{u.full_name}</p>
                    <p className="truncate text-xs text-slate-400">{u.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </DetailScreen>
  )
}
