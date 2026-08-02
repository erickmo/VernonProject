import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const W = 288 // w-72

// Menu panel portaled to <body> and positioned `fixed` at the anchor's rect.
// Portaling escapes the overflow-hidden/auto dialog, drawer, card and table
// ancestors that would otherwise clip an in-flow absolute panel. Closes on
// outside-click, Escape and any scroll/resize (a fixed panel detaches from its
// anchor once the page scrolls) — mirrors DatePicker's AnchoredPanel.
export function Popover({
  open, onClose, anchorRef, children, align = 'right',
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement>
  children: ReactNode
  align?: 'left' | 'right'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const a = anchorRef.current
    if (!a) return
    const r = a.getBoundingClientRect()
    let left = align === 'right' ? r.right - W : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - W - 8))
    setPos({ top: r.bottom + 8, left })

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || a.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [open, onClose, anchorRef, align])

  if (!open || !pos) return null
  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: W }}
      className="z-[60] max-h-[70vh] overflow-y-auto rounded-xl bg-surface shadow-xl border border-line p-4"
    >
      {children}
    </div>,
    document.body,
  )
}
