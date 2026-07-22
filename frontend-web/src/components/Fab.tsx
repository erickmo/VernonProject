import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, StickyNote, Compass, Megaphone, Timer } from 'lucide-react'
import { useFocusTimers } from '@/hooks/useFocusTimer'
import { FocusSheet } from '@/components/FocusSheet'

// Global quick-add, mounted once for every /w route (desktop-fit sibling of the
// /m FAB). Click opens an action menu; a timer-count companion appears while
// focus timers run and opens the focus list sheet (tap a row to open its
// overlay, square to stop — the only stop path in inline mode).
export function Fab() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const focusCount = useFocusTimers().timers.length

  const actions = [
    { icon: StickyNote, label: 'New note', run: () => navigate('/notes/new') },
    { icon: Megaphone, label: 'New ad', run: () => navigate('/papan-iklan/new') },
    { icon: Compass, label: 'What can I do', run: () => navigate('/help') },
  ]

  return (
    <>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div role="menu" aria-label="Quick actions"
            className="fixed bottom-24 right-6 z-40 w-56 rounded-2xl bg-surface p-1.5 shadow-2xl animate-pop">
            {actions.map((m) => (
              <button key={m.label} role="menuitem" onClick={() => { setMenuOpen(false); m.run() }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-hover/[0.04]">
                <m.icon className="h-5 w-5 shrink-0 text-brand-500" /> {m.label}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="fixed bottom-6 right-6 z-30 flex items-center gap-3">
        {focusCount > 0 && (
          <button aria-label={`${focusCount} focus timer${focusCount > 1 ? 's' : ''} running — show list`} onClick={() => setSheetOpen(true)}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-surface text-brand-600 shadow-card transition active:scale-90 animate-pop dark:text-brand-300">
            <Timer className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white">{focusCount}</span>
          </button>
        )}
        <button aria-label="Quick add" aria-haspopup="menu" aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className={`flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-card transition active:scale-90 ${menuOpen ? '' : 'animate-float'}`}>
          <Plus className={`h-7 w-7 transition-transform ${menuOpen ? 'rotate-45' : ''}`} strokeWidth={2.4} />
        </button>
      </div>

      <FocusSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}
