import { useRef, useState, type PointerEvent } from 'react'

// Long-press feedback. Returns `holding` (drives the fill overlay while the
// press is in flight) and a one-shot `fired` (drives the pop when the press
// completes), plus pointer handlers to spread onto the target. Touch/pen only —
// mouse keeps click/right-click semantics untouched. `onFire` runs when the
// press crosses `ms`, receiving the press-start point so callers can anchor a
// menu; `longFired` lets the caller swallow the click that trails a completed
// long-press. `ms` mirrors LONG_MS in TodoCard/Fab and the hold-fill CSS.
export function useHoldFeedback(onFire?: (pt: { x: number; y: number }) => void, ms = 450) {
  const [holding, setHolding] = useState(false)
  const [fired, setFired] = useState(false)
  const longFired = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return
    const pt = { x: e.clientX, y: e.clientY }
    start.current = pt
    longFired.current = false
    if (timer.current) clearTimeout(timer.current)
    setHolding(true)
    timer.current = setTimeout(() => {
      timer.current = null
      longFired.current = true
      setHolding(false)
      setFired(true)
      setTimeout(() => setFired(false), 350)
      onFire?.(pt)
    }, ms)
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!start.current) return
    // Treat a drag/scroll as a tap-not-hold and disarm.
    if (Math.abs(e.clientX - start.current.x) > 10 || Math.abs(e.clientY - start.current.y) > 10) cancel()
  }

  return {
    holding,
    fired,
    longFired,
    bind: { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel },
  }
}
