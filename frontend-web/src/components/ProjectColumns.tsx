import { useEffect, useState, type ReactNode } from 'react'
import { Minus, Plus, Search } from 'lucide-react'
import { SearchableSelect, type SelectOption } from '@/components/SearchableSelect'
import { useFocusedTaskIds } from '@/hooks/useFocusTimer'
import type { ProjectItem } from '@/lib/types'
import {
  groupByDetail, detailPickerOptions, availableDetailOptions, filterByTags, cycleTag, filterByDay, cycleDay, DAY_FILTER_LABEL, matchProjectItem, TODO_TAGS,
  MIN_COLS, MAX_COLS, type DetailGroup, type TodoTag, type TagFilterState, type DayBucket,
} from '@/lib/filters'
import { todayISO } from '@/lib/format'

// One scroll only: columns grow to their content and the WINDOW scrolls. The
// per-column viewport-tall scroll region was removed — nesting a scroll inside
// the page trapped the wheel (overscroll-contain) and left a column's last card
// below the fold, unreachable without a page scroll the wheel wouldn't perform.
const COL = 'flex min-w-0 flex-col gap-3'
const LIST = 'flex flex-col gap-2.5'

const clampCols = (n: number) => Math.max(MIN_COLS, Math.min(MAX_COLS, n | 0))

// Column count + per-column project picks, mirrored to localStorage so the
// chosen width and picks survive a reload — same idea as usePersistentState,
// JSON'd because it's a count plus an array of picks. `count` is TOTAL columns
// incl. the leading "all" column; picks[0] narrows that column, picks[1..] each
// focus one project.
type Persisted = { count: number; picks: string[] }
function usePersistedCols(key: string) {
  const [state, setState] = useState<Persisted>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || '')
      if (v && typeof v.count === 'number') {
        return { count: clampCols(v.count), picks: Array.isArray(v.picks) ? v.picks.map((x: unknown) => String(x ?? '')) : [] }
      }
    } catch {
      /* absent / corrupt / private mode — clean slate */
    }
    return { count: MIN_COLS, picks: [] }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      /* private mode / quota — non-fatal */
    }
  }, [key, state])
  const setCount = (n: number) => setState((s) => ({ ...s, count: clampCols(n) }))
  const setPick = (i: number, v: string) =>
    setState((s) => {
      const picks = s.picks.slice()
      picks[i] = v
      return { ...s, picks }
    })
  return { count: clampCols(state.count), picks: state.picks, setCount, setPick }
}

// A per-column text search box (todo text + project/brand/people, via matchProjectItem).
function ColSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search…"
        className="w-full rounded-full border border-line bg-transparent py-1 pl-8 pr-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
      />
    </div>
  )
}

// One by-project column: a project picker + this column's OWN search + tag filter
// over that project's todos, rendered via `renderCard`. No matching group →
// placeholder, unless `fallbackTodos` is given (col 1) in which case it shows the
// full list — covers both an empty pick and a stale persisted pick whose project
// has left the list. Each column keeps its own filter state, independent of the rest.
function ProjectPickCol({
  pick, setPick, options, group, renderCard, fallbackTodos, focusedIds,
}: {
  pick: string
  setPick: (v: string) => void
  options: SelectOption[]
  group?: DetailGroup
  renderCard: (t: ProjectItem, i: number) => ReactNode
  fallbackTodos?: ProjectItem[]
  focusedIds: Set<string>
}) {
  const [tags, setTags] = useState<TagFilterState>(new Map())
  const [day, setDay] = useState<DayBucket | undefined>()
  const [q, setQ] = useState('')
  const toggleTag = (t: TodoTag) => setTags((s) => cycleTag(s, t))
  const base = group ? group.todos : fallbackTodos
  const todos =
    base && filterByDay(filterByTags(base, tags, focusedIds), day, todayISO()).filter((t) => matchProjectItem(t, q))
  return (
    <div className={COL}>
      <SearchableSelect value={pick} onChange={setPick} options={options} allowClear placeholder={fallbackTodos ? 'All projects' : 'Pick a project'} />
      {base && (
        <div className="flex flex-col gap-2">
          <ColSearch value={q} onChange={setQ} />
          <TagFilter selected={tags} toggle={toggleTag} day={day} onDay={() => setDay(cycleDay(day))} />
        </div>
      )}
      {todos ? (
        todos.length ? (
          <div className={LIST}>{todos.map(renderCard)}</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">No matches</div>
        )
      ) : (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          Pick a project to see its todos
        </div>
      )}
    </div>
  )
}

// Tri-state chip row for the todo tag filter (untagged/focus/ai/to-check). Each
// chip cycles all → on (require) → off (exclude) → all. Empty = show everything.
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
            className={
              'rounded-full border px-3 py-1 text-xs font-semibold transition ' +
              (state === 'on'
                ? 'border-ink bg-ink text-canvas'
                : state === 'off'
                  ? 'border-rose-600 bg-rose-600 text-white line-through'
                  : 'border-line text-muted hover:bg-line')
            }
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
        className={
          'rounded-full border px-3 py-1 text-xs font-semibold transition ' +
          (day ? 'border-ink bg-ink text-canvas' : 'border-line text-muted hover:bg-line')
        }
      >
        {day ? `✓ ${DAY_FILTER_LABEL[day]}` : 'Today'}
      </button>
    </div>
  )
}

// A −/N/+ stepper for the column count, bounded [MIN_COLS, MAX_COLS].
function ColStepper({ count, setCount }: { count: number; setCount: (n: number) => void }) {
  const Btn = ({ dir, disabled, label }: { dir: -1 | 1; disabled: boolean; label: string }) => (
    <button
      type="button"
      onClick={() => setCount(count + dir)}
      disabled={disabled}
      aria-label={label}
      className="grid h-6 w-6 place-items-center rounded-full text-ink hover:bg-line disabled:opacity-30"
    >
      {dir < 0 ? <Minus size={14} /> : <Plus size={14} />}
    </button>
  )
  return (
    <div className="flex items-center gap-2 self-end text-sm text-muted">
      <span>Columns</span>
      <div className="flex items-center gap-1 rounded-full border border-line p-0.5">
        <Btn dir={-1} disabled={count <= MIN_COLS} label="Fewer columns" />
        <span className="w-4 text-center font-semibold tabular-nums text-ink">{count}</span>
        <Btn dir={1} disabled={count >= MAX_COLS} label="More columns" />
      </div>
    </div>
  )
}

// By-project layout: column 1 = the flat list (all items, narrowable via its
// picker), each remaining column = a separate project you focus. Column count is
// user-adjustable [MIN_COLS, MAX_COLS] and persisted per `storageKey`. Wide grids
// auto-flow into fixed-min columns that scroll horizontally when they overflow;
// stacks to one column below md. `renderCard` controls how a single todo renders.
export function ThreeColProjectList({
  items, renderCard, storageKey,
}: {
  items: ProjectItem[]
  renderCard: (t: ProjectItem, i: number) => ReactNode
  storageKey: string
}) {
  const { count, picks, setCount, setPick } = usePersistedCols(`${storageKey}.projCols`)
  const focusedIds = useFocusedTaskIds()
  const groups = groupByDetail(items)
  const options = detailPickerOptions(groups)
  const colFor = (pick: string) => groups.find((g) => g.key === pick)
  // Details picked in any OTHER column, so each picker hides them → no duplicate columns.
  const optsFor = (self: number) =>
    availableDetailOptions(options, new Set(picks.filter((p, i) => p && i !== self)), picks[self] || '')
  return (
    <div className="flex flex-col gap-3">
      <ColStepper count={count} setCount={setCount} />
      <div className="grid grid-cols-1 gap-4 overflow-x-auto md:grid-cols-none md:auto-cols-[minmax(220px,1fr)] md:grid-flow-col">
        {/* Column 1 — full list by default; picker narrows it to one project */}
        <ProjectPickCol pick={picks[0] || ''} setPick={(v) => setPick(0, v)} options={optsFor(0)} group={colFor(picks[0] || '')} renderCard={renderCard} fallbackTodos={items} focusedIds={focusedIds} />
        {/* Remaining columns — each a separate project you pick */}
        {Array.from({ length: count - 1 }, (_, k) => k + 1).map((i) => (
          <ProjectPickCol key={i} pick={picks[i] || ''} setPick={(v) => setPick(i, v)} options={optsFor(i)} group={colFor(picks[i] || '')} renderCard={renderCard} focusedIds={focusedIds} />
        ))}
      </div>
    </div>
  )
}
