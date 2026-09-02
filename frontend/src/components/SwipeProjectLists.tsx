import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Minus, Plus, Search } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { TodoCard } from '@/components/TodoCard'
import { useFocusedTaskIds } from '@/hooks/useFocusTimer'
import type { ProjectItem } from '@/lib/types'
import { groupByDetail, detailPickerOptions, availableDetailOptions, filterByTags, cycleTag, filterByDay, cycleDay, DAY_FILTER_LABEL, matchProjectItem, TODO_TAGS, MIN_COLS, MAX_COLS, type TodoTag, type TagFilterState, type DayBucket } from '@/lib/filters'
import { todayISO } from '@/lib/format'

// A per-pane text search box (todo text + project/brand/people, via matchProjectItem).
function ColSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Cari tugas…"
        className="w-full rounded-xl border border-paper-edge bg-white py-1.5 pl-9 pr-3 text-sm text-stone-700 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
    </div>
  )
}

// One pane's own search + tag filter over its todos, then the cards. Each pane
// keeps its own filter state (mounted across swipes), so filtering/searching one
// project never touches another. `withSearch` off for the "All" pane, which
// leans on the page-wide search in the header instead.
function Pane({ todos, focusedIds, withSearch = false }: { todos: ProjectItem[]; focusedIds: Set<string>; withSearch?: boolean }) {
  const [tags, setTags] = useState<TagFilterState>(new Map())
  const [day, setDay] = useState<DayBucket | undefined>()
  const [q, setQ] = useState('')
  const toggleTag = (t: TodoTag) => setTags((s) => cycleTag(s, t))
  const shown = filterByDay(filterByTags(todos, tags, focusedIds), day, todayISO()).filter((t) =>
    withSearch ? matchProjectItem(t, q) : true,
  )
  return (
    <div className="flex flex-col gap-3">
      {withSearch && <ColSearch value={q} onChange={setQ} />}
      <TagFilter selected={tags} toggle={toggleTag} day={day} onDay={() => setDay(cycleDay(day))} />
      {shown.length ? (
        shown.map((t) => <TodoCard key={t.name} todo={t} />)
      ) : (
        <div className="rounded-2xl border border-dashed border-paper-edge p-8 text-center text-sm text-stone-400 dark:border-slate-700 dark:text-slate-500">
          {q || tags.size || day ? 'Tidak ada yang cocok.' : 'Belum ada tugas di sini.'}
        </div>
      )}
    </div>
  )
}

// Todo tag filter chips (untagged/focus/ai/to-check). Each chip is tri-state,
// cycling all → on (require) → off (exclude) → all. Empty = show everything.
function TagFilter({
  selected,
  toggle,
  day,
  onDay,
}: {
  selected: TagFilterState
  toggle: (t: TodoTag) => void
  day: DayBucket | undefined
  onDay: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TODO_TAGS.map(({ value, label }) => {
        const state = selected.get(value)
        return (
          <button
            key={value}
            type="button"
            aria-label={`${label}: ${state === 'on' ? 'only' : state === 'off' ? 'hidden' : 'all'}`}
            title={state === 'on' ? `Only ${label}` : state === 'off' ? `Hide ${label}` : `Filter by ${label}`}
            onClick={() => toggle(value)}
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95',
              state === 'on' && 'bg-brand-600 text-white shadow-sm',
              state === 'off' && 'bg-rose-500 text-white line-through shadow-sm',
              !state && 'border border-paper-edge text-stone-500 dark:border-slate-700 dark:text-slate-400',
            )}
          >
            {state === 'off' ? '−' : state === 'on' ? '✓' : ''} {label}
          </button>
        )
      })}
      {/* Day-plan filter: single chip cycling All → Today → Not today → Unplanned. */}
      <button
        type="button"
        aria-label={`Day plan: ${day ? DAY_FILTER_LABEL[day] : 'all'}`}
        title={day ? DAY_FILTER_LABEL[day] : 'Filter by day plan'}
        onClick={onDay}
        className={clsx(
          'rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95',
          day && 'bg-brand-600 text-white shadow-sm',
          !day && 'border border-paper-edge text-stone-500 dark:border-slate-700 dark:text-slate-400',
        )}
      >
        {day ? `✓ ${DAY_FILTER_LABEL[day]}` : 'Today'}
      </button>
    </div>
  )
}

const clampCols = (n: number) => Math.max(MIN_COLS, Math.min(MAX_COLS, n | 0))

// Active pane + count + picks, mirrored to localStorage so they survive both a
// route change and a full reload — the pick is the user's place in their work,
// losing it on every refresh is the whole complaint. Same idea as web Home's
// usePersistentState, JSON'd because this is a pane index, a pane count, and the
// per-pane picks. `count` = TOTAL panes incl. the "All" pane, user-adjustable
// [MIN_COLS, MAX_COLS]; there are count-1 focus panes.
// ponytail: one row for the whole carousel; single Home instance, so a module
// slot mirroring storage is enough — lift to a store if this ever mounts twice.
const KEY = 'home.swipeProjects'
type Persisted = { idx: number; count: number; picks: string[] }
const blank = (): Persisted => ({ idx: 0, count: MIN_COLS, picks: Array(MIN_COLS - 1).fill('') })

function load(): Persisted {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '')
    if (v && typeof v.idx === 'number') {
      const count = clampCols(v.count ?? MIN_COLS)
      // Rebuild the tuple positionally — a short/garbled array must not shrink it.
      return { idx: Math.min(Math.max(0, v.idx), count - 1), count, picks: Array.from({ length: count - 1 }, (_, i) => String(v.picks?.[i] ?? '')) }
    }
  } catch {
    /* absent, corrupt, or private mode — fall back to a clean slate */
  }
  return blank()
}

const persist = load()

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
export function SwipeProjectLists({
  items,
  search,
  emptyState,
}: {
  items: ProjectItem[]
  // Rendered in the sticky header ABOVE the project picker; kept mounted across
  // empty/non-empty so the search input never loses focus mid-type.
  search?: ReactNode
  // Shown in place of the list when `items` is empty (search-no-match / caught-up).
  emptyState?: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(persist.idx)
  const [count, setCount] = useState(persist.count) // total panes incl. "All"
  const [picks, setPicks] = useState(persist.picks) // focus panes (count-1 of them)
  const focusedIds = useFocusedTaskIds()
  const PANES = count
  const FOCUS_PANES = Array.from({ length: count - 1 }, (_, i) => i)

  // Live horizontal drag: axis lock (undecided until the gesture commits to one
  // axis) + finger-follow offset in px. Refs, not state, for the per-move path.
  const startX = useRef(0)
  const startY = useRef(0)
  const axis = useRef<'h' | 'v' | null>(null)
  const [dragging, setDragging] = useState(false)
  const [drag, setDrag] = useState(0)

  // Track height follows the ACTIVE pane, not the tallest one. Without this the
  // flex row stretches every pane to the tallest project's height and the page
  // scrolls that far, so swiping to a shorter pane strands you in blank space.
  // Measured (not CSS) because pane heights are content-driven and load async;
  // a ResizeObserver keeps it in sync as todos arrive or a card expands.
  const paneRefs = useRef<(HTMLDivElement | null)[]>([])
  const [paneH, setPaneH] = useState<number>()
  useLayoutEffect(() => {
    const el = paneRefs.current[idx]
    if (!el) return
    const measure = () => setPaneH(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [idx, items, picks])

  // Shrinking the count can strand the active pane past the last one — clamp it.
  useEffect(() => {
    if (idx > count - 1) setIdx(count - 1)
  }, [count, idx])

  // Mirror state out so a remount (route change) or a reload restores it.
  useEffect(() => {
    persist.idx = idx
    persist.count = count
    persist.picks = picks
    try {
      localStorage.setItem(KEY, JSON.stringify({ idx, count, picks }))
    } catch {
      /* private mode / quota — non-fatal, just don't persist */
    }
  }, [idx, count, picks])

  // Grow/shrink the pane count within bounds, keeping picks sized to count-1.
  const setPaneCount = (n: number) => {
    const c = clampCols(n)
    setCount(c)
    setPicks((p) => Array.from({ length: c - 1 }, (_, i) => p[i] ?? ''))
  }

  const groups = groupByDetail(items)
  // ≥2 details → the swipe carousel earns its keep; otherwise a flat list. Either
  // way the sticky search header still renders (below).
  const multi = groups.length >= 2

  const options = detailPickerOptions(groups)
  // Hide details picked in other panes so one detail can't fill two panes.
  const optsFor = (self: number) =>
    availableDetailOptions(options, new Set(picks.filter((p, k) => p && k !== self)), picks[self] || '')
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
      {/* Sticky header — search on top, then the active-pane control. Both pin
          below the page header so search + focus stay on screen while todos
          scroll. --tab-hdr is TabScreen's measured header height; the fallback
          only matters for the first paint. */}
      <div className="sticky top-[var(--tab-hdr,5.75rem)] z-10 -mx-4 mb-3 space-y-2 bg-paper/95 px-4 py-1.5 backdrop-blur-sm dark:bg-slate-900">
        {search}
        {multi &&
          (idx === 0 ? (
            <div className="flex items-center gap-2 px-1 py-2 text-sm font-semibold text-stone-500 dark:text-slate-400">
              All todos · {items.length}
            </div>
          ) : (
            <SearchableSelect
              value={picks[idx - 1]}
              onChange={(v) => setPick(idx - 1, v)}
              options={optsFor(idx - 1)}
              allowClear
              placeholder="Pick a project"
            />
          ))}
      </div>

      {!multi ? (
        // 0-1 project detail → no carousel; single pane (own search + tags) or empty.
        items.length ? <Pane todos={items} focusedIds={focusedIds} withSearch /> : emptyState
      ) : (
        <>
          {/* Dots + pane counter + count stepper */}
          <div className="mb-3 flex items-center justify-center gap-3">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: PANES }, (_, k) => k).map((k) => (
                <span
                  key={k}
                  className={clsx('h-1.5 rounded-full transition-all', k === idx ? 'w-4 bg-brand-600' : 'w-1.5 bg-paper-line dark:bg-slate-700')}
                />
              ))}
            </div>
            <span className="text-xs font-semibold tabular-nums text-stone-400 dark:text-slate-500">
              {idx + 1}/{PANES}
            </span>
            <div className="flex items-center gap-1 rounded-full border border-paper-edge px-1 py-0.5 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setPaneCount(count - 1)}
                disabled={count <= MIN_COLS}
                aria-label="Fewer panes"
                className="grid h-5 w-5 place-items-center rounded-full text-stone-500 disabled:opacity-30 dark:text-slate-400"
              >
                <Minus size={13} />
              </button>
              <button
                type="button"
                onClick={() => setPaneCount(count + 1)}
                disabled={count >= MAX_COLS}
                aria-label="More panes"
                className="grid h-5 w-5 place-items-center rounded-full text-stone-500 disabled:opacity-30 dark:text-slate-400"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          {/* Swipe track — JS transform, not native scroll. touchAction:'pan-y' hands
              vertical gestures to the page (so list scroll & pull-to-refresh still
              work) and leaves horizontal to our threshold'd handler. */}
          <div
            ref={wrapRef}
            className="overflow-hidden transition-[height] duration-300 ease-out"
            style={{ touchAction: 'pan-y', height: paneH }}
          >
            <div
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              // items-start so each pane keeps its own content height (no stretch to
              // the tallest); the viewport clips to the active pane's measured height.
              className={clsx('flex items-start', !dragging && 'transition-transform duration-300 ease-out')}
              style={{ transform: `translateX(calc(${-idx * 100}% + ${drag}px))` }}
            >
              <div ref={(el) => (paneRefs.current[0] = el)} className="w-full shrink-0">
                {/* "All" pane — its own tag chips; page-wide search sits in the header. */}
                <Pane todos={items} focusedIds={focusedIds} />
              </div>
              {FOCUS_PANES.map((i) => {
                const todos = paneTodos(i)
                return (
                  <div key={i} ref={(el) => (paneRefs.current[i + 1] = el)} className="w-full shrink-0">
                    {todos ? (
                      <Pane todos={todos} focusedIds={focusedIds} withSearch />
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
        </>
      )}
    </div>
  )
}
