import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import CertificateScreen from '@/pages/CertificateScreen'
import { clampDragY, shouldDismissSheet } from '@/lib/sheetDrag'

// The certificate form as a slide-up sheet over the list it was opened from — the
// same shell as TodoOverlay (backdrop + panel + grabber + drag-to-dismiss), capped at
// 90vh rather than 80: this form is a four-section flow with a scoring table, and the
// extra tenth is the difference between seeing a criterion's caption with its score
// box and scrolling to guess at it.
//
// CertificateScreen's own DetailScreen supplies the header and back button; it portals
// into `headerSlot` instead of relying on `sticky`, which sticks to the wrong ancestor
// once the screen is nested inside this sheet's own scrolling body.
//
// z-40: below the full-screen z-50 gates (Focus, DISC, recognition), same as TodoOverlay.
export default function CertificateOverlay() {
  const navigate = useNavigate()
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)

  const close = () => navigate(-1)

  // Drag-down-to-dismiss from the grabber only — the body scrolls through four
  // sections, so a drag started there must scroll, not dismiss.
  const [dragY, setDragY] = useState(0)
  const dragging = useRef(false)
  const startY = useRef(0)
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
          'relative flex max-h-[90vh] flex-col overflow-hidden rounded-t-3xl bg-paper shadow-2xl dark:bg-slate-900',
          dragY === 0 && !everDragged.current && 'animate-slide-up',
        )}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging.current ? 'none' : 'transform 0.2s ease-out',
        }}
      >
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
          <CertificateScreen headerPortalTarget={headerSlot} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
