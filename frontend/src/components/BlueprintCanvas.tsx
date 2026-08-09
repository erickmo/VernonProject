import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Crosshair } from 'lucide-react'
import { layoutBlueprint, type BlueprintData, type LayoutNode } from '@/lib/blueprint'

// Shared whiteboard engine for the "begin with the end in mind" map: positions
// nodes (via layoutBlueprint), draws hierarchy + dependency edges, and handles
// pan / pinch-zoom, node drag-to-rearrange, and drag-to-connect. Presentation is
// delegated via renderNode so each frontend keeps its own card style. A tap on a
// node (no drag) fires onNodeActivate → the parent opens a context menu.

interface Props {
  data: BlueprintData
  renderNode: (node: LayoutNode) => ReactNode
  /** Tap / right-click / long-press a node (no drag) → open its action menu. */
  onNodeActivate: (node: LayoutNode, at: { x: number; y: number }) => void
  /** Drag from a todo handle onto another todo → create dependency (from blocks to). */
  onConnect?: (from: string, to: string) => void
  /** Tap a dependency edge → remove it. */
  onDisconnect?: (from: string, to: string) => void
  canEdit?: boolean
}

type View = { tx: number; ty: number; s: number }
type XY = { x: number; y: number }
const clampScale = (s: number) => Math.min(2.2, Math.max(0.25, s))
const TAP_SLOP = 5 // px of movement below which a pointer-up counts as a tap, not a drag

const rightC = (p: { x: number; y: number; w: number; h: number }) => ({ x: p.x + p.w, y: p.y + p.h / 2 })
const leftC = (p: { x: number; y: number; w: number; h: number }) => ({ x: p.x, y: p.y + p.h / 2 })

function bez(a: XY, b: XY) {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5)
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}

export function BlueprintCanvas({ data, renderNode, onNodeActivate, onConnect, onDisconnect, canEdit }: Props) {
  const layout = useMemo(() => layoutBlueprint(data), [data])
  const wrapRef = useRef<HTMLDivElement>(null)

  const [view, setView] = useState<View>({ tx: 32, ty: 24, s: 0.8 })
  // Session-local position overrides (drag-to-rearrange). Not persisted — "Rapikan" clears.
  const [override, setOverride] = useState<Map<string, XY>>(new Map())
  const eff = useCallback(
    (n: LayoutNode) => {
      const o = override.get(n.id)
      return { x: o?.x ?? n.x, y: o?.y ?? n.y, w: n.w, h: n.h }
    },
    [override],
  )
  const nodePos = useMemo(() => new Map(layout.nodes.map((n) => [n.id, eff(n)])), [layout, eff])

  const [drag, setDrag] = useState<{ from: string; x: number; y: number } | null>(null) // connect
  const nodeDrag = useRef<{ id: string; gx: number; gy: number; sx: number; sy: number; moved: boolean } | null>(null)
  const pointers = useRef(new Map<number, XY>())
  const panLast = useRef<XY | null>(null)
  const pinchLast = useRef<number | null>(null)

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const r = wrapRef.current!.getBoundingClientRect()
      return { x: (clientX - r.left - view.tx) / view.s, y: (clientY - r.top - view.ty) / view.s }
    },
    [view],
  )
  const todoAt = useCallback(
    (wx: number, wy: number): LayoutNode | null =>
      layout.nodes.find((n) => {
        if (n.kind !== 'todo') return false
        const p = nodePos.get(n.id)!
        return wx >= p.x && wx <= p.x + p.w && wy >= p.y && wy <= p.y + p.h
      }) ?? null,
    [layout, nodePos],
  )

  // ---- background pan / pinch ----------------------------------------------
  // Capture on the WRAPPER (not e.target) so every move reaches this handler no
  // matter which background child (svg / inner div) was pressed. Nodes, the
  // connect handle, and dependency edges stopPropagation, so only true
  // background drags land here → pan.
  const onPointerDownBg = (e: React.PointerEvent) => {
    wrapRef.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) panLast.current = { x: e.clientX, y: e.clientY }
    if (pointers.current.size === 2) pinchLast.current = null
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag) {
      const w = toWorld(e.clientX, e.clientY)
      setDrag({ ...drag, x: w.x, y: w.y })
      return
    }
    const nd = nodeDrag.current
    if (nd) {
      if (!nd.moved && Math.hypot(e.clientX - nd.sx, e.clientY - nd.sy) <= TAP_SLOP) return
      nd.moved = true
      const w = toWorld(e.clientX, e.clientY)
      setOverride((prev) => new Map(prev).set(nd.id, { x: w.x - nd.gx, y: w.y - nd.gy }))
      return
    }
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    if (pts.length >= 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (pinchLast.current != null) zoomAt((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, d / pinchLast.current)
      pinchLast.current = d
      panLast.current = null
    } else if (panLast.current) {
      setView((v) => ({ ...v, tx: v.tx + (e.clientX - panLast.current!.x), ty: v.ty + (e.clientY - panLast.current!.y) }))
      panLast.current = { x: e.clientX, y: e.clientY }
    }
  }
  const endPointer = (e: React.PointerEvent) => {
    if (drag) {
      const w = toWorld(e.clientX, e.clientY)
      const target = todoAt(w.x, w.y)
      if (target && target.id !== drag.from) onConnect?.(drag.from, target.id)
      setDrag(null)
      return
    }
    const nd = nodeDrag.current
    if (nd) {
      nodeDrag.current = null
      if (!nd.moved) {
        const node = layout.nodes.find((n) => n.id === nd.id)
        const r = wrapRef.current!.getBoundingClientRect()
        if (node) onNodeActivate(node, { x: e.clientX - r.left, y: e.clientY - r.top })
      }
      return
    }
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchLast.current = null
    if (pointers.current.size === 0) panLast.current = null
  }

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    setView((v) => {
      const r = wrapRef.current!.getBoundingClientRect()
      const s = clampScale(v.s * factor)
      const k = s / v.s
      return { s, tx: clientX - r.left - (clientX - r.left - v.tx) * k, ty: clientY - r.top - (clientY - r.top - v.ty) * k }
    })
  }
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1)
  }

  // ---- per-node pointer (drag-to-rearrange / tap-to-activate) ---------------
  const onNodePointerDown = (e: React.PointerEvent, n: LayoutNode) => {
    e.stopPropagation() // don't start a background pan
    wrapRef.current?.setPointerCapture(e.pointerId)
    const w = toWorld(e.clientX, e.clientY)
    const p = nodePos.get(n.id)!
    nodeDrag.current = { id: n.id, gx: w.x - p.x, gy: w.y - p.y, sx: e.clientX, sy: e.clientY, moved: false }
  }
  const startConnect = (e: React.PointerEvent, from: string) => {
    e.stopPropagation()
    wrapRef.current?.setPointerCapture(e.pointerId)
    const w = toWorld(e.clientX, e.clientY)
    setDrag({ from, x: w.x, y: w.y })
  }

  const fromPos = drag ? nodePos.get(drag.from) : null

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden bg-slate-50 dark:bg-slate-900/40"
      style={{ touchAction: 'none', cursor: drag ? 'crosshair' : 'grab' }}
      onPointerDown={onPointerDownBg}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onWheel={onWheel}
    >
      <div
        style={{
          position: 'absolute',
          transformOrigin: '0 0',
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
          width: layout.width,
          height: layout.height,
        }}
      >
        <svg width={layout.width} height={layout.height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <defs>
            <marker id="bp-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 Z" className="fill-indigo-500" />
            </marker>
          </defs>
          {layout.edges.map((ed) => {
            const a = nodePos.get(ed.from)
            const b = nodePos.get(ed.to)
            if (!a || !b) return null
            const dep = ed.kind === 'dependency'
            const path = bez(rightC(a), leftC(b))
            return (
              <g key={ed.id}>
                {dep && (
                  <path
                    d={path}
                    stroke="transparent"
                    strokeWidth={16}
                    fill="none"
                    style={{ cursor: onDisconnect ? 'pointer' : 'default' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onDisconnect?.(ed.from, ed.to) }}
                  />
                )}
                <path
                  d={path}
                  fill="none"
                  className={dep ? 'stroke-indigo-400' : ed.overdue ? 'stroke-rose-300 dark:stroke-rose-500/60' : 'stroke-slate-300 dark:stroke-slate-600'}
                  strokeWidth={dep ? 2 : 1.5}
                  strokeDasharray={dep ? '5 4' : undefined}
                  markerEnd={dep ? 'url(#bp-arrow)' : undefined}
                />
              </g>
            )
          })}
          {drag && fromPos && (
            <path d={bez(rightC(fromPos), { x: drag.x, y: drag.y })} fill="none" className="stroke-indigo-500" strokeWidth={2} strokeDasharray="5 4" />
          )}
        </svg>

        {layout.nodes.map((n) => {
          const p = nodePos.get(n.id)!
          return (
            <div
              key={n.id}
              onPointerDown={(e) => onNodePointerDown(e, n)}
              onContextMenu={(e) => {
                e.preventDefault()
                const r = wrapRef.current!.getBoundingClientRect()
                onNodeActivate(n, { x: e.clientX - r.left, y: e.clientY - r.top })
              }}
              style={{ position: 'absolute', left: p.x, top: p.y, width: n.w, height: n.h, cursor: 'grab', touchAction: 'none' }}
            >
              {renderNode(n)}
              {canEdit && n.kind === 'todo' && (
                <button
                  type="button"
                  title="Tarik untuk menghubungkan ketergantungan"
                  onPointerDown={(e) => startConnect(e, n.id)}
                  className="absolute -right-2 top-1/2 z-10 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-indigo-500 shadow hover:scale-125 dark:border-slate-800"
                  style={{ touchAction: 'none' }}
                />
              )}
            </div>
          )
        })}
      </div>

      {override.size > 0 && (
        <button
          onClick={() => setOverride(new Map())}
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md ring-1 ring-slate-200 backdrop-blur hover:bg-white dark:bg-slate-800/90 dark:text-slate-200 dark:ring-slate-700"
        >
          <Crosshair className="h-3.5 w-3.5" /> Rapikan
        </button>
      )}
    </div>
  )
}
