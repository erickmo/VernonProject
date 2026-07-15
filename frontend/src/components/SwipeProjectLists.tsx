import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

// ponytail: module slot so the active pane + picks survive SPA navigation
// away/back (component unmounts on route change). Single Home instance, so one
// global is fine; lift to a store if this ever mounts twice. Lost on full
// reload — swap to sessionStorage if that matters.
const persist = { idx: 0, picks: ['', '', ''] as string[] }

// Mobile mirror of web's ThreeColProjectList: a horizontal swipe carousel.
// Pane 0 = the full list; panes 1-3 = each a project you pick, so you can work
// one project at a time. Snap + dots idiom copied from BannerCarousel.
//
// Pickers live ABOVE the scroll track, not inside it: SearchableSelect's dropdown
// is absolute-positioned, and a scroll-snap track (overflow-x:auto forces
// overflow-y:auto) would clip it. The header shows the active pane's picker.
export function SwipeProjectLists({ items }: { items: ProjectItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(persist.idx)
  const [picks, setPicks] = useState(persist.picks) // focus panes 1-3

  // Mirror state into the module slot so a remount restores it.
  useEffect(() => {
    persist.idx = idx
    persist.picks = picks
  }, [idx, picks])

  // Restore scroll onto the saved pane once the track exists (items may load
  // async, so re-check each render until done — guarded, so it runs once).
  const restored = useRef(false)
  useLayoutEffect(() => {
    const el = trackRef.current
    if (el && !restored.current) {
      restored.current = true
      if (persist.idx) el.scrollLeft = persist.idx * el.clientWidth
    }
  })

  const groups = groupByProject(items)
  // One project → focus panes are pointless; just show the flat list.
  if (groups.length < 2) return <Cards todos={items} />

  const options = groups.map((g) => ({ value: g.key, label: `${g.name} (${g.todos.length})` }))
  const setPick = (i: number, v: string) => setPicks((p) => p.map((x, k) => (k === i ? v : x)))
  const paneTodos = (i: number) => groups.find((g) => g.key === picks[i])?.todos

  const onScroll = () => {
    const el = trackRef.current
    if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth))
  }

  return (
    <div className="relative mt-3">
      {/* Active-pane control: "All" is just a label; focus panes get a picker. */}
      <div className="mb-3 min-h-[2.75rem]">
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

      {/* Swipe track — lists only (no clipped dropdowns here). */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        // ponytail: track height = tallest pane, so an empty focus pane leaves
        // whitespace below. Fine; revisit if users complain.
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="w-full shrink-0 snap-center">
          <Cards todos={items} />
        </div>
        {FOCUS_PANES.map((i) => {
          const todos = paneTodos(i)
          return (
            <div key={i} className="w-full shrink-0 snap-center">
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
  )
}
