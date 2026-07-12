import { useEffect } from 'react'
import clsx from 'clsx'
import { Timer, Square, X } from 'lucide-react'
import { useFocusTimers, type EnrichedTimer } from '@/hooks/useFocusTimer'
import { openFocusOverlay } from '@/lib/focusUI'
import { formatClock } from '@/lib/format'

// Slide-up sheet listing every running focus timer. Opened from the FAB's timer
// button. Each row: tap reopens that task's focus overlay, the square stops it.
// Auto-closes when the last timer ends.
function timeParts(t: EnrichedTimer) {
  const over = t.hasEstimate && t.remainingMs < 0
  return { over, valueMs: t.hasEstimate ? t.remainingMs : t.elapsedMs, paused: t.status === 'paused' }
}

export function FocusSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { timers, stop } = useFocusTimers()

  // Last timer stopped while the sheet is up → nothing left to show.
  useEffect(() => {
    if (open && timers.length === 0) onClose()
  }, [open, timers.length, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={onClose} />
      <div className="relative max-h-[82vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl animate-slide-up">
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 px-5 pt-3">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center justify-between pb-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Focusing ({timers.length})</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 dark:text-slate-500 active:bg-slate-100 dark:active:bg-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-1.5 px-3 pb-2 pt-1">
          {timers.map((t) => {
            const q = timeParts(t)
            return (
              <div
                key={t.taskId}
                className="flex items-center gap-2 rounded-2xl px-2 py-2 active:bg-slate-50 dark:active:bg-slate-700/40"
              >
                <button
                  onClick={() => {
                    openFocusOverlay(t.taskId)
                    onClose()
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span
                    className={clsx(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      q.over
                        ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                        : 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
                    )}
                  >
                    <Timer className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-stone-800 dark:text-slate-100">
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
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                >
                  <Square className="h-4 w-4" fill="currentColor" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
