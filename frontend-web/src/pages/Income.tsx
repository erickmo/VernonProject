import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banknote, Gift, CalendarDays, Settings, Send } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Sheet } from '@web/components/Sheet'
import { Button } from '@web/components/ui'
import { useIncome, useSubmitIncomeClaim, useBoot, canManageIncome } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { formatDate } from '@/lib/format'
import type { IncomeOpportunity } from '@/lib/types'

// Claim-status → chip hues. Mirrors the doctype Select options.
const STATUS_HUE: Record<string, string> = {
  Submitted: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Approved: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Paid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Rejected: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_HUE[status] ?? 'bg-surface text-muted'}`}>
      {status}
    </span>
  )
}

function period(o: IncomeOpportunity) {
  if (!o.period_start && !o.period_end) return null
  const s = o.period_start ? formatDate(o.period_start) : '—'
  return o.period_end ? `${s} → ${formatDate(o.period_end)}` : `from ${s}`
}

export default function Income() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const incomeQ = useIncome()
  const { data, isLoading } = incomeQ
  const submit = useSubmitIncomeClaim()
  const toast = useToast()

  const [claiming, setClaiming] = useState<IncomeOpportunity | null>(null)
  const [details, setDetails] = useState('')

  const closeClaim = () => {
    if (submit.isPending) return
    setClaiming(null)
    setDetails('')
  }

  const send = () => {
    if (!claiming || !details.trim() || submit.isPending) return
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

  const opps = data?.opportunities ?? []
  const claims = data?.claims ?? []

  return (
    <Page>
      <PageHeader
        icon={Banknote}
        title="Extra Income"
        actions={
          canManageIncome(boot) ? (
            <Button variant="secondary" size="sm" onClick={() => navigate('/income-admin')}>
              <Settings className="h-4 w-4" /> Manage
            </Button>
          ) : undefined
        }
      />

      {isLoading && !data ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : incomeQ.isError ? (
        <ErrorState onRetry={() => incomeQ.refetch()} />
      ) : (
        <BentoGrid>
          <BentoTile span="sm" tone="tint" accent="emerald">
            <BentoStat value={opps.length} label={opps.length === 1 ? 'opportunity' : 'opportunities'} />
          </BentoTile>
          <BentoTile span="sm" tone="tint" accent="brand">
            <BentoStat value={claims.length} label={claims.length === 1 ? 'my claim' : 'my claims'} />
          </BentoTile>

          <BentoTile span="full" tone="plain" title="Opportunities">
            {opps.length === 0 ? (
              <EmptyState icon={Banknote} title="No opportunities" subtitle="Check back later for ways to earn extra." />
            ) : (
              <div className="mt-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {opps.map((o) => {
                  const p = period(o)
                  const claimed = o.my_claim_status
                  const canClaim = !claimed || claimed === 'Rejected'
                  return (
                    <div key={o.name} className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <p className="font-semibold text-ink">{o.title}</p>
                        {claimed && <StatusChip status={claimed} />}
                      </div>
                      <span className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <Gift className="h-3.5 w-3.5" /> {o.reward}
                      </span>
                      {p && (
                        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
                          <CalendarDays className="h-3.5 w-3.5" /> {p}
                        </p>
                      )}
                      {o.description && (
                        <p className="mb-3 whitespace-pre-line text-sm text-muted">{o.description}</p>
                      )}
                      {canClaim ? (
                        <button
                          onClick={() => { setClaiming(o); setDetails('') }}
                          className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.99] transition"
                        >
                          <Send className="h-4 w-4" /> {claimed === 'Rejected' ? 'Claim again' : 'Claim'}
                        </button>
                      ) : (
                        <p className="mt-auto text-xs font-medium text-muted">You already claimed this.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </BentoTile>

          {claims.length > 0 && (
            <BentoTile span="full" tone="plain" title="My claims">
              <DataTable
                rows={claims}
                columns={[
                  {
                    key: 'opportunity',
                    header: 'Opportunity',
                    sortValue: (c) => c.opportunity_title,
                    render: (c) => <span className="font-medium text-ink">{c.opportunity_title}</span>,
                  },
                  {
                    key: 'details',
                    header: 'Details',
                    render: (c) => <span className="whitespace-pre-line text-muted">{c.details}</span>,
                  },
                  {
                    key: 'note',
                    header: 'Note',
                    render: (c) => c.review_note ? <span className="text-muted">{c.review_note}</span> : <span className="text-muted">—</span>,
                  },
                  {
                    key: 'submitted',
                    header: 'Submitted',
                    sortValue: (c) => c.at,
                    render: (c) => <span className="whitespace-nowrap text-muted">{formatDate(c.at)}</span>,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    align: 'right',
                    render: (c) => <StatusChip status={c.status} />,
                  },
                ]}
                getKey={(c) => c.name}
              />
            </BentoTile>
          )}
        </BentoGrid>
      )}

      <Sheet open={!!claiming} onClose={closeClaim} title={claiming ? `Claim: ${claiming.title}` : 'Claim'} size="sm">
        <form onSubmit={(e) => { e.preventDefault(); send() }} className="space-y-3">
          <p className="text-sm text-muted">
            Tell the reviewer what you did to earn this. They'll review and mark it paid.
          </p>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Describe your claim…"
            className="w-full resize-none rounded-xl border border-line bg-hover/[0.04] px-3 py-2.5 text-sm text-ink outline-none focus:border-brand-500"
          />
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={closeClaim} disabled={submit.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!details.trim() || submit.isPending}>
              {submit.isPending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />} Submit claim
            </Button>
          </div>
        </form>
      </Sheet>
    </Page>
  )
}
