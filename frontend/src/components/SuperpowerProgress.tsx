import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { EmptyState, Spinner } from '@/components/ui'
import { useSuperpowerProgress } from '@/hooks/useData'

// Per-quarter recognition trend for the ratee (owner or HR only). Peer votes reset
// each quarter, so this is how the voted user watches their scores build over time:
// one bar per quarter (overall average received vote, 0–10), current quarter marked,
// plus the delta vs the previous quarter. Shared by /m and /w.
export function SuperpowerProgress({ user }: { user: string }) {
  const { data, isLoading } = useSuperpowerProgress(user)

  if (isLoading && !data)
    return <div className="flex justify-center py-10"><Spinner /></div>
  if (!data || data.quarters.length === 0)
    return (
      <EmptyState
        icon={TrendingUp}
        title="Belum ada progres"
        subtitle="Progres muncul setelah rekan menilai superpower-mu."
      />
    )

  const qs = data.quarters
  const last = qs[qs.length - 1]
  const prev = qs.length > 1 ? qs[qs.length - 2] : null
  const delta = prev ? +(last.avg - prev.avg).toFixed(2) : null

  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-paper-line/60 dark:bg-slate-800/60 px-4 py-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        Penilaian rekan diperbarui tiap kuartal. Berikut skor rata-rata (0–10) yang kamu terima tiap kuartal.
      </p>

      <div className="rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">{last.avg.toFixed(1)}</span>
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">rata-rata · {last.quarter}</span>
          {delta !== null && (
            <span
              className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                delta > 0
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : delta < 0
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
              }`}
            >
              {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : delta < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          {last.voters} penilai · {last.traits} superpower kuartal ini
        </p>
      </div>

      <div className="space-y-2.5">
        {qs.map((q) => {
          const isCurrent = q.quarter === data.current
          return (
            <div key={q.quarter} className="flex items-center gap-3">
              <span className={`w-16 shrink-0 text-xs font-semibold ${isCurrent ? 'text-brand-600 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'}`}>
                {q.quarter}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-paper-line dark:bg-slate-700">
                <div
                  className={`h-full rounded-full transition-all ${isCurrent ? 'bg-brand-500' : 'bg-brand-300 dark:bg-brand-500/50'}`}
                  style={{ width: `${Math.max(0, Math.min(100, q.avg * 10))}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums text-slate-600 dark:text-slate-300">
                {q.avg.toFixed(1)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
