import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import ProjectItemScreen from '@/pages/ProjectItemScreen'
import { useProjectItem } from '@/hooks/useData'
import { clampDragY, shouldDismissSheet } from '@/lib/sheetDrag'

// Bottom sheet capped at 80vh (never covers the full screen) — mirrors the FilterSheet/
// ScheduleHelpSheet shell (backdrop + slide-up panel + grabber), but for the todo detail.
// ProjectItemScreen's own DetailScreen supplies the header + back button; navigate(-1)
// from there lands back on the background route and closes this overlay same as before.
// The header portals into `headerSlot` (a shrink-0 sibling of the scrolling body,
// itself a sibling of the grabber) instead of relying on its own `sticky` — nested
// inside this sheet's own scroll container, `sticky` stuck to the wrong ancestor and
// the header scrolled away with the body. Portaling hoists it out structurally so it
// is always at the top of the drawer, not just usually.
// Portal to <body> so `fixed` is viewport-relative even under a transformed ancestor.
// z-40: stay below full-screen z-50 popups (Focus, DISC/prank/recognition gates).
export default function TodoOverlay() {
  const { name = '' } = useParams()
  const navigate = useNavigate()
  // ProjectItemScreen's DetailScreen portals its header into this node instead
  // of relying on `sticky` — see DetailScreen's own docstring for why that
  // breaks once nested inside this sheet's own scrolling body. State (not a
  // plain ref) because the portal target must exist and trigger a re-render
  // before ProjectItemScreen's first paint can target it.
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)
  // Same queryKey as ProjectItemScreen's own useProjectItem(id) below — react-query
  // dedupes to one fetch, so reading the AI flag here for the panel tint is free.
  const { data } = useProjectItem(decodeURIComponent(name))
  const aiOn = data?.work_mode === 'AI' || data?.work_mode === 'Both'

  const close = () => navigate(-1)

  // Drag-down-to-dismiss, tracked from the grabber handle only — the content below
  // scrolls (notes/comments), so only the handle should hijack vertical drag.
  const [dragY, setDragY] = useState(0)
  const dragging = useRef(false)
  const startY = useRef(0)
  // Once the sheet has been dragged, snap-back must use the transform transition
  // below, not the entrance keyframe (which would replay from off-screen).
  const everDragged = useRef(false)

  const onHandleDown = (e: React.PointerEvent) => {
    dragging.current = true
    everDragged.current = true
    startY.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onHandleMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    setDragY(clampDragY(e.clientY - startY.current))
  }
  const endDrag = () => {
    if (!dragging.current) return
    dragging.current = false
    if (shouldDismissSheet(dragY)) close()
    setDragY(0)
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={close} />
      <div
        className={clsx(
          'relative flex max-h-[80vh] flex-col overflow-hidden rounded-t-3xl bg-paper shadow-2xl dark:bg-slate-900',
          dragY === 0 && !everDragged.current && 'animate-slide-up',
        )}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging.current ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {/* Opaque base above always guarantees the AI wash never lets the page bleed through. */}
        {aiOn && <div className="pointer-events-none absolute inset-0 bg-violet-50/40 dark:bg-violet-500/[0.06]" />}
        <div
          className="relative shrink-0 touch-none py-2.5"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>
        <div ref={setHeaderSlot} className="relative shrink-0" />
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ProjectItemScreen headerPortalTarget={headerSlot} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
