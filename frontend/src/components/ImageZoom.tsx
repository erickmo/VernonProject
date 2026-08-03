import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { IDENTITY, dist, pan, zoomAbout, type View } from '../lib/imageZoom'

// Full-screen zoomable image viewer. Needed because the /m PWA sets
// maximum-scale=1.0, which disables native pinch-zoom — so the gesture is
// handled here. Pinch (2 fingers), drag-to-pan, double-tap/click and wheel.
export default function ImageZoom({
  src,
  alt = '',
  onClose,
}: {
  src: string
  alt?: string
  onClose: () => void
}) {
  const [view, setView] = useState<View>(IDENTITY)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const moved = useRef(false)
  const lastTap = useRef(0)

  // Client coords → coords from the wrapper centre (the transform-origin).
  const rel = (cx: number, cy: number) => {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) }
  }

  // Escape to close, and lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // Non-passive wheel so we can zoom without the page scrolling behind.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const f = rel(e.clientX, e.clientY)
      setView((v) => zoomAbout(v, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), f.x, f.y))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    moved.current = false
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()]
      pinch.current = { dist: dist(a, b), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
      drag.current = null
    } else {
      drag.current = { x: e.clientX, y: e.clientY }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return
    const prev = pts.current.get(e.pointerId)!
    if (Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y) > 4) moved.current = true
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pts.current.size >= 2 && pinch.current) {
      const [a, b] = [...pts.current.values()]
      const nd = dist(a, b)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const ratio = nd / pinch.current.dist
      const pdx = cx - pinch.current.cx
      const pdy = cy - pinch.current.cy
      const f = rel(cx, cy)
      setView((v) => zoomAbout(pan(v, pdx, pdy), v.scale * ratio, f.x, f.y))
      pinch.current = { dist: nd, cx, cy }
    } else if (drag.current && pts.current.size === 1) {
      const dx = e.clientX - drag.current.x
      const dy = e.clientY - drag.current.y
      drag.current = { x: e.clientX, y: e.clientY }
      setView((v) => (v.scale > 1 ? pan(v, dx, dy) : v))
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId)
    if (pts.current.size < 2) pinch.current = null
    if (pts.current.size === 1) {
      const [only] = [...pts.current.values()]
      drag.current = { x: only.x, y: only.y }
      return
    }
    drag.current = null
    // Double-tap / double-click toggles zoom about the tap point.
    if (pts.current.size === 0 && !moved.current) {
      const now = e.timeStamp
      if (now - lastTap.current < 300) {
        const f = rel(e.clientX, e.clientY)
        setView((v) => zoomAbout(v, v.scale > 1 ? 1 : 2.5, f.x, f.y))
        lastTap.current = 0
      } else {
        lastTap.current = now
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur"
      >
        <X className="h-5 w-5" />
      </button>
      <div
        ref={wrapRef}
        className="flex h-full w-full touch-none items-center justify-center overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-[92vh] max-w-[94vw] select-none object-contain will-change-transform"
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            transformOrigin: 'center center',
            cursor: view.scale > 1 ? 'grab' : 'zoom-in',
          }}
        />
      </div>
    </div>
  )
}
