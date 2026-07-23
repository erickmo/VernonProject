import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText, ChevronRight, AlertTriangle, CalendarDays, MessageCircle } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Segmented } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useBoot, canManageRecruitment } from '@/hooks/useData'
import { recruitmentApi, APPLICATION_STATUSES, InterviewRow } from '@/lib/api'
import { formatDate } from '@/lib/format'

const STATUS_HUE: Record<string, string> = {
  Submitted: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Screening: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Interview: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  Offered: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  Hired: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Rejected: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
}

export default function RecruitmentApplicationsScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageRecruitment(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [tab, setTab] = useState<'apps' | 'interviews'>('apps')
  const [job, setJob] = useState('')
  const [status, setStatus] = useState('')

  const { data: openings } = useQuery({
    queryKey: ['recruitmentOpenings'],
    queryFn: () => recruitmentApi.listOpenings(),
    enabled: canManageRecruitment(boot),
  })
  const jobOptions = useMemo(
    () => (openings ?? []).map((o) => ({ value: o.name, label: o.title })),
    [openings],
  )
  const statusOptions = APPLICATION_STATUSES.map((s) => ({ value: s, label: s }))

  const { data: apps, isLoading } = useQuery({
    queryKey: ['recruitmentApplications', job, status],
    queryFn: () => recruitmentApi.listApplications(job || undefined, status || undefined),
    enabled: canManageRecruitment(boot),
  })

  const { data: interviews, isLoading: interviewsLoading } = useQuery({
    queryKey: ['recruitmentInterviews'],
    queryFn: () => recruitmentApi.listInterviews(),
    enabled: canManageRecruitment(boot),
  })

  // Group scheduled interviews by date (upcoming first), each date's rows sorted by time.
  const interviewGroups = useMemo(() => {
    const rows = [...(interviews ?? [])].sort((a, b) => a.interview_at.localeCompare(b.interview_at))
    const groups: { date: string; rows: InterviewRow[] }[] = []
    for (const r of rows) {
      const date = r.interview_at.slice(0, 10)
      const last = groups[groups.length - 1]
      if (last && last.date === date) last.rows.push(r)
      else groups.push({ date, rows: [r] })
    }
    return groups
  }, [interviews])

  if (blocked) return null

  return (
    <DetailScreen title="Lamaran">
      <div className="flex flex-col gap-3">
        <Segmented
          options={[
            { value: 'apps', label: 'Lamaran' },
            { value: 'interviews', label: 'Jadwal wawancara' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'interviews' ? (
          interviewsLoading ? (
            <Spinner className="mx-auto h-5 w-5 text-slate-400" />
          ) : !interviewGroups.length ? (
            <EmptyState icon={CalendarDays} title="Belum ada wawancara terjadwal" />
          ) : (
            <div className="flex flex-col gap-4">
              {interviewGroups.map((g) => (
                <div key={g.date} className="flex flex-col gap-2">
                  <p className="px-1 text-xs font-semibold text-slate-400 dark:text-slate-500">{formatDate(g.date)}</p>
                  {g.rows.map((r) => (
                    <div
                      key={r.name}
                      onClick={() => navigate(`/recruitment/applications/${encodeURIComponent(r.name)}`)}
                      className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:active:bg-slate-700/50"
                    >
                      <span className="w-11 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{r.interview_at.slice(11, 16)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{r.full_name}</p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_HUE[r.status] ?? STATUS_HUE.Submitted}`}>
                            {r.status}
                          </span>
                        </div>
                        {r.job_title ? <p className="truncate text-xs text-slate-400 dark:text-slate-500">{r.job_title}</p> : null}
                        {r.interview_notes ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{r.interview_notes}</p> : null}
                      </div>
                      {r.wa ? (
                        <a
                          href={`https://wa.me/${r.wa}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white active:bg-emerald-600"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> WA
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        ) : (
        <>
        <div className="flex flex-col gap-2">
          <SearchableSelect value={job} onChange={setJob} options={jobOptions} placeholder="Semua lowongan" allowClear />
          <SearchableSelect value={status} onChange={setStatus} options={statusOptions} placeholder="Semua status" allowClear />
        </div>

        {isLoading ? (
          <Spinner className="mx-auto h-5 w-5 text-slate-400" />
        ) : !(apps ?? []).length ? (
          <EmptyState icon={FileText} title="Belum ada lamaran" />
        ) : (
          <div className="flex flex-col gap-2">
            {(apps ?? []).map((a) => (
              <button
                key={a.name}
                onClick={() => navigate(`/recruitment/applications/${encodeURIComponent(a.name)}`)}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:active:bg-slate-700/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{a.full_name}</p>
                    {a.blacklist_flag ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-500" /> : null}
                  </div>
                  <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                    {a.job_title || a.job_opening}
                    {a.submitted_on ? ` · ${a.submitted_on}` : ''}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      {a.score}/{a.max_score}
                    </span>
                    <span
                      className={
                        a.grading_status === 'Needs Grading'
                          ? 'rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                          : 'text-slate-400 dark:text-slate-500'
                      }
                    >
                      {a.grading_status}
                    </span>
                    {a.overall_fit != null ? (
                      <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                        Fit {a.overall_fit}%
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_HUE[a.status] ?? STATUS_HUE.Submitted}`}>
                    {a.status}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                </div>
              </button>
            ))}
          </div>
        )}
        </>
        )}
      </div>
    </DetailScreen>
  )
}
