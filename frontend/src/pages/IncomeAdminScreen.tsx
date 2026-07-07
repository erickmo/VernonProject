import { useState } from 'react'
import { Plus, X, Banknote } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Spinner } from '@/components/ui'
import { useIncomeManage, useSaveOpportunity, useReviewIncomeClaim } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { formatDate } from '@/lib/format'
import type { ManagedOpportunity, ManagedClaim } from '@/lib/types'

const CLAIM_STATUSES = ['Submitted', 'Approved', 'Paid', 'Rejected'] as const

const STATUS_HUE: Record<string, string> = {
  Open: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Closed: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  Submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Approved: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

function Chip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_HUE[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}

const inputCls =
  'w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 p-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500'

type Draft = {
  name?: string
  title: string
  description: string
  reward: string
  period_start: string
  period_end: string
  status: string
}

const EMPTY: Draft = { title: '', description: '', reward: '', period_start: '', period_end: '', status: 'Open' }

function toDraft(o: ManagedOpportunity): Draft {
  return {
    name: o.name,
    title: o.title,
    description: o.description ?? '',
    reward: o.reward,
    period_start: o.period_start ?? '',
    period_end: o.period_end ?? '',
    status: o.status,
  }
}

export default function IncomeAdminScreen() {
  const { data, isLoading } = useIncomeManage()
  const saveOpp = useSaveOpportunity()
  const review = useReviewIncomeClaim()
  const toast = useToast()
  const [tab, setTab] = useState<'opps' | 'claims'>('opps')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [reviewing, setReviewing] = useState<ManagedClaim | null>(null)
  const [note, setNote] = useState('')

  const saveDraft = () => {
    if (!draft || !draft.title.trim() || !draft.reward.trim() || !draft.period_start) return
    saveOpp.mutate(
      {
        name: draft.name,
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        reward: draft.reward.trim(),
        period_start: draft.period_start,
        period_end: draft.period_end || undefined,
        status: draft.status,
      },
      {
        onSuccess: () => {
          toast('success', draft.name ? 'Updated' : 'Created')
          setDraft(null)
        },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not save'),
      },
    )
  }

  const applyStatus = (status: string) => {
    if (!reviewing) return
    review.mutate(
      { name: reviewing.name, status, review_note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast('success', `Marked ${status}`)
          setReviewing(null)
        },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not update'),
      },
    )
  }

  return (
    <DetailScreen title="Manage Extra Income">
      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        {(['opps', 'claims'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              tab === t
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {t === 'opps' ? 'Opportunities' : `Claims${data ? ` (${data.claims.length})` : ''}`}
          </button>
        ))}
      </div>

      {isLoading && !data ? (
        <FullScreenLoader />
      ) : tab === 'opps' ? (
        <>
          <button
            onClick={() => setDraft({ ...EMPTY })}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition active:scale-95"
          >
            <Plus className="h-4 w-4" />
            New opportunity
          </button>
          {!data || data.opportunities.length === 0 ? (
            <EmptyState icon={Banknote} title="No opportunities" subtitle="Create one to let people claim extra income." />
          ) : (
            <div className="space-y-2">
              {data.opportunities.map((o) => (
                <button
                  key={o.name}
                  onClick={() => setDraft(toDraft(o))}
                  className="w-full rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 text-left shadow-card transition active:scale-[0.99]"
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="font-display text-base font-bold text-stone-800 dark:text-slate-50">{o.title}</p>
                    <Chip status={o.status} />
                  </div>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{o.reward}</p>
                  {(o.period_start || o.period_end) && (
                    <p className="mt-0.5 text-xs text-stone-400 dark:text-slate-500">
                      {o.period_start ? formatDate(o.period_start) : '—'}
                      {o.period_end ? ` → ${formatDate(o.period_end)}` : ''}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      ) : !data || data.claims.length === 0 ? (
        <EmptyState icon={Banknote} title="No claims yet" subtitle="Claims people submit show up here for review." />
      ) : (
        <div className="space-y-2">
          {data.claims.map((c) => (
            <div key={c.name} className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-stone-800 dark:text-slate-100">{c.claimed_by_name}</p>
                  <p className="truncate text-xs text-stone-400 dark:text-slate-500">{c.opportunity_title}</p>
                </div>
                <Chip status={c.status} />
              </div>
              <p className="whitespace-pre-line text-sm text-stone-600 dark:text-slate-300">{c.details}</p>
              {c.review_note && (
                <p className="mt-1.5 rounded-lg bg-paper-line dark:bg-slate-700/50 px-2.5 py-1.5 text-xs text-stone-500 dark:text-slate-400">
                  <span className="font-semibold">Note:</span> {c.review_note}
                </p>
              )}
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-stone-400 dark:text-slate-500">{formatDate(c.at)}</p>
                <button
                  onClick={() => {
                    setReviewing(c)
                    setNote(c.review_note ?? '')
                  }}
                  className="rounded-lg bg-brand-50 dark:bg-brand-500/15 px-3 py-1.5 text-xs font-semibold text-brand-600 dark:text-brand-300 active:scale-95"
                >
                  Review
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Opportunity form sheet */}
      {draft && (
        <Sheet title={draft.name ? 'Edit opportunity' : 'New opportunity'} onClose={() => !saveOpp.isPending && setDraft(null)}>
          <div className="space-y-3">
            <input className={inputCls} placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <textarea className={inputCls} rows={3} placeholder="Description (optional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <input className={inputCls} placeholder="Reward (e.g. Rp 500.000 / voucher)" value={draft.reward} onChange={(e) => setDraft({ ...draft, reward: e.target.value })} />
            <div className="flex gap-2">
              <label className="flex-1 text-xs font-medium text-stone-500 dark:text-slate-400">
                Start
                <input type="date" className={`${inputCls} mt-1`} value={draft.period_start} onChange={(e) => setDraft({ ...draft, period_start: e.target.value })} />
              </label>
              <label className="flex-1 text-xs font-medium text-stone-500 dark:text-slate-400">
                End (optional)
                <input type="date" className={`${inputCls} mt-1`} value={draft.period_end} onChange={(e) => setDraft({ ...draft, period_end: e.target.value })} />
              </label>
            </div>
            <div className="flex gap-2">
              {['Open', 'Closed'].map((s) => (
                <button
                  key={s}
                  onClick={() => setDraft({ ...draft, status: s })}
                  className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                    draft.status === s ? 'bg-brand-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              disabled={!draft.title.trim() || !draft.reward.trim() || !draft.period_start || saveOpp.isPending}
              onClick={saveDraft}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              {saveOpp.isPending ? <Spinner className="h-4 w-4" /> : 'Save'}
            </button>
          </div>
        </Sheet>
      )}

      {/* Claim review sheet */}
      {reviewing && (
        <Sheet title="Review claim" onClose={() => !review.isPending && setReviewing(null)}>
          <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{reviewing.claimed_by_name}</p>
          <p className="mb-3 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{reviewing.details}</p>
          <textarea
            className={inputCls}
            rows={2}
            placeholder="Review note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {CLAIM_STATUSES.map((s) => (
              <button
                key={s}
                disabled={review.isPending}
                onClick={() => applyStatus(s)}
                className={`rounded-xl py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-50 ${STATUS_HUE[s]}`}
              >
                {reviewing.status === s ? `● ${s}` : s}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </DetailScreen>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative mx-auto max-h-[90vh] w-full sm:max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
