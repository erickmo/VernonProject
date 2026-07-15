import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banknote, Plus } from 'lucide-react'
import { Spinner, EmptyState, Segmented } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Sheet } from '@web/components/Sheet'
import { Button } from '@web/components/ui'
import { DatePicker } from '@web/components/DatePicker'
import {
  useBoot,
  canManageIncome,
  useIncomeManage,
  useSaveOpportunity,
  useReviewIncomeClaim,
} from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { formatDate } from '@/lib/format'
import type { ManagedOpportunity, ManagedClaim } from '@/lib/types'

type Tab = 'opps' | 'claims'
const CLAIM_STATUSES = ['Submitted', 'Approved', 'Paid', 'Rejected'] as const

const STATUS_HUE: Record<string, string> = {
  Open: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Closed: 'bg-surface text-muted',
  Submitted: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Approved: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Paid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Rejected: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

function Chip({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_HUE[status] ?? 'bg-surface text-muted'}`}>
      {status}
    </span>
  )
}

const inputCls =
  'w-full rounded-xl border border-line bg-hover/[0.04] px-3 py-2.5 text-sm text-ink outline-none focus:border-brand-500'

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

export default function IncomeAdmin() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const toast = useToast()
  const confirm = useConfirm()
  const manageQ = useIncomeManage()
  const { data, isLoading } = manageQ
  const saveOpp = useSaveOpportunity()
  const review = useReviewIncomeClaim()

  const [tab, setTab] = useState<Tab>('opps')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [reviewing, setReviewing] = useState<ManagedClaim | null>(null)
  const [note, setNote] = useState('')

  const blocked = !boot ? false : !canManageIncome(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (bootLoading) {
    return <div className="flex justify-center py-20"><Spinner /></div>
  }
  if (blocked) return null

  const opps = data?.opportunities ?? []
  const claims = data?.claims ?? []
  const pending = claims.filter((c) => c.status === 'Submitted').length

  const closeDraft = () => { if (!saveOpp.isPending) setDraft(null) }
  const closeReview = () => { if (!review.isPending) setReviewing(null) }

  const saveDraft = () => {
    if (!draft || !draft.title.trim() || !draft.reward.trim() || !draft.period_start || saveOpp.isPending) return
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

  const applyStatus = async (status: string) => {
    if (!reviewing || review.isPending) return
    const ok = await confirm({
      title: `Mark this claim ${status}?`,
      message: status === 'Rejected' ? 'The claimant will see this as rejected.' : undefined,
      confirmLabel: status,
      destructive: status === 'Rejected',
    })
    if (!ok) return
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
    <Page>
      <PageHeader icon={Banknote} title="Manage Extra Income" />

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="emerald" title="Manage">
          <div className="mt-1 flex flex-col gap-3">
            <Segmented
              options={[
                { value: 'opps', label: 'Opportunities' },
                { value: 'claims', label: 'Claims', badge: pending || undefined },
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === 'opps' && (
              <Button variant="primary" size="sm" onClick={() => setDraft({ ...EMPTY })}>
                <Plus className="h-4 w-4" /> New opportunity
              </Button>
            )}
          </div>
        </BentoTile>

        <BentoTile span="sm" tone="tint" accent="emerald">
          {tab === 'opps' ? (
            <BentoStat
              value={opps.length}
              label={opps.length === 1 ? 'opportunity' : 'opportunities'}
              delta={`${opps.filter((o) => o.status === 'Open').length} open`}
            />
          ) : (
            <BentoStat value={claims.length} label={claims.length === 1 ? 'claim' : 'claims'} delta={`${pending} to review`} />
          )}
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {isLoading && !data ? (
            <div className="flex justify-center py-20"><Spinner /></div>
          ) : manageQ.isError ? (
            <ErrorState onRetry={() => manageQ.refetch()} />
          ) : tab === 'opps' ? (
            <DataTable
              rows={opps}
              columns={[
                {
                  key: 'title',
                  header: 'Opportunity',
                  sortValue: (o) => o.title,
                  render: (o) => <span className="font-medium text-ink">{o.title}</span>,
                },
                {
                  key: 'reward',
                  header: 'Reward',
                  render: (o) => <span className="text-emerald-700 dark:text-emerald-300 font-medium">{o.reward}</span>,
                },
                {
                  key: 'period',
                  header: 'Period',
                  render: (o) =>
                    o.period_start || o.period_end ? (
                      <span className="whitespace-nowrap text-muted">
                        {o.period_start ? formatDate(o.period_start) : '—'}
                        {o.period_end ? ` → ${formatDate(o.period_end)}` : ''}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  align: 'right',
                  render: (o) => <Chip status={o.status} />,
                },
              ]}
              getKey={(o) => o.name}
              onRowClick={(o) => setDraft(toDraft(o))}
              empty={<EmptyState icon={Banknote} title="No opportunities" subtitle="Create one to let people claim extra income." />}
            />
          ) : (
            <DataTable
              rows={claims}
              columns={[
                {
                  key: 'who',
                  header: 'Claimed by',
                  sortValue: (c) => c.claimed_by_name,
                  render: (c) => (
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{c.claimed_by_name}</p>
                      <p className="truncate text-xs text-muted">{c.opportunity_title}</p>
                    </div>
                  ),
                },
                {
                  key: 'details',
                  header: 'Details',
                  render: (c) => <span className="whitespace-pre-line text-muted">{c.details}</span>,
                },
                {
                  key: 'at',
                  header: 'Submitted',
                  sortValue: (c) => c.at,
                  render: (c) => <span className="whitespace-nowrap text-muted">{formatDate(c.at)}</span>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (c) => <Chip status={c.status} />,
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (c) => (
                    <button
                      onClick={(e) => { e.stopPropagation(); setReviewing(c); setNote(c.review_note ?? '') }}
                      className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-hover/[0.04] transition-colors"
                    >
                      Review
                    </button>
                  ),
                },
              ]}
              getKey={(c) => c.name}
              onRowClick={(c) => { setReviewing(c); setNote(c.review_note ?? '') }}
              empty={<EmptyState icon={Banknote} title="No claims yet" subtitle="Claims people submit show up here for review." />}
            />
          )}
        </BentoTile>
      </BentoGrid>

      {/* Opportunity form */}
      <Sheet open={!!draft} onClose={closeDraft} title={draft?.name ? 'Edit opportunity' : 'New opportunity'} size="sm">
        {draft && (
          <form onSubmit={(e) => { e.preventDefault(); saveDraft() }} className="space-y-3">
            <input className={inputCls} placeholder="Title" autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <textarea className={`${inputCls} resize-none`} rows={3} placeholder="Description (optional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <input className={inputCls} placeholder="Reward (e.g. Rp 500.000 / voucher)" value={draft.reward} onChange={(e) => setDraft({ ...draft, reward: e.target.value })} />
            <div className="flex gap-2">
              <label className="flex-1 text-xs font-medium text-muted">
                Start
                <DatePicker className={`${inputCls} mt-1`} value={draft.period_start} onChange={(v) => setDraft({ ...draft, period_start: v })} />
              </label>
              <label className="flex-1 text-xs font-medium text-muted">
                End (optional)
                <DatePicker className={`${inputCls} mt-1`} value={draft.period_end} onChange={(v) => setDraft({ ...draft, period_end: v })} />
              </label>
            </div>
            <div className="flex gap-2">
              {['Open', 'Closed'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDraft({ ...draft, status: s })}
                  className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
                    draft.status === s ? 'bg-brand-600 text-white' : 'border border-line text-muted hover:bg-hover/[0.04]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={closeDraft} disabled={saveOpp.isPending}>Cancel</Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!draft.title.trim() || !draft.reward.trim() || !draft.period_start || saveOpp.isPending}
              >
                {saveOpp.isPending ? <Spinner className="h-4 w-4" /> : 'Save'}
              </Button>
            </div>
          </form>
        )}
      </Sheet>

      {/* Claim review */}
      <Sheet open={!!reviewing} onClose={closeReview} title="Review claim" size="sm">
        {reviewing && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-ink">{reviewing.claimed_by_name}</p>
              <p className="text-xs text-muted">{reviewing.opportunity_title}</p>
            </div>
            <p className="whitespace-pre-line rounded-xl bg-hover/[0.04] px-3 py-2.5 text-sm text-muted">{reviewing.details}</p>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              placeholder="Review note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              {CLAIM_STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={review.isPending}
                  onClick={() => applyStatus(s)}
                  className={`rounded-xl py-2.5 text-sm font-semibold active:scale-[0.99] transition disabled:opacity-50 ${STATUS_HUE[s]}`}
                >
                  {reviewing.status === s ? `● ${s}` : s}
                </button>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </Page>
  )
}
