import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, useLogbook, useWebsiteSettings } from '@/hooks/useData'
import { mobileApi } from '@/lib/api'
import { downloadLogbookPdf, groupPlanByProject } from '@/lib/logbookPdf'
import { formatDate } from '@/lib/format'
import type { ManagedUser } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'
const card = 'rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800'

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function LogbookScreen() {
  const [from, setFrom] = useState(isoDaysAgo(7))
  const [to, setTo] = useState(isoDaysAgo(0))
  const [user, setUser] = useState('')
  const [users, setUsers] = useState<ManagedUser[]>([])

  const { data: boot } = useBoot()
  const isManager = !!boot?.roles.includes('System Manager')
  const { data, isFetching } = useLogbook(from, to, user || undefined, !!from && !!to)
  const { data: branding } = useWebsiteSettings()

  useEffect(() => {
    if (!isManager) return
    mobileApi.listUsers().then((r) => setUsers(r.users)).catch(() => {})
  }, [isManager])

  const hasDays = !!data && data.days.some((d) => d.plan.length > 0 || d.completed.length > 0)

  const summaryChips = data
    ? [
        { label: 'Points', value: data.summary.points_earned, color: 'text-brand-600' },
        { label: 'On-time %', value: `${Math.round(data.summary.on_time_rate * 100)}%`, color: 'text-emerald-600' },
        { label: 'Done', value: data.summary.todos_done, color: 'text-emerald-600' },
        { label: 'Late', value: data.summary.late, color: 'text-rose-600' },
        { label: 'Early', value: data.summary.early, color: 'text-green-600' },
        { label: 'Approved', value: data.summary.approved, color: 'text-emerald-600' },
        { label: 'Rejected', value: data.summary.rejected, color: 'text-rose-600' },
        { label: 'Pending', value: data.summary.pending, color: 'text-amber-600' },
        { label: 'Planned min', value: data.summary.planned_minutes, color: 'text-slate-600 dark:text-slate-300' },
        { label: 'Done est min', value: data.summary.done_minutes_estimated, color: 'text-slate-600 dark:text-slate-300' },
      ]
    : []

  return (
    <DetailScreen title="Logbook">
      <div className="flex flex-col gap-4">
        {/* Filter card */}
        <div className={`${card} flex flex-col gap-3`}>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              From
              <input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              To
              <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          {isManager && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              User
              <SearchableSelect
                value={user}
                onChange={(v) => setUser(v)}
                options={users.map((u) => ({ value: u.name, label: u.full_name ?? u.name }))}
                placeholder="Self"
                allowClear
              />
            </label>
          )}
          <button
            onClick={() => void downloadLogbookPdf(data!, branding, new Date().toISOString())}
            disabled={!data}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
          >
            PDF
          </button>
        </div>

        {/* Summary chips */}
        {data && (
          <div className="grid grid-cols-3 gap-2">
            {summaryChips.map(({ label, value, color }) => (
              <div key={label} className={`${card} text-center`}>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
                <p className="text-[10px] font-semibold leading-tight text-slate-500 dark:text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Day cards */}
        {isFetching && !data ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !data ? null : !hasDays ? (
          <EmptyState
            icon={BookOpen}
            title="No logbook entries."
            subtitle="No plan or completed items for this date range."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {data.days
              .filter((day) => day.plan.length > 0 || day.completed.length > 0)
              .map((day) => (
                <div key={day.date} className={card}>
                  <p className="mb-2 font-semibold text-stone-800 dark:text-slate-100">{formatDate(day.date)}</p>

                  {day.plan.length > 0 && (
                    <div className="mb-2">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Plan</p>
                      <div className="flex flex-col gap-1.5">
                        {groupPlanByProject(day.plan).map((g) => (
                          <div key={g.project} className="flex flex-col gap-0.5">
                            <p className="text-xs font-semibold text-stone-700 dark:text-slate-200">
                              {g.project} · {g.total}m
                            </p>
                            {g.items.map((p, i) => (
                              <p key={`${p.todo}-${i}`} className="pl-3 text-xs text-slate-500 dark:text-slate-400">
                                {p.to_do} · {p.planned_minutes}m · due {p.deadline ?? '—'}
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {day.completed.length > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Completed</p>
                      <div className="flex flex-col gap-0.5">
                        {day.completed.map((c) => {
                          const timing =
                            c.late_days > 0
                              ? `${c.late_days}d late`
                              : c.early_days > 0
                              ? `${c.early_days}d early`
                              : 'on-time'
                          // Red first (rejected or late), then green (approved or early), then amber.
                          const color =
                            c.result === 'rejected' || c.late_days > 0
                              ? 'text-red-600'
                              : c.result === 'approved' || c.early_days > 0
                              ? 'text-green-600'
                              : 'text-amber-600'
                          return (
                            <p key={c.todo} className={`text-xs ${color}`}>
                              {c.to_do} · {c.project_name} · {c.result} · {timing}
                            </p>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {isFetching && data && (
          <div className="flex justify-center"><Spinner className="h-4 w-4 text-brand-500" /></div>
        )}
      </div>
    </DetailScreen>
  )
}
