import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Users, CalendarDays, MessageCircle } from 'lucide-react'
import { Spinner, EmptyState, Segmented } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import { SearchableSelect } from '@/components/SearchableSelect'
import { recruitmentApi, APPLICATION_STATUSES, InterviewRow } from '@/lib/api'
import { formatDate } from '@/lib/format'

const PILL = 'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold'
const STATUS_TONE: Record<string, string> = {
  Submitted: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Screening: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Interview: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  Offered: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
  Hired: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Rejected: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

export default function RecruitmentApplications() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'apps' | 'interviews'>('apps')
  const [job, setJob] = useState('')
  const [status, setStatus] = useState('')

  const openingsQ = useQuery({ queryKey: ['recruitment', 'openings'], queryFn: () => recruitmentApi.listOpenings() })
  const q = useQuery({
    queryKey: ['recruitment', 'applications', job, status],
    queryFn: () => recruitmentApi.listApplications(job || undefined, status || undefined),
  })
  const interviewsQ = useQuery({ queryKey: ['recruitment-interviews'], queryFn: () => recruitmentApi.listInterviews() })

  const openingOptions = useMemo(
    () => (openingsQ.data ?? []).map((o) => ({ value: o.name, label: o.title })),
    [openingsQ.data],
  )

  // Group scheduled interviews by date (upcoming first), each date's rows sorted by time.
  const interviewGroups = useMemo(() => {
    const rows = [...(interviewsQ.data ?? [])].sort((a, b) => a.interview_at.localeCompare(b.interview_at))
    const groups: { date: string; rows: InterviewRow[] }[] = []
    for (const r of rows) {
      const date = r.interview_at.slice(0, 10)
      const last = groups[groups.length - 1]
      if (last && last.date === date) last.rows.push(r)
      else groups.push({ date, rows: [r] })
    }
    return groups
  }, [interviewsQ.data])

  return (
    <Page>
      <PageHeader icon={Users} title="Applications" />

      <div className="mb-4">
        <Segmented
          options={[
            { value: 'apps', label: 'Lamaran' },
            { value: 'interviews', label: 'Jadwal wawancara' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'interviews' ? (
        interviewsQ.isLoading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : interviewsQ.isError ? (
          <ErrorState onRetry={() => interviewsQ.refetch()} />
        ) : !interviewGroups.length ? (
          <EmptyState icon={CalendarDays} title="Belum ada wawancara terjadwal" subtitle="Interview yang dijadwalkan akan muncul di sini." />
        ) : (
          <div className="flex flex-col gap-5">
            {interviewGroups.map((g) => (
              <div key={g.date}>
                <h3 className="mb-2 text-xs font-semibold text-muted">{formatDate(g.date)}</h3>
                <div className="flex flex-col gap-2">
                  {g.rows.map((r) => (
                    <div
                      key={r.name}
                      onClick={() => navigate(`/recruitment/applications/${encodeURIComponent(r.name)}`)}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-hover/40"
                    >
                      <span className="w-12 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-ink">{r.interview_at.slice(11, 16)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{r.full_name}</span>
                          <span className={`${PILL} ${STATUS_TONE[r.status] ?? 'bg-surface text-muted'}`}>{r.status}</span>
                        </div>
                        {r.job_title ? <p className="text-sm text-muted">{r.job_title}</p> : null}
                        {r.interview_notes ? <p className="mt-1 text-sm text-muted">{r.interview_notes}</p> : null}
                      </div>
                      {r.wa ? (
                        <a
                          href={`https://wa.me/${r.wa}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-600"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> WA
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
      <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-muted">Opening</label>
          <SearchableSelect value={job} onChange={setJob} options={openingOptions} placeholder="All openings" allowClear />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-muted">Status</label>
          <SearchableSelect value={status} onChange={setStatus} options={APPLICATION_STATUSES.map((s) => ({ value: s, label: s }))} placeholder="All statuses" allowClear />
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          rows={q.data ?? []}
          columns={[
            {
              key: 'full_name',
              header: 'Applicant',
              sortValue: (r) => r.full_name,
              render: (r) => (
                <span className="inline-flex items-center gap-2">
                  <span className="font-medium text-ink">{r.full_name}</span>
                  {r.blacklist_flag ? (
                    <span className={`${PILL} bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300`}>⚠ Blacklist</span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'job_title',
              header: 'Opening',
              sortValue: (r) => r.job_title ?? '',
              render: (r) => <span className="text-muted">{r.job_title ?? '—'}</span>,
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <span className={`${PILL} ${STATUS_TONE[r.status] ?? 'bg-surface text-muted'}`}>{r.status}</span>,
            },
            {
              key: 'score',
              header: 'Score',
              align: 'right',
              sortValue: (r) => r.score,
              render: (r) => (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-muted tabular-nums">{r.score}/{r.max_score}</span>
                  {r.overall_fit != null ? (
                    <span className={`${PILL} bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300`}>Fit {r.overall_fit}%</span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'grading_status',
              header: 'Grading',
              render: (r) => (
                <span className={`${PILL} ${r.grading_status === 'Needs Grading'
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                  : 'bg-surface text-muted'}`}>
                  {r.grading_status}
                </span>
              ),
            },
            {
              key: 'submitted_on',
              header: 'Submitted',
              sortValue: (r) => r.submitted_on ?? '',
              render: (r) => <span className="whitespace-nowrap text-muted">{formatDate(r.submitted_on)}</span>,
            },
          ]}
          getKey={(r) => r.name}
          onRowClick={(r) => navigate(`/recruitment/applications/${encodeURIComponent(r.name)}`)}
          empty={<EmptyState icon={Users} title="No applications" subtitle="Nothing matches these filters yet." />}
        />
      )}
      </>
      )}
    </Page>
  )
}
