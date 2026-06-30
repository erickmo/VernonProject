import { useEffect, useRef, useState } from 'react'
import { CalendarRange, Sparkles, Save, Search } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { PlanRow } from '@/components/PlanRow'
import { usePlanDay } from '@/hooks/usePlanDay'
import { formatEstimate } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

const ANIM_MS = 260
const DAILY_TARGET_MIN = 360 // soft 6h/day target — a guide, not a cap

// Plan today's minutes across candidate todos. Writes only today's allocation row
// per touched todo, preserving each todo's other-day rows (see usePlanDay).
export function PlanDaySheet({ todos, onClose }: { todos: ProjectItem[]; onClose: () => void }) {
  const plan = usePlanDay(todos)
  const pct = Math.min(1, plan.total / DAILY_TARGET_MIN)

  const [shown, setShown] = useState(false) // drives the enter/exit slide
  const [drag, setDrag] = useState(0) // px the sheet is pulled down (>= 0)
  const dragging = useRef(false)
  const startY = useRef<number | null>(null)
  const closed = useRef(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const close = () => {
    if (closed.current) return
    closed.current = true
    setShown(false)
    setDrag(0)
    setTimeout(onClose, ANIM_MS)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    dragging.current = true
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || startY.current === null) return
    setDrag(Math.max(0, e.touches[0].clientY - startY.current))
  }
  const onTouchEnd = () => {
    dragging.current = false
    startY.current = null
    if (drag > 110) close()
    else setDrag(0)
  }

  const onSave = async () => {
    try {
      await plan.save()
      close()
    } catch {
      /* save() already toasted — keep the sheet open so edits aren't lost */
    }
  }

  const sheetStyle: React.CSSProperties = {
    transform: shown ? `translateY(${drag}px)` : 'translateY(100%)',
    transition: dragging.current ? 'none' : `transform ${ANIM_MS}ms cubic-bezier(0.32,0.72,0,1)`,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-[260ms]"
        style={{ opacity: shown ? 1 : 0 }}
        onClick={close}
      />
      <div
        className="relative mx-auto flex max-h-[85vh] w-full max-w-[448px] flex-col rounded-t-[28px] bg-paper-card shadow-2xl will-change-transform dark:bg-slate-800"
        style={sheetStyle}
      >
        {/* Grabber + header — drag handle area */}
        <div
          className="shrink-0 cursor-grab touch-none px-5 pt-3 active:cursor-grabbing"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-stone-300 dark:bg-slate-600" />
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-500" />
            <h2 className="font-display text-lg font-semibold text-stone-800 dark:text-slate-50">Plan my day</h2>
          </div>
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs font-medium text-stone-500 dark:text-slate-400">
              <span>Planned today</span>
              <span>
                <span className="font-bold text-brand-600 dark:text-brand-400">{formatEstimate(plan.total)}</span> /{' '}
                {formatEstimate(DAILY_TARGET_MIN)}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper-line dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 px-5 pb-2">
          {/* Search */}
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-paper-line px-3 py-2 dark:bg-slate-700/60">
            <Search className="h-4 w-4 shrink-0 text-stone-400 dark:text-slate-500" />
            <input
              value={plan.query}
              onChange={(e) => plan.setQuery(e.target.value)}
              placeholder="Search tasks…"
              className="w-full bg-transparent text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {plan.visible.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title={plan.query ? 'No matches' : 'Nothing to plan'}
              subtitle={plan.query ? 'Try a different search.' : 'No tasks due today or overdue. Enjoy the breathing room.'}
            />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {plan.visible.map((t) => (
                <PlanRow key={t.name} todo={t} minutes={plan.mins[t.name] || 0} onSet={plan.setMin} onUseEstimate={plan.useEstimate} />
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-paper-edge px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 dark:border-slate-700">
          <button
            onClick={onSave}
            disabled={plan.saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 text-sm font-semibold text-white transition active:bg-brand-700 disabled:opacity-60"
          >
            {plan.saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save plan
          </button>
        </div>
      </div>
    </div>
  )
}
