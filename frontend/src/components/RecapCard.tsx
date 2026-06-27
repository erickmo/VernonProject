import { useState } from 'react'
import clsx from 'clsx'
import { Sparkles, CheckCircle2, Clock, Flame, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useWeeklyRecap } from '@/hooks/useData'
import { formatEstimate } from '@/lib/format'
import { RecapShareImage } from './RecapShareImage'

const DISMISS_PREFIX = 'vernon.recap.dismissed.'

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function MiniStat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: string
  label: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-tight text-slate-900 dark:text-slate-50">{value}</p>
        <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400 dark:text-slate-500">{label}</p>
      </div>
    </div>
  )
}

export function RecapCard() {
  // Last week's wrap-up, surfaced at the start of a new week.
  const { data: recap } = useWeeklyRecap(-1)
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Only surface during the first 3 days of a new week (Mon–Wed).
  // Date.getDay(): Sun=0, Mon=1 ... Sat=6.
  const day = new Date().getDay()
  const inWindow = day >= 1 && day <= 3

  if (!recap || !inWindow) return null

  const dismissKey = DISMISS_PREFIX + recap.week_start
  if (dismissed || readDismissed(dismissKey)) return null

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey, '1')
    } catch {
      /* ignore quota/private-mode */
    }
    setDismissed(true)
  }

  const empty = recap.completed === 0

  return (
    <div className="mt-3 rounded-3xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-[#E879C7] text-white">
          <Sparkles className="h-5 w-5 animate-float" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400 dark:text-slate-500">
            Last week · {recap.week_label}
          </p>
          {empty ? (
            <p className="mt-0.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Quiet week — a fresh one just started. Let's make this one count.
            </p>
          ) : (
            <p className="mt-0.5 font-display text-lg font-semibold leading-tight text-slate-900 dark:text-slate-50">
              You wrapped up {recap.completed} task{recap.completed > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss recap"
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 transition active:scale-90 active:bg-paper-line dark:text-slate-500 dark:active:bg-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!empty && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat icon={CheckCircle2} value={String(recap.completed)} label="Done" />
            <MiniStat icon={Clock} value={formatEstimate(recap.minutes)} label="Focused" />
            <MiniStat icon={Flame} value={recap.streak > 0 ? `${recap.streak}d` : '—'} label="Streak" />
          </div>

          <button
            onClick={() => setExpanded((v) => !v)}
            className={clsx(
              'mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-paper-edge dark:border-slate-700 py-2.5 text-sm font-semibold text-brand-700 dark:text-brand-300 transition active:scale-[0.98]',
            )}
          >
            {expanded ? (
              <>
                Hide <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                See your week <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>

          {expanded && <RecapShareImage recap={recap} />}
        </>
      )}
    </div>
  )
}
