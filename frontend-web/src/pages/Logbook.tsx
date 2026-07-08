import { useState } from 'react'
import { Download } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, useLogbook, useWebsiteSettings, useUsers } from '@/hooks/useData'
import { downloadLogbookPdf } from '@/lib/logbookPdf'
import { formatDate } from '@/lib/format'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'
import type { LogbookCompletedItem } from '@/lib/types'

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const inputCls = 'rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink'

function fmtDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' })
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${weekday} ${dd}/${mm}`
}

function itemColor(item: LogbookCompletedItem): string {
  if (item.result === 'rejected' || item.late_days > 0) return 'text-rose-600 dark:text-rose-400'
  if (item.result === 'approved' || item.early_days > 0) return 'text-emerald-600 dark:text-emerald-400'
  return 'text-amber-600 dark:text-amber-400'
}

function itemTiming(item: LogbookCompletedItem): string {
  if (item.late_days > 0) return `${item.late_days}d late`
  if (item.early_days > 0) return `${item.early_days}d early`
  return 'on-time'
}

export default function Logbook() {
  const { data: boot } = useBoot()
  const isManager = !!boot?.roles.includes('System Manager')

  const [from, setFrom] = useState(isoDaysAgo(7))
  const [to, setTo] = useState(isoDaysAgo(0))
  const [user, setUser] = useState<string | undefined>(undefined)

  const { data: users } = useUsers()
  const { data, isLoading } = useLogbook(from, to, user, !!from && !!to)
  const { data: branding } = useWebsiteSettings()

  const hasDays = !!data && data.days.some((d) => d.plan.length > 0 || d.completed.length > 0)

  return (
    <Page>
      <PageHeader
        title="Logbook"
        actions={
          <button
            onClick={() => void downloadLogbookPdf(data!, branding, new Date().toISOString())}
            disabled={!data}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Download PDF
          </button>
        }
      />

      <BentoGrid>
        {/* Filters */}
        <BentoTile span="full" tone="plain">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">From
              <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">To
              <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            {isManager && (
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">User
                <select
                  className={inputCls}
                  value={user ?? ''}
                  onChange={(e) => setUser(e.target.value || undefined)}
                >
                  <option value="">Self</option>
                  {users?.map((u) => (
                    <option key={u.name} value={u.name}>{u.full_name ?? u.name}</option>
                  ))}
                </select>
              </label>
            )}
            {isLoading && <Spinner className="h-4 w-4 text-brand-500" />}
          </div>
        </BentoTile>

        {/* Summary tiles */}
        {data && (
          <>
            <BentoTile span="sm" tone="tint" accent="brand"><BentoStat value={data.summary.points_earned} label="Points earned" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="emerald"><BentoStat value={`${Math.round(data.summary.on_time_rate * 100)}%`} label="On-time rate" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="sky"><BentoStat value={data.summary.todos_done} label="Todos done" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="amber"><BentoStat value={data.summary.late} label="Late" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="violet"><BentoStat value={data.summary.early} label="Early" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="emerald"><BentoStat value={data.summary.approved} label="Approved" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="rose"><BentoStat value={data.summary.rejected} label="Rejected" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="slate"><BentoStat value={data.summary.pending} label="Pending" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="slate"><BentoStat value={data.summary.planned_minutes} label="Planned (min)" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="sky"><BentoStat value={data.summary.done_minutes_estimated} label="Done est. (min)" /></BentoTile>
          </>
        )}

        {/* Table: Date | Plan | Completed */}
        <BentoTile span="full" tone="plain">
          {!data ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : !hasDays ? (
            <EmptyState icon={Download} title="No entries" subtitle="No logbook entries for this date range." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium w-24">Date</th>
                    <th className="px-3 py-2 font-medium">Plan</th>
                    <th className="px-3 py-2 font-medium">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((day) => (
                    <tr key={day.date} className="border-b border-line/70 last:border-0 hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04]">
                      <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-ink">{fmtDay(day.date)}</td>
                      <td className="px-3 py-2 align-top text-ink">
                        {day.plan.length === 0
                          ? <span className="text-muted">—</span>
                          : day.plan.map((p, i) => (
                              <div key={i} className="py-0.5">
                                {p.to_do} · {p.project_name} · {p.planned_minutes}m · due {p.deadline ? formatDate(p.deadline) : '—'}
                              </div>
                            ))}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {day.completed.length === 0
                          ? <span className="text-muted">—</span>
                          : day.completed.map((c, i) => (
                              <div key={i} className={`py-0.5 ${itemColor(c)}`}>
                                {c.to_do} · {c.project_name} · {c.result} · {itemTiming(c)}
                              </div>
                            ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </Page>
  )
}
