import { useRef, useState, type ReactNode, type PointerEvent } from 'react'
import { GripVertical } from 'lucide-react'

type SortableProps<T> = {
  items: T[]
  keyFor: (item: T, index: number) => string
  onReorder: (from: number, to: number) => void
  renderItem: (item: T, index: number) => ReactNode
}

// Lightweight pointer-based reorderable list (mouse + touch, no dependency).
// onReorder is called live as the dragged row crosses another row's midpoint.
export function Sortable<T>({ items, keyFor, onReorder, renderItem }: SortableProps<T>) {
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
    const rows = Array.from(containerRef.current.children) as HTMLElement[]
    const y = e.clientY
    let target = rows.findIndex((row) => {
      const r = row.getBoundingClientRect()
      return y < r.top + r.height / 2
    })
    if (target === -1) target = rows.length - 1
    const current = dragIndexRef.current
    if (target !== current) {
      onReorder(current, target)
      dragIndexRef.current = target
      setDragIndex(target)
    }
  }

  const up = (e: PointerEvent) => {
    if (dragIndexRef.current === null) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    dragIndexRef.current = null
    setDragIndex(null)
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div
          key={keyFor(item, index)}
          className={'flex items-center gap-2 rounded-xl ' + (dragIndex === index ? 'opacity-60' : '')}
        >
          <button
            type="button"
            aria-label="Drag to reorder"
            onPointerDown={(e) => down(e, index)}
            onPointerMove={move}
            onPointerUp={up}
            className="shrink-0 cursor-grab touch-none px-1 text-slate-400 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
        </div>
      ))}
    </div>
  )
}
