import { useState } from 'react'
import clsx from 'clsx'
import { Timer, ChevronDown, Square } from 'lucide-react'
import { useFocusTimers, type EnrichedTimer } from '@/hooks/useFocusTimer'
import { openFocusOverlay } from '@/lib/focusUI'
import { formatClock } from '@/lib/format'

// Global running-timers surface for web: a floating bottom-right pill showing
// the primary timer + count. Click (with >1 timer) toggles a dropdown listing
// all timers; each row opens that task's overlay or stops it. Hidden when none.
function parts(t: EnrichedTimer) {
  const over = t.hasEstimate && t.remainingMs < 0
  return { over, valueMs: t.hasEstimate ? t.remainingMs : t.elapsedMs, paused: t.status === 'paused' }
}

export function FocusDock() {
  const { timers, stop } = useFocusTimers()
  const [openList, setOpenList] = useState(false)
  if (!timers.length) return null

  const [primary] = timers
  const p = parts(primary)

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {openList && (
        <div className="w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {timers.map((t) => {
            const q = parts(t)
            return (
              <div
                key={t.taskId}
                className="flex items-center gap-2 border-b border-line px-2.5 py-2 last:border-b-0"
              >
                <button
                  onClick={() => {
                    openFocusOverlay(t.taskId)
                    setOpenList(false)
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Timer
                    className={clsx('h-4 w-4 shrink-0', q.over ? 'text-rose-500' : 'text-brand-600 dark:text-brand-400')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{t.taskTitle}</span>
                    <span
                      className={clsx(
                        'block font-mono text-xs tabular-nums',
                        q.over ? 'text-rose-500' : q.paused ? 'text-amber-500' : 'text-muted',
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
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-rose-500 hover:bg-hover"
                >
                  <Square className="h-3.5 w-3.5" fill="currentColor" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <button
        onClick={() => (timers.length > 1 ? setOpenList((v) => !v) : openFocusOverlay(primary.taskId))}
        className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 shadow-lg transition hover:bg-hover"
      >
        <span
          className={clsx(
            'flex h-6 w-6 items-center justify-center rounded-full',
            p.over
              ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
              : 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
          )}
        >
          <Timer className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-sm tabular-nums text-ink">
          {p.over ? '+' : ''}
          {formatClock(p.valueMs)}
        </span>
        {timers.length > 1 && (
          <span className="flex items-center gap-0.5 text-sm font-medium text-muted">
            {timers.length} focusing
            <ChevronDown className={clsx('h-4 w-4 transition', openList && 'rotate-180')} />
          </span>
        )}
      </button>
    </div>
  )
}
