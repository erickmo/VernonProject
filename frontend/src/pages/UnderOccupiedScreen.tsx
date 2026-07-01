import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserMinus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, useUnderOccupied } from '@/hooks/useData'
import { formatEstimate } from '@/lib/format'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'
const card = 'rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800'

function defaultWorkWeek(): { from: string; to: string } {
  const now = new Date()
  const dow = (now.getDay() + 6) % 7 // 0 = Monday
  const monday = new Date(now); monday.setDate(now.getDate() - dow)
  const friday = new Date(monday); friday.setDate(monday.getDate() + 4)
  const iso = (d: Date) => d.toLocaleDateString('en-CA') // local YYYY-MM-DD
  return { from: iso(monday), to: iso(friday) }
}

export default function UnderOccupiedScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const isSystemManager = !!boot && boot.roles.includes('System Manager')
  const blocked = !boot ? false : !boot.roles.includes('System Manager')
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const week = defaultWorkWeek()
  const [fromDate, setFromDate] = useState(week.from)
  const [toDate, setToDate] = useState(week.to)

  const { data, isFetching } = useUnderOccupied(fromDate, toDate, isSystemManager && !!fromDate && !!toDate)

  if (blocked) return null

  return (
    <DetailScreen title="Under-Occupied">
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
        </div>

        {data && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className={`${card} text-center`}>
                <p className="text-xl font-bold text-brand-600">{formatEstimate(data.threshold)}</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Target</p>
              </div>
              <div className={`${card} text-center`}>
                <p className="text-xl font-bold text-amber-600">{formatEstimate(data.tolerance)}</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tolerance</p>
              </div>
              <div className={`${card} text-center`}>
                <p className="text-xl font-bold text-slate-600 dark:text-slate-200">{data.day_count}</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Days</p>
              </div>
            </div>
            <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
              Avg daily assigned below target − tolerance.
            </p>
          </>
        )}

        {isFetching && !data ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !data ? null : data.rows.length === 0 ? (
          <EmptyState icon={UserMinus} title="Everyone is occupied enough." subtitle="" />
        ) : (
          <div className="flex flex-col gap-3">
            {data.rows.map((row) => (
              <div key={row.user} className={card}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-stone-800 dark:text-slate-100">{row.full_name}</p>
                  <p className="shrink-0 text-sm font-bold text-rose-600">{formatEstimate(row.avg_daily)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Deficit {formatEstimate(row.deficit)} · {row.under_days} under-days
                </p>
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
