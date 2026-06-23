import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Gift } from 'lucide-react'
import { Spinner, Avatar } from '@/components/ui'
import { useBoot, canGrantPoints } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { mobileApi } from '@/lib/api'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { GrantUser } from '@/lib/types'

export default function GrantPoints() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const toast = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['grantUsers'],
    queryFn: () => mobileApi.listGrantUsers(),
    enabled: canGrantPoints(boot),
  })

  const [selectedName, setSelectedName] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const users = data?.users ?? []
  const selected = useMemo<GrantUser | null>(
    () => users.find((u) => u.name === selectedName) ?? null,
    [users, selectedName],
  )

  // Access gate: redirect outside render.
  const blocked = boot !== undefined && !canGrantPoints(boot)
  useEffect(() => {
    if (blocked) navigate('/me', { replace: true })
  }, [blocked, navigate])

  if (bootLoading || blocked) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const submit = async () => {
    if (submitting) return
    const amt = Number(amount)
    if (!selected) return toast('error', 'Pick a user')
    if (!Number.isFinite(amt) || amt <= 0) return toast('error', 'Enter an amount greater than zero')
    setSubmitting(true)
    try {
      const res = await mobileApi.grantPoints(selected.name, amt, note.trim() || undefined)
      toast('success', `Granted ${res.granted} to ${selected.full_name}. New balance ${res.balance}.`)
      setSelectedName('')
      setAmount('')
      setNote('')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Grant failed')
    } finally {
      setSubmitting(false)
    }
  }

  const fieldLabel = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500'

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Grant Points</h1>

      <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-card p-6 space-y-5">
        <div>
          <span className={fieldLabel}>Recipient</span>
          {isLoading ? (
            <Spinner className="h-5 w-5 text-slate-400" />
          ) : (
            <SearchableSelect
              value={selectedName}
              onChange={setSelectedName}
              options={users.map((u) => ({ value: u.name, label: `${u.full_name} (${u.name})` }))}
              placeholder="Search users…"
            />
          )}
          {selected && (
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
              <Avatar name={selected.full_name} image={selected.user_image} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {selected.full_name}
                </p>
                <p className="truncate text-xs text-slate-400">{selected.name}</p>
              </div>
            </div>
          )}
        </div>

        <label className="block">
          <span className={fieldLabel}>Points</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-lg font-semibold text-slate-900 dark:text-slate-50 outline-none focus:border-brand-500"
          />
        </label>

        <label className="block">
          <span className={fieldLabel}>Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Reason for the grant"
            className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-slate-50 outline-none focus:border-brand-500"
          />
        </label>

        <button
          onClick={submit}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
        >
          {submitting ? <Spinner className="h-4 w-4" /> : <Gift className="h-4 w-4" />}
          Grant points
        </button>
      </div>
    </div>
  )
}
