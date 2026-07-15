import clsx from 'clsx'
import { Check, Clock, AlertTriangle } from 'lucide-react'
import { formatEstimate } from '@/lib/format'

// Generic progress header — a labeled bar with a done/left footer. The caller
// supplies the semantics: minutes for a day plan, task counts for a review
// queue, etc. Shared by the /w Home work lists and the /w Review queue.
export function ListProgress({
  title,
  note,
  pct,
  doneText,
  leftText,
}: {
  title: string
  note: string
  pct: number
  doneText: string
  leftText: string
}) {
  return (
    <div className="rounded-2xl bg-surface p-3.5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="text-xs font-medium tabular-nums text-muted">{note}</span>
      </div>
      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-600 to-[#e879c7] transition-[width] duration-500"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs font-medium text-muted">
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" /> {doneText}
        </span>
        <span>{leftText}</span>
      </div>
    </div>
  )
}

// Slim summary strip for lists with no "done" axis (overdue / upcoming /
// waiting): task count + total estimated work. `alert` tints it rose (overdue).
export function ListSummary({
  count,
  minutes,
  label,
  alert,
}: {
  count: number
  minutes: number
  label: string
  alert?: boolean
}) {
  if (!count) return null
  return (
    <div
      className={clsx(
        'flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs font-medium shadow-card',
        alert ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' : 'bg-surface text-muted',
      )}
    >
      {alert ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5 text-brand-500" />}
      <span className="font-semibold">
        {count} {label}
      </span>
      {minutes > 0 && <span className={alert ? 'text-rose-600/80 dark:text-rose-300/80' : 'text-muted'}>· {formatEstimate(minutes)} of work</span>}
    </div>
  )
}
