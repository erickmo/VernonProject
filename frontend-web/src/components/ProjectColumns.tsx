import { useEffect, useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { SearchableSelect, type SelectOption } from '@/components/SearchableSelect'
import type { ProjectItem } from '@/lib/types'
import { groupByDetail, detailPickerOptions, MIN_COLS, MAX_COLS, type DetailGroup } from '@/lib/filters'

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

// One by-project column: a project picker + that project's todos rendered via
// `renderCard`. No matching group → placeholder, unless `fallbackTodos` is given
// (col 1) in which case it shows the full list (any) — covers both an empty pick
// and a stale persisted pick whose project has left the list; the picker narrows.
function ProjectPickCol({
  pick, setPick, options, group, renderCard, fallbackTodos,
}: {
  pick: string
  setPick: (v: string) => void
  options: SelectOption[]
  group?: DetailGroup
  renderCard: (t: ProjectItem, i: number) => ReactNode
  fallbackTodos?: ProjectItem[]
}) {
  const todos = group ? group.todos : fallbackTodos
  return (
    <div className={COL}>
      <SearchableSelect value={pick} onChange={setPick} options={options} allowClear placeholder={fallbackTodos ? 'All projects' : 'Pick a project'} />
      {todos ? (
        <div className={LIST}>{todos.map(renderCard)}</div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          Pick a project to see its todos
        </div>
      )}
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
  const groups = groupByDetail(items)
  const options = detailPickerOptions(groups)
  const colFor = (pick: string) => groups.find((g) => g.key === pick)
  return (
    <div className="flex flex-col gap-3">
      <ColStepper count={count} setCount={setCount} />
      <div className="grid grid-cols-1 gap-4 overflow-x-auto md:grid-cols-none md:auto-cols-[minmax(220px,1fr)] md:grid-flow-col">
        {/* Column 1 — full list by default; picker narrows it to one project */}
        <ProjectPickCol pick={picks[0] || ''} setPick={(v) => setPick(0, v)} options={options} group={colFor(picks[0] || '')} renderCard={renderCard} fallbackTodos={items} />
        {/* Remaining columns — each a separate project you pick */}
        {Array.from({ length: count - 1 }, (_, k) => k + 1).map((i) => (
          <ProjectPickCol key={i} pick={picks[i] || ''} setPick={(v) => setPick(i, v)} options={options} group={colFor(picks[i] || '')} renderCard={renderCard} />
        ))}
      </div>
    </div>
  )
}
