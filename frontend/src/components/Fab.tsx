import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useFocusTimer } from '@/hooks/useFocusTimer'

// One-time hint persists across sessions once dismissed (or after first use).
const TIP_KEY = 'vernon.fabTipDismissed'
// Long-press threshold. A press held this long fires onLongPress and cancels the tap.
const LONG_MS = 450

export function Fab({ onTap, onLongPress }: { onTap: () => void; onLongPress: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFired = useRef(false)
  const armed = useRef(false) // true only between pointerdown and its resolution
  const [showTip, setShowTip] = useState(false)
  // Lift above the focus mini-bar (z-40, ~+4.25rem) when a timer is running so
  // the two don't overlap in the bottom-right corner.
  const focusing = useFocusTimer().timer != null

  useEffect(() => {
    try {
      if (!localStorage.getItem(TIP_KEY)) setShowTip(true)
    } catch {
      /* private mode / disabled storage — just skip the tip */
    }
  }, [])

  const dismissTip = () => {
    setShowTip(false)
    try {
      localStorage.setItem(TIP_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  const onPointerDown = () => {
    longFired.current = false
    armed.current = true
    clear()
    timer.current = setTimeout(() => {
      longFired.current = true
      armed.current = false
      if (showTip) dismissTip()
      onLongPress()
    }, LONG_MS)
  }

  const onPointerUp = () => {
    clear()
    if (armed.current && !longFired.current) {
      armed.current = false
      if (showTip) dismissTip()
      onTap()
    }
  }

  // Finger dragged off the button, or the gesture was cancelled by the OS:
  // disarm so the trailing pointerup does not fire a stray tap.
  const onCancel = () => {
    armed.current = false
    clear()
  }

  return (
    <>
      {showTip && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+9rem)] right-4 z-30 flex max-w-[240px] items-center gap-2 rounded-2xl border border-paper-edge bg-paper-card px-3 py-2 text-xs font-medium text-stone-600 shadow-card dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Hold for a quick note
          <button
            onClick={dismissTip}
            aria-label="Dismiss tip"
            className="text-stone-400 active:scale-90 dark:text-slate-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <button
        aria-label="Quick add"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onCancel}
        onPointerCancel={onCancel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: 'manipulation' }}
        className={`fixed ${focusing ? 'bottom-[calc(env(safe-area-inset-bottom)+8.5rem)]' : 'bottom-[calc(env(safe-area-inset-bottom)+5rem)]'} right-4 z-30 flex h-14 w-14 select-none items-center justify-center rounded-full bg-brand-600 text-white shadow-card animate-float transition-all active:scale-90`}
      >
        <Plus className="h-7 w-7" strokeWidth={2.4} />
      </button>
    </>
  )
}
