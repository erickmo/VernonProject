import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserMinus, UserPlus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, useOverOccupied, useUnderOccupied } from '@/hooks/useData'
import { formatEstimate } from '@/lib/format'
import type { OccupancyReport } from '@/lib/types'

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

// The two reports are the same shape mirrored around each user's shift target,
// so one screen serves both — only the wording and which verdict pair to read.
const MODES = {
  under: {
    title: 'Under-Occupied',
    icon: UserMinus,
    hint: 'Assigned below the shift target by more than the tolerance.',
    empty: 'Everyone is occupied enough.',
    gapLabel: 'Deficit',
    daysLabel: 'under-days',
    tone: 'text-amber-600',
  },
  over: {
    title: 'Over-Occupied',
    icon: UserPlus,
    hint: 'Assigned above the shift target by more than the tolerance.',
    empty: 'Nobody is over-loaded.',
    gapLabel: 'Surplus',
    daysLabel: 'over-days',
    tone: 'text-rose-600',
  },
} as const

type Mode = keyof typeof MODES

/** A row's gap + flagged-day count, whichever side of the target this mode reads. */
function verdict(mode: Mode, row: OccupancyReport<'under'>['rows'][number] | OccupancyReport<'over'>['rows'][number]) {
  return mode === 'under'
    ? { gap: (row as OccupancyReport<'under'>['rows'][number]).deficit, days: (row as OccupancyReport<'under'>['rows'][number]).under_days }
    : { gap: (row as OccupancyReport<'over'>['rows'][number]).surplus, days: (row as OccupancyReport<'over'>['rows'][number]).over_days }
}

export default function OccupancyScreen({ mode }: { mode: Mode }) {
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

  const ready = isSystemManager && !!fromDate && !!toDate
  const under = useUnderOccupied(fromDate, toDate, ready && mode === 'under')
  const over = useOverOccupied(fromDate, toDate, ready && mode === 'over')
  const { data, isFetching } = mode === 'under' ? under : over
  const cfg = MODES[mode]

  if (blocked) return null

  return (
    <DetailScreen title={cfg.title}>
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
            <div className="grid grid-cols-2 gap-3">
              <div className={`${card} text-center`}>
                <p className="text-xl font-bold text-amber-600">{formatEstimate(data.tolerance)}</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tolerance</p>
              </div>
              <div className={`${card} text-center`}>
                <p className="text-xl font-bold text-slate-600 dark:text-slate-200">{data.day_count}</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Days in range</p>
              </div>
            </div>
            <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
              {cfg.hint} Days with no shift carry no target and are skipped.
            </p>
          </>
        )}

        {isFetching && !data ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !data ? null : data.rows.length === 0 ? (
          <EmptyState icon={cfg.icon} title={cfg.empty} />
        ) : (
          <div className="flex flex-col gap-3">
            {data.rows.map((row) => {
              const v = verdict(mode, row)
              return (
                <div key={row.user} className={card}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-stone-800 dark:text-slate-100">{row.full_name}</p>
                    <p className={`shrink-0 text-sm font-bold ${cfg.tone}`}>{cfg.gapLabel} {formatEstimate(v.gap)}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {formatEstimate(row.assigned_total)} assigned of {formatEstimate(row.expected_total)} target · {v.days} {cfg.daysLabel}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {isFetching && data && (
          <div className="flex justify-center"><Spinner className="h-4 w-4 text-brand-500" /></div>
        )}
      </div>
    </DetailScreen>
  )
}
