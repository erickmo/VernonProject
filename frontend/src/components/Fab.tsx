import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, X, StickyNote, Compass, Megaphone, Timer } from 'lucide-react'
import { useFocusTimers } from '@/hooks/useFocusTimer'
import { useFocusOverlay } from '@/lib/focusUI'
import { FocusSheet } from './FocusSheet'

// Global quick-add button, mounted once for every /m route. Tap opens a small
// action menu; long-press jumps straight to a new note. While focus timers are
// running it grows a second timer button (with a count badge) that opens the
// focus list sheet.
const TIP_KEY = 'vernon.fabTipDismissed'
const LONG_MS = 450

export function Fab() {
  const navigate = useNavigate()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFired = useRef(false)
  const armed = useRef(false)
  const [showTip, setShowTip] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const focusCount = useFocusTimers().timers.length
  const overlayOpen = useFocusOverlay().open

  // Hide on detail pages that carry a bottom comment composer, so the FAB does
  // not sit over the send button. Matches the routes that render CommentThread.
  const { pathname } = useLocation()
  const onCommentPage =
    /^\/(project|project-detail|project-item)\/[^/]+$/.test(pathname) ||
    /^\/papan-iklan\/(?!new$|bans$)[^/]+$/.test(pathname)

  const newNote = () => navigate('/notes/new')

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
      newNote()
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

  const pick = (fn: () => void) => {
    setMenuOpen(false)
    fn()
  }

  const onCancel = () => {
    armed.current = false
    clear()
  }

  // Hidden while the full-screen focus overlay is up (mirrors the old mini-bar),
  // or on comment-composer detail pages (see onCommentPage above).
  if (overlayOpen || onCommentPage) return null

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
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+9rem)] right-4 z-40 w-56 rounded-2xl border border-paper-edge bg-paper-card p-1.5 shadow-card animate-pop dark:border-slate-700 dark:bg-slate-800"
          >
            {[
              { icon: StickyNote, label: 'New note', run: newNote },
              { icon: Megaphone, label: 'New ad', run: () => navigate('/papan-iklan/new') },
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

      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-30 flex items-center gap-3">
        {focusCount > 0 && (
          <button
            aria-label={`${focusCount} focus timer${focusCount > 1 ? 's' : ''} running — show list`}
            onClick={() => setSheetOpen(true)}
            className="relative flex h-14 w-14 select-none items-center justify-center rounded-full border border-paper-edge bg-paper-card text-brand-600 shadow-card transition-all active:scale-90 animate-pop dark:border-slate-700 dark:bg-slate-800 dark:text-brand-300"
          >
            <Timer className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white">
              {focusCount}
            </span>
          </button>
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
          className={`flex h-14 w-14 select-none items-center justify-center rounded-full bg-brand-600 text-white shadow-card transition-all active:scale-90 ${menuOpen ? '' : 'animate-float'}`}
        >
          <Plus className={`h-7 w-7 transition-transform ${menuOpen ? 'rotate-45' : ''}`} strokeWidth={2.4} />
        </button>
      </div>

      <FocusSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}
