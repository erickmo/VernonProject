import { useState } from 'react'
import { Banknote, Gift, CalendarDays, X } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Spinner } from '@/components/ui'
import { useIncome, useSubmitIncomeClaim } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { formatDate } from '@/lib/format'
import type { IncomeOpportunity } from '@/lib/types'

// Claim-status → chip colors. Mirrors the doctype Select options.
const STATUS_HUE: Record<string, string> = {
  Submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Approved: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_HUE[status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
      {status}
    </span>
  )
}

function period(o: IncomeOpportunity) {
  if (!o.period_start && !o.period_end) return null
  const s = o.period_start ? formatDate(o.period_start) : '—'
  return o.period_end ? `${s} → ${formatDate(o.period_end)}` : `from ${s}`
}

export default function IncomeScreen() {
  const { data, isLoading } = useIncome()
  const submit = useSubmitIncomeClaim()
  const toast = useToast()
  const [claiming, setClaiming] = useState<IncomeOpportunity | null>(null)
  const [details, setDetails] = useState('')

  const send = () => {
    if (!claiming || !details.trim()) return
    submit.mutate(
      { opportunity: claiming.name, details: details.trim() },
      {
        onSuccess: () => {
          toast('success', 'Claim submitted')
          setClaiming(null)
          setDetails('')
        },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not submit'),
      },
    )
  }

  return (
    <DetailScreen title="Extra Income">
      {isLoading && !data ? (
        <FullScreenLoader />
      ) : (
        <>
          {/* Opportunities */}
          {!data || data.opportunities.length === 0 ? (
            <EmptyState icon={Banknote} title="No opportunities" subtitle="Check back later for ways to earn extra." />
          ) : (
            <div className="space-y-3">
              {data.opportunities.map((o) => {
                const p = period(o)
                const claimed = o.my_claim_status
                const canClaim = !claimed || claimed === 'Rejected'
                return (
                  <div key={o.name} className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="font-display text-base font-bold text-stone-800 dark:text-slate-50">{o.title}</p>
                      {claimed && <StatusChip status={claimed} />}
                    </div>
                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <Gift className="h-3.5 w-3.5" />
                      {o.reward}
                    </div>
                    {p && (
                      <p className="mb-2 flex items-center gap-1.5 text-xs text-stone-400 dark:text-slate-500">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {p}
                      </p>
                    )}
                    {o.description && (
                      <p className="mb-3 whitespace-pre-line text-sm text-stone-600 dark:text-slate-300">{o.description}</p>
                    )}
                    {canClaim ? (
                      <button
                        onClick={() => {
                          setClaiming(o)
                          setDetails('')
                        }}
                        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition active:scale-95"
                      >
                        {claimed === 'Rejected' ? 'Claim again' : 'Claim'}
                      </button>
                    ) : (
                      <p className="text-xs font-medium text-stone-400 dark:text-slate-500">You already claimed this.</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* My claims */}
          {data && data.claims.length > 0 && (
            <>
              <p className="mb-2 mt-6 px-1 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
                My claims
              </p>
              <div className="space-y-2">
                {data.claims.map((c) => (
                  <div key={c.name} className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">{c.opportunity_title}</p>
                      <StatusChip status={c.status} />
                    </div>
                    <p className="whitespace-pre-line text-sm text-stone-600 dark:text-slate-300">{c.details}</p>
                    {c.review_note && (
                      <p className="mt-1.5 rounded-lg bg-paper-line dark:bg-slate-700/50 px-2.5 py-1.5 text-xs text-stone-500 dark:text-slate-400">
                        <span className="font-semibold">Note:</span> {c.review_note}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-stone-400 dark:text-slate-500">{formatDate(c.at)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Claim sheet */}
      {claiming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => !submit.isPending && setClaiming(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative mx-auto max-h-[90vh] w-full sm:max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Claim: {claiming.title}</h2>
              <button onClick={() => !submit.isPending && setClaiming(null)} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Tell the reviewer what you did to earn this. They'll review and mark it paid.
            </p>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Describe your claim…"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 p-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
            />
            <button
              disabled={!details.trim() || submit.isPending}
              onClick={send}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              {submit.isPending ? <Spinner className="h-4 w-4" /> : 'Submit claim'}
            </button>
          </div>
        </div>
      )}
    </DetailScreen>
  )
}
