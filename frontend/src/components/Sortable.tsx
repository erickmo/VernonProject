import { useRef, useState, type ReactNode, type PointerEvent } from 'react'
import { GripVertical } from 'lucide-react'
import { dropIndex } from '@/lib/dragOrder'

type SortableProps<T> = {
  items: T[]
  keyFor: (item: T, index: number) => string
  onReorder: (from: number, to: number) => void
  renderItem: (item: T, index: number) => ReactNode
  onDragEnd?: () => void
}

// Lightweight pointer-based reorderable list (mouse + touch, no dependency).
// onReorder is called live as the dragged row crosses another row's midpoint;
// onDragEnd fires once, when the drag ends — the moment to persist the final
// order. Dragging is scoped to the grip so it never fights tap-to-open.
export function Sortable<T>({ items, keyFor, onReorder, renderItem, onDragEnd }: SortableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  const down = (e: PointerEvent, index: number) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragIndexRef.current = index
    setDragIndex(index)
  }

  const move = (e: PointerEvent) => {
    if (dragIndexRef.current === null || !containerRef.current) return
    const mids = Array.from(containerRef.current.children).map((row) => {
      const r = row.getBoundingClientRect()
      return r.top + r.height / 2
    })
    const current = dragIndexRef.current
    const target = dropIndex(mids, e.clientY, current)
    if (target !== current) {
      onReorder(current, target)
      dragIndexRef.current = target
      setDragIndex(target)
    }
  }

  // Release OR cancel. A drag that ends in `pointercancel` (Android long-press
  // menu, the browser claiming the gesture) left the new order on screen with
  // nothing persisted — the reorder was lost on the next reload, which is what
  // "the order isn't saved" looked like. Both endings persist.
  const up = (e: PointerEvent) => {
    if (dragIndexRef.current === null) return
    dragIndexRef.current = null
    setDragIndex(null)
    try {
      // Throws NotFoundError on the pointercancel path — the pointer is already
      // gone by then. Persisting the order must not depend on this succeeding.
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      /* nothing left to release */
    }
    onDragEnd?.()
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div
          key={keyFor(item, index)}
          className={'flex items-center gap-1 rounded-xl ' + (dragIndex === index ? 'opacity-60' : '')}
        >
          <button
            type="button"
            aria-label="Drag to reorder"
            onPointerDown={(e) => down(e, index)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            // The grip was a bare 16px icon: a ~24x16px target, well under the
            // ~44px a finger can actually hit, so a drag usually landed on the
            // row instead and opened the task. Padding makes the target 40x44
            // without changing the icon or the row's height.
            className="flex h-11 w-10 shrink-0 cursor-grab touch-none items-center justify-center text-slate-400 active:cursor-grabbing dark:text-slate-500"
          >
            <GripVertical className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
        </div>
      ))}
    </div>
  )
}
