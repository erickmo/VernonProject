import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { resolveGlobalKey, isEditableTarget, SHORTCUTS } from '@web/lib/shortcuts'
import { useModalA11y } from '@web/lib/useModalA11y'

type Handlers = { openPalette: () => void; openQuick: () => void; openTask: () => void }

/**
 * Registers the single global keydown listener for /w. Handlers are read through
 * a ref so the listener registers once. Owns the `g`-prefix window and the
 * cheat-sheet open state; returns the state so AppShell renders <ShortcutsHelp>.
 */
export function useShortcuts({ openPalette, openQuick, openTask }: Handlers) {
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)
  const ref = useRef({ navigate, openPalette, openQuick, openTask })
  ref.current = { navigate, openPalette, openQuick, openTask }

  useEffect(() => {
    let pendingG = false
    let gTimer: ReturnType<typeof setTimeout> | undefined
    const clearG = () => { pendingG = false; if (gTimer) clearTimeout(gTimer) }

    const onKey = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K opens the palette from anywhere, including inputs.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); ref.current.openPalette(); return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditableTarget(e.target)) return

      const action = resolveGlobalKey(pendingG, e.key)
      if (pendingG) clearG()          // any key ends the g-sequence
      if (!action) return
      e.preventDefault()
      switch (action.kind) {
        case 'startG':
          pendingG = true
          gTimer = setTimeout(() => { pendingG = false }, 1000)
          break
        case 'help': setHelpOpen((o) => !o); break
        case 'palette': ref.current.openPalette(); break
        case 'quick': ref.current.openQuick(); break
        case 'task': ref.current.openTask(); break
        case 'nav': ref.current.navigate(action.to); break
      }
    }

    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); if (gTimer) clearTimeout(gTimer) }
  }, [])

  return { helpOpen, setHelpOpen }
}

/** The `?` cheat-sheet. Esc-closes via useModalA11y like every other overlay. */
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const ref = useModalA11y(true, onClose)
  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={ref}
        role="dialog"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1/2 top-1/2 w-[min(30rem,92vw)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-pop animate-pop"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Keyboard shortcuts</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-hover/[0.06]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">
          {SHORTCUTS.map((g) => (
            <div key={g.title}>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</div>
              <div className="space-y-1">
                {g.rows.map((r) => (
                  <div key={r.keys} className="flex items-center justify-between gap-4 rounded-md px-1 py-1 text-sm">
                    <span className="text-ink">{r.label}</span>
                    <kbd className="shrink-0 rounded-md border border-line bg-hover/[0.04] px-2 py-0.5 font-mono text-xs text-muted">{r.keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
