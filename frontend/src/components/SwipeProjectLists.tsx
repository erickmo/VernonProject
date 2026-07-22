import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { SearchableSelect } from '@/components/SearchableSelect'
import { TodoCard } from '@/components/TodoCard'
import type { ProjectItem } from '@/lib/types'

// Bucket todos by project, first-seen order (follows the list's existing sort).
type Group = { key: string; name: string; todos: ProjectItem[] }
function groupByProject(todos: ProjectItem[]): Group[] {
  const map = new Map<string, Group>()
  for (const t of todos) {
    const key = t.project || t.project_name || '—'
    let g = map.get(key)
    if (!g) {
      g = { key, name: t.project_name || t.project || '—', todos: [] }
      map.set(key, g)
    }
    g.todos.push(t)
  }
  return [...map.values()]
}

function Cards({ todos }: { todos: ProjectItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      {todos.map((t) => (
        <TodoCard key={t.name} todo={t} />
      ))}
    </div>
  )
}

const FOCUS_PANES = [0, 1, 2] // 3 project-focus panes after the "All" pane

// Active pane + picks, mirrored to localStorage so they survive both a route
// change and a full reload — the pick is the user's place in their work, losing
// it on every refresh is the whole complaint. Same idea as web Home's
// usePersistentState, JSON'd because this is a pane index plus three picks.
// ponytail: one row for the whole carousel; single Home instance, so a module
// slot mirroring storage is enough — lift to a store if this ever mounts twice.
const KEY = 'home.swipeProjects'
type Persisted = { idx: number; picks: string[] }
const blank = (): Persisted => ({ idx: 0, picks: ['', '', ''] })

function load(): Persisted {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '')
    if (v && typeof v.idx === 'number') {
      // Rebuild the tuple positionally — a short/garbled array must not shrink it.
      return { idx: v.idx, picks: FOCUS_PANES.map((i) => String(v.picks?.[i] ?? '')) }
    }
  } catch {
    /* absent, corrupt, or private mode — fall back to a clean slate */
  }
  return blank()
}

const persist = load()

const PANES = FOCUS_PANES.length + 1 // "All" + 3 focus panes

// Mobile mirror of web's ThreeColProjectList: a horizontal swipe carousel.
// Pane 0 = the full list; panes 1-3 = each a project you pick, so you can work
// one project at a time. Dots idiom copied from BannerCarousel.
//
// Swipe is a JS transform track (touchAction:'pan-y') with a direction lock +
// distance threshold, NOT native scroll-snap: snap-mandatory grabbed diagonal
// and flick gestures during a vertical scroll, jumping panes by accident. Now a
// gesture only counts once it's clearly horizontal (|dx|>|dy|) AND past a
// distance threshold — vertical scrolls and taps leave the pane alone.
//
// Pickers live ABOVE the track, not inside it: SearchableSelect's dropdown is
// absolute-positioned and an overflow-x container would clip it. The header
// shows the active pane's picker.
export function SwipeProjectLists({ items }: { items: ProjectItem[] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(persist.idx)
  const [picks, setPicks] = useState(persist.picks) // focus panes 1-3

  // Live horizontal drag: axis lock (undecided until the gesture commits to one
  // axis) + finger-follow offset in px. Refs, not state, for the per-move path.
  const startX = useRef(0)
  const startY = useRef(0)
  const axis = useRef<'h' | 'v' | null>(null)
  const [dragging, setDragging] = useState(false)
  const [drag, setDrag] = useState(0)

  // Mirror state out so a remount (route change) or a reload restores it.
  useEffect(() => {
    persist.idx = idx
    persist.picks = picks
    try {
      localStorage.setItem(KEY, JSON.stringify({ idx, picks }))
    } catch {
      /* private mode / quota — non-fatal, just don't persist */
    }
  }, [idx, picks])

  const groups = groupByProject(items)
  // One project → focus panes are pointless; just show the flat list.
  if (groups.length < 2) return <Cards todos={items} />

  const options = groups.map((g) => ({ value: g.key, label: `${g.name} (${g.todos.length})` }))
  const setPick = (i: number, v: string) => setPicks((p) => p.map((x, k) => (k === i ? v : x)))
  const paneTodos = (i: number) => groups.find((g) => g.key === picks[i])?.todos

  const DEADZONE = 8 // px before we decide the axis — lets taps stay taps
  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    axis.current = null
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (axis.current === null) {
      if (Math.abs(dx) < DEADZONE && Math.abs(dy) < DEADZONE) return
      // Direction lock: whichever axis moved more wins for the rest of the gesture.
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      if (axis.current === 'h') setDragging(true)
    }
    if (axis.current !== 'h') return
    // Rubber-band the two edges so the track resists past the ends.
    const atEdge = (idx === 0 && dx > 0) || (idx === PANES - 1 && dx < 0)
    setDrag(atEdge ? dx * 0.35 : dx)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (axis.current === 'h') {
      const dx = e.changedTouches[0].clientX - startX.current
      const w = wrapRef.current?.clientWidth ?? 1
      const THRESH = Math.max(56, w * 0.25) // clear, firm swipe: 25% of width or 56px
      if (dx <= -THRESH && idx < PANES - 1) setIdx(idx + 1)
      else if (dx >= THRESH && idx > 0) setIdx(idx - 1)
    }
    setDrag(0)
    setDragging(false)
    axis.current = null
  }

  return (
    <div className="relative mt-3">
      {/* Active-pane control: "All" is just a label; focus panes get a picker.
          Sticks below the page header so the focused project stays on screen
          while its todos scroll. --tab-hdr is TabScreen's measured header height;
          the fallback only matters for the first paint. */}
      <div className="sticky top-[var(--tab-hdr,5.75rem)] z-10 -mx-4 mb-3 min-h-[2.75rem] bg-paper/95 px-4 py-1.5 backdrop-blur-sm dark:bg-slate-900">
        {idx === 0 ? (
          <div className="flex items-center gap-2 px-1 py-2 text-sm font-semibold text-stone-500 dark:text-slate-400">
            All todos · {items.length}
          </div>
        ) : (
          <SearchableSelect
            value={picks[idx - 1]}
            onChange={(v) => setPick(idx - 1, v)}
            options={options}
            allowClear
            placeholder="Pick a project"
          />
        )}
      </div>

      {/* Dots + pane counter */}
      <div className="mb-3 flex items-center justify-center gap-2">
        <div className="flex items-center gap-1.5">
          {[0, ...FOCUS_PANES.map((i) => i + 1)].map((k) => (
            <span
              key={k}
              className={clsx('h-1.5 rounded-full transition-all', k === idx ? 'w-4 bg-brand-600' : 'w-1.5 bg-paper-line dark:bg-slate-700')}
            />
          ))}
        </div>
        <span className="text-xs font-semibold tabular-nums text-stone-400 dark:text-slate-500">
          {idx + 1}/{FOCUS_PANES.length + 1}
        </span>
      </div>

      {/* Swipe track — JS transform, not native scroll. touchAction:'pan-y' hands
          vertical gestures to the page (so list scroll & pull-to-refresh still
          work) and leaves horizontal to our threshold'd handler. */}
      <div ref={wrapRef} className="overflow-hidden" style={{ touchAction: 'pan-y' }}>
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          // ponytail: track height = tallest pane, so an empty focus pane leaves
          // whitespace below. Fine; revisit if users complain.
          className={clsx('flex', !dragging && 'transition-transform duration-300 ease-out')}
          style={{ transform: `translateX(calc(${-idx * 100}% + ${drag}px))` }}
        >
          <div className="w-full shrink-0">
            <Cards todos={items} />
          </div>
          {FOCUS_PANES.map((i) => {
            const todos = paneTodos(i)
            return (
              <div key={i} className="w-full shrink-0">
                {todos ? (
                  <Cards todos={todos} />
                ) : (
                  <div className="rounded-2xl border border-dashed border-paper-edge p-8 text-center text-sm text-stone-400 dark:border-slate-700 dark:text-slate-500">
                    Pick a project above to focus this pane.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
