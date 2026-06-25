import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Gift } from 'lucide-react'
import { Spinner, Avatar } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { PageGrid, FieldGrid, SectionCard } from '@web/components/layout'
import { useBoot, canGrantPoints } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { mobileApi } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { GrantUser } from '@/lib/types'

export default function GrantPoints() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const toast = useToast()
  const confirm = useConfirm()

  const q = useQuery({
    queryKey: ['grantUsers'],
    queryFn: () => mobileApi.listGrantUsers(),
    enabled: canGrantPoints(boot),
  })
  const { data, isLoading } = q

  const [selectedName, setSelectedName] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [amountError, setAmountError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)

  const users = data?.users ?? []
  const selected = useMemo<GrantUser | null>(
    () => users.find((u) => u.name === selectedName) ?? null,
    [users, selectedName],
  )

  // Focus the amount field once a recipient is selected.
  useEffect(() => {
    if (selected) amountRef.current?.focus()
  }, [selected])

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
    if (!Number.isFinite(amt) || amt <= 0) {
      setAmountError('Enter an amount greater than zero')
      amountRef.current?.focus()
      return toast('error', 'Enter an amount greater than zero')
    }
    setAmountError(undefined)
    const ok = await confirm({
      title: 'Grant points?',
      message: `Grant ${formatNumber(amt)} points to ${selected.full_name}? This creates a ledger entry and cannot be undone.`,
      confirmLabel: 'Grant',
    })
    if (!ok) return
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="space-y-6"
    >
      <h1 className="text-2xl font-bold">Grant Points</h1>

      <PageGrid
        main={
          <SectionCard title="Grant points">
            <div className="space-y-5">
              <Field label="Recipient" required>
                {(id) =>
                  isLoading ? (
                    <Spinner className="h-5 w-5 text-slate-400" />
                  ) : q.isError ? (
                    <ErrorState onRetry={() => q.refetch()} />
                  ) : (
                    <div id={id}>
                      <SearchableSelect
                        value={selectedName}
                        onChange={setSelectedName}
                        options={users.map((u) => ({ value: u.name, label: `${u.full_name} (${u.name})` }))}
                        placeholder="Search users…"
                      />
                    </div>
                  )
                }
              </Field>

              <FieldGrid>
                <Field label="Points" required error={amountError}>
                  {(id) => (
                    <input
                      id={id}
                      ref={amountRef}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value)
                        if (amountError) setAmountError(undefined)
                      }}
                      placeholder="0"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-lg font-semibold text-slate-900 dark:text-slate-50 outline-none focus:border-brand-500"
                    />
                  )}
                </Field>

                <Field label="Note (optional)">
                  {(id) => (
                    <textarea
                      id={id}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="Reason for the grant"
                      className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-slate-50 outline-none focus:border-brand-500"
                    />
                  )}
                </Field>
              </FieldGrid>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {submitting ? <Spinner className="h-4 w-4" /> : <Gift className="h-4 w-4" />}
                Grant points
              </button>
            </div>
          </SectionCard>
        }
        rail={
          <>
            <SectionCard title="Recipient">
              {selected ? (
                <div className="flex items-center gap-3">
                  <Avatar name={selected.full_name} image={selected.user_image} size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {selected.full_name}
                    </p>
                    <p className="truncate text-xs text-slate-400">{selected.name}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Search and pick a user to grant points to.</p>
              )}
            </SectionCard>
            <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
              Grants create a ledger entry and can't be undone.
            </div>
          </>
        }
      />
    </form>
  )
}
