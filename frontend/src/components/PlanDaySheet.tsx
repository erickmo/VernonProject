import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, CalendarRange, Sparkles, Save } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { mobileApi } from '@/lib/api'
import { keys } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner, EmptyState } from '@/components/ui'
import { formatEstimate, todayISO } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

const ANIM_MS = 260
const DAILY_TARGET_MIN = 360 // soft 6h/day target — a guide, not a cap
const CHIPS = [15, 30, 60]

// Plan today's minutes across candidate todos. Writes only today's allocation row
// per touched todo, preserving each todo's other-day rows. Planning only — never
// touches status/scoring (reuses the validated set_todo_allocations endpoint).
export function PlanDaySheet({ todos, onClose }: { todos: ProjectItem[]; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const today = todayISO()

  // Minutes planned for *today* per todo, seeded from today_allocation.
  const [mins, setMins] = useState<Record<string, number>>(() =>
    Object.fromEntries(todos.map((t) => [t.name, t.today_allocation || 0])),
  )
  const [saving, setSaving] = useState(false)

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

  const setMin = (id: string, v: number) => setMins((m) => ({ ...m, [id]: Math.max(0, v) }))

  const total = Object.values(mins).reduce((s, v) => s + v, 0)
  const pct = Math.min(1, total / DAILY_TARGET_MIN)

  const onSave = async () => {
    // Only write todos whose today-minutes actually changed.
    const touched = todos.filter((t) => (mins[t.name] || 0) !== (t.today_allocation || 0))
    if (!touched.length) {
      close()
      return
    }
    setSaving(true)
    try {
      await Promise.all(
        touched.map((t) => {
          const m = mins[t.name] || 0
          // Preserve every other-day row; replace only today's.
          const next = [
            ...(t.allocations ?? []).filter((a) => a.date !== today),
            ...(m > 0 ? [{ date: today, minutes: m }] : []),
          ]
          return mobileApi.setTodoAllocations(t.name, next)
        }),
      )
      qc.invalidateQueries({ queryKey: keys.dashboard })
      for (const t of touched) qc.invalidateQueries({ queryKey: keys.projectItem(t.name) })
      toast('success', 'Day planned')
      close()
    } catch (e) {
      toast('error', (e as Error).message || 'Could not save plan')
    } finally {
      setSaving(false)
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
                <span className="font-bold text-brand-600 dark:text-brand-400">{formatEstimate(total)}</span> /{' '}
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

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {todos.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="Nothing to plan"
              subtitle="No tasks due today or overdue. Enjoy the breathing room."
            />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {todos.map((t) => {
                const v = mins[t.name] || 0
                return (
                  <li
                    key={t.name}
                    className="rounded-2xl border border-paper-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-800/60"
                  >
                    <p className="line-clamp-2 text-sm font-semibold text-stone-800 dark:text-slate-100">{t.to_do}</p>
                    <p className="mt-0.5 truncate text-[11px] text-stone-400 dark:text-slate-500">
                      {t.project_name}
                      {t.estimated > 0 ? ` · est ${formatEstimate(t.estimated)}` : ''}
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        onClick={() => setMin(t.name, v - 15)}
                        aria-label="15 minutes less"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-16 shrink-0 text-center text-sm font-bold tabular-nums text-stone-800 dark:text-slate-100">
                        {v > 0 ? formatEstimate(v) : '—'}
                      </span>
                      <button
                        onClick={() => setMin(t.name, v + 15)}
                        aria-label="15 minutes more"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <div className="ml-auto flex items-center gap-1">
                        {CHIPS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setMin(t.name, c)}
                            className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition active:scale-95 dark:bg-brand-500/15 dark:text-brand-300"
                          >
                            {c}m
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-paper-edge px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 dark:border-slate-700">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 text-sm font-semibold text-white transition active:bg-brand-700 disabled:opacity-60"
          >
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save plan
          </button>
        </div>
      </div>
    </div>
  )
}
