import { useState } from 'react'
import clsx from 'clsx'
import { Timer, Square } from 'lucide-react'
import { useFocusTimers, type EnrichedTimer } from '@/hooks/useFocusTimer'
import { useFocusOverlay, openFocusOverlay } from '@/lib/focusUI'
import { formatClock } from '@/lib/format'

// Slim pill docked above the bottom nav while focus timers run. The primary
// timer (overdue-first, else most-recently started) shows in the pill; a +N
// badge expands the rest above it. Each row/pill: tap reopens that task's
// overlay, the square stops it. Hidden while the overlay itself is open.
function timeParts(t: EnrichedTimer) {
  const over = t.hasEstimate && t.remainingMs < 0
  return { over, valueMs: t.hasEstimate ? t.remainingMs : t.elapsedMs, paused: t.status === 'paused' }
}

export function FocusMiniBar() {
  const { timers, stop } = useFocusTimers()
  const { open } = useFocusOverlay()
  const [expanded, setExpanded] = useState(false)
  if (!timers.length || open) return null

  const [primary, ...rest] = timers
  const p = timeParts(primary)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-40 flex flex-col items-center gap-2 px-4">
      {expanded && rest.length > 0 && (
        <div className="pointer-events-auto flex w-full max-w-[416px] flex-col gap-1.5 rounded-2xl border border-paper-edge bg-paper-card p-1.5 shadow-card dark:border-slate-700 dark:bg-slate-800">
          {rest.map((t) => {
            const q = timeParts(t)
            return (
              <div key={t.taskId} className="flex items-center gap-2 rounded-xl px-1.5 py-1">
                <button
                  onClick={() => {
                    openFocusOverlay(t.taskId)
                    setExpanded(false)
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={clsx(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      q.over
                        ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                        : 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
                    )}
                  >
                    <Timer className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-stone-800 dark:text-slate-100">
                      {t.taskTitle}
                    </span>
                    <span
                      className={clsx(
                        'block font-mono text-xs tabular-nums',
                        q.over ? 'text-rose-500' : q.paused ? 'text-amber-500' : 'text-stone-500 dark:text-slate-400',
                      )}
                    >
                      {q.paused ? 'Paused · ' : ''}
                      {q.over ? '+' : ''}
                      {formatClock(q.valueMs)}
                      {t.hasEstimate && !q.over ? ' left' : ''}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => stop(t.taskId)}
                  aria-label={`Stop focus timer for ${t.taskTitle}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                >
                  <Square className="h-3.5 w-3.5" fill="currentColor" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="pointer-events-auto mx-auto flex w-full max-w-[416px] items-center gap-2 rounded-full border border-paper-edge bg-paper-card px-2 py-1.5 shadow-card dark:border-slate-700 dark:bg-slate-800">
        <button
          onClick={() => openFocusOverlay(primary.taskId)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-2 py-1 text-left transition active:scale-[0.98]"
        >
          <span
            className={clsx(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              p.over
                ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                : 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
            )}
          >
            <Timer className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-stone-800 dark:text-slate-100">
              {primary.taskTitle}
            </span>
            <span
              className={clsx(
                'block font-mono text-xs tabular-nums',
                p.over ? 'text-rose-500' : p.paused ? 'text-amber-500' : 'text-stone-500 dark:text-slate-400',
              )}
            >
              {p.paused ? 'Paused · ' : ''}
              {p.over ? '+' : ''}
              {formatClock(p.valueMs)}
              {primary.hasEstimate && !p.over ? ' left' : ''}
            </span>
          </span>
        </button>

        {rest.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={`${rest.length} more focus timers`}
            className="flex h-9 shrink-0 items-center justify-center rounded-full bg-brand-100 px-3 text-sm font-semibold text-brand-700 transition active:scale-95 dark:bg-brand-500/20 dark:text-brand-300"
          >
            +{rest.length}
          </button>
        )}

        <button
          onClick={() => stop(primary.taskId)}
          aria-label="Stop focus timer"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 transition active:scale-90 dark:bg-rose-500/15 dark:text-rose-300"
        >
          <Square className="h-4 w-4" fill="currentColor" />
        </button>
      </div>
    </div>
  )
}
