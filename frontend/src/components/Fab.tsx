import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, CheckSquare, StickyNote, Compass } from 'lucide-react'
import { useFocusTimers } from '@/hooks/useFocusTimer'

// One-time hint persists across sessions once dismissed (or after first use).
const TIP_KEY = 'vernon.fabTipDismissed'
// Long-press threshold. A press held this long fires onLongPress and cancels the tap.
const LONG_MS = 450

export function Fab({ onTap, onLongPress }: { onTap: () => void; onLongPress: () => void }) {
  const navigate = useNavigate()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFired = useRef(false)
  const armed = useRef(false) // true only between pointerdown and its resolution
  const [showTip, setShowTip] = useState(false)
  // Tap opens a small action menu; long-press stays a shortcut straight to a note.
  const [menuOpen, setMenuOpen] = useState(false)
  // Lift above the focus mini-bar (z-40, ~+4.25rem) when a timer is running so
  // the two don't overlap in the bottom-right corner.
  const focusing = useFocusTimers().timers.length > 0

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
      setMenuOpen((v) => !v)
    }
  }

  // Run a menu action and close the menu.
  const pick = (fn: () => void) => {
    setMenuOpen(false)
    fn()
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
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
          <div
            role="menu"
            aria-label="Quick actions"
            className={`fixed ${focusing ? 'bottom-[calc(env(safe-area-inset-bottom)+12.5rem)]' : 'bottom-[calc(env(safe-area-inset-bottom)+9rem)]'} right-4 z-40 w-56 rounded-2xl border border-paper-edge bg-paper-card p-1.5 shadow-card animate-pop dark:border-slate-700 dark:bg-slate-800`}
          >
            {[
              { icon: CheckSquare, label: 'New task', run: onTap },
              { icon: StickyNote, label: 'New note', run: onLongPress },
              { icon: Compass, label: 'What can I do', run: () => navigate('/help') },
            ].map((m) => (
              <button
                key={m.label}
                role="menuitem"
                onClick={() => pick(m.run)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-stone-700 active:bg-paper-line dark:text-slate-100 dark:active:bg-slate-700"
              >
                <m.icon className="h-5 w-5 shrink-0 text-brand-500" />
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}
      <button
        aria-label="Quick add"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onCancel}
        onPointerCancel={onCancel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: 'manipulation' }}
        className={`fixed ${focusing ? 'bottom-[calc(env(safe-area-inset-bottom)+8.5rem)]' : 'bottom-[calc(env(safe-area-inset-bottom)+5rem)]'} right-4 z-30 flex h-14 w-14 select-none items-center justify-center rounded-full bg-brand-600 text-white shadow-card transition-all active:scale-90 ${menuOpen ? '' : 'animate-float'}`}
      >
        <Plus className={`h-7 w-7 transition-transform ${menuOpen ? 'rotate-45' : ''}`} strokeWidth={2.4} />
      </button>
    </>
  )
}
