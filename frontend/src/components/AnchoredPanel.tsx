import { useState, useRef, useLayoutEffect, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

// Pure placement math (testable, no DOM): position a panel of height `h` under
// the anchor rect, flipping above when it would overflow the viewport bottom,
// and clamping left into view. Width follows the anchor.
export function placePanel(
  r: { top: number; bottom: number; left: number; width: number },
  vw: number,
  vh: number,
  h: number,
): { top: number; left: number; width: number } {
  let top = r.bottom + 4
  if (top + h > vh - 8 && r.top - h - 4 > 8) top = r.top - h - 4 // flip above
  const left = Math.max(8, Math.min(r.left, vw - r.width - 8))
  return { top, left, width: r.width }
}

// Portals a floating panel to <body>, positioned `fixed` under (or above) an
// anchor and matched to its width. Escapes the overflow-hidden/auto dialog,
// sheet, drawer, card and table ancestors that clip an in-flow absolute panel.
// Closes on outside-click and Escape; repositions (not closes) on scroll/resize
// so the mobile soft-keyboard's viewport resize shifts the panel instead of
// dismissing it — these panels autoFocus a search input that summons it.
export function AnchoredPanel({
  open, onClose, anchorRef, children, maxHeight = 300,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement>
  children: ReactNode
  maxHeight?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const a = anchorRef.current
    if (!a) return
    const place = () => {
      if (!anchorRef.current) return
      setPos(placePanel(anchorRef.current.getBoundingClientRect(), window.innerWidth, window.innerHeight, maxHeight))
    }
    place()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || a.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', place, true) // capture: also fires for scrolling containers
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, onClose, anchorRef, maxHeight])

  if (!open || !pos) return null
  return createPortal(
    <div ref={panelRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }} className="z-[60]">
      {children}
    </div>,
    document.body,
  )
}
