import clsx from 'clsx'
import { Timer, Square } from 'lucide-react'
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { useFocusOverlay, openFocusOverlay } from '@/lib/focusUI'
import { formatClock } from '@/lib/format'

// Slim pill docked above the bottom nav while a focus timer runs. Tap reopens the
// overlay; the square stops the timer. Hidden while the overlay itself is open.
// Centered and width-capped to the app column, leaving the bottom-right corner
// clear for a future FAB.
export function FocusMiniBar() {
  const { timer, elapsedMs, remainingMs, hasEstimate, stop } = useFocusTimer()
  const { open } = useFocusOverlay()
  if (!timer || open) return null

  const over = hasEstimate && remainingMs < 0
  const valueMs = hasEstimate ? remainingMs : elapsedMs
  const paused = timer.status === 'paused'

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-40 flex justify-center px-4">
      <div className="pointer-events-auto mx-auto flex w-full max-w-[416px] items-center gap-2 rounded-full border border-paper-edge bg-paper-card px-2 py-1.5 shadow-card dark:border-slate-700 dark:bg-slate-800">
        <button
          onClick={() => openFocusOverlay()}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-2 py-1 text-left transition active:scale-[0.98]"
        >
          <span
            className={clsx(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              over
                ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                : 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
            )}
          >
            <Timer className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-stone-800 dark:text-slate-100">
              {timer.taskTitle}
            </span>
            <span
              className={clsx(
                'block font-mono text-xs tabular-nums',
                over ? 'text-rose-500' : paused ? 'text-amber-500' : 'text-stone-500 dark:text-slate-400',
              )}
            >
              {paused ? 'Paused · ' : ''}
              {over ? '+' : ''}
              {formatClock(valueMs)}
              {hasEstimate && !over ? ' left' : ''}
            </span>
          </span>
        </button>
        <button
          onClick={stop}
          aria-label="Stop focus timer"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 transition active:scale-90 dark:bg-rose-500/15 dark:text-rose-300"
        >
          <Square className="h-4 w-4" fill="currentColor" />
        </button>
      </div>
    </div>
  )
}
