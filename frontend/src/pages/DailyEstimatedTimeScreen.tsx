import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, CheckCircle2 } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useDailyEstimatedTime, useDailyEstimatedTimeAccess } from '@/hooks/useData'
import { formatEstimate } from '@/lib/format'
import { lastDays } from '@/lib/internAllocation'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'
const card = 'rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800'

export default function DailyEstimatedTimeScreen() {
  const navigate = useNavigate()
  const { data: access } = useDailyEstimatedTimeAccess()
  const blocked = access ? !access.can_view : false
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [[defaultFrom, defaultTo]] = useState(() => lastDays(7))
  const [fromDate, setFromDate] = useState(defaultFrom)
  const [toDate, setToDate] = useState(defaultTo)
  // 139 active users is far too many cards for a phone, and the report exists to
  // answer "who is under the daily minimum" — so flagged-only is the default view.
  const [onlyFlagged, setOnlyFlagged] = useState(true)

  const { data, isFetching } = useDailyEstimatedTime(
    fromDate, toDate, !!access?.can_view && !!fromDate && !!toDate,
  )

  const rows = useMemo(() => {
    const all = data?.rows ?? []
    const shown = onlyFlagged ? all.filter((r) => r.flagged_dates.length > 0) : all
    return [...shown].sort((a, b) =>
      b.flagged_dates.length - a.flagged_dates.length || a.full_name.localeCompare(b.full_name))
  }, [data, onlyFlagged])

  if (blocked) return null

  const flaggedCount = (data?.rows ?? []).filter((r) => r.flagged_dates.length > 0).length

  return (
    <DetailScreen title="Daily Estimated Time">
      <div className="flex flex-col gap-4">
        <div className={`${card} flex flex-col gap-3`}>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">From
              <input type="date" className={field} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">To
              <input type="date" className={field} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={onlyFlagged}
              onChange={(e) => setOnlyFlagged(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Below the minimum only{data ? ` (${flaggedCount} of ${data.rows.length})` : ''}
          </label>
        </div>

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className={`${card} text-center`}>
                <p className="text-xl font-bold text-brand-600">{formatEstimate(data.threshold)}</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Daily minimum</p>
              </div>
              <div className={`${card} text-center`}>
                <p className="text-xl font-bold text-slate-600 dark:text-slate-200">{data.dates.length}</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Days in range</p>
              </div>
            </div>
            <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
              A day is flagged when the minutes allocated to it fall under the daily minimum.
            </p>
          </>
        )}

        {isFetching && !data ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !data ? null : rows.length === 0 ? (
          <EmptyState
            icon={onlyFlagged ? CheckCircle2 : CalendarClock}
            title={onlyFlagged ? 'Everyone met the daily minimum.' : 'No active users in this range.'}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <div key={row.user} className={card}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-stone-800 dark:text-slate-100">{row.full_name}</p>
                  <p className={`shrink-0 text-sm font-bold ${row.flagged_dates.length ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {row.flagged_dates.length ? `${row.flagged_dates.length} below` : 'On target'}
                  </p>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {formatEstimate(row.assigned_total)} allocated · {formatEstimate(row.planned_total)} planned
                </p>
                {row.flagged_dates.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {row.flagged_dates.map((d) => (
                      <span
                        key={d}
                        title={`${d} — ${formatEstimate(row.per_day_assigned[d] ?? 0)} allocated`}
                        className="rounded-lg bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                      >
                        {d.slice(5)} · {row.per_day_assigned[d] ?? 0}m
                      </span>
                    ))}
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
