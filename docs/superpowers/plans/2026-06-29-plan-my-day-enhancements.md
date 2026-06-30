# Plan-my-day enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add estimate/manual minute editing + search + planned-on-top sort to the plan-my-day drawer, a one-tap "add to today" toggle on todo cards, and a homepage "Today's plan" list — across both mobile and web apps.

**Architecture:** All planning state and the subtle save semantics live in one shared React hook `usePlanDay`, backed by four pure, unit-tested helpers in `lib/planDay.ts`. The plan-row UI (steppers / manual input / use-estimate / chips) is one shared `PlanRow` component consumed by the mobile bottom-sheet and a new web side-drawer. Everything keys off the existing model — "today's plan" = `Project Todo Allocation` rows dated today (`today_allocation`), written via the existing assignee-only `set_todo_allocations`. No backend changes.

**Tech Stack:** React 18 + TypeScript, Vite, @tanstack/react-query, Tailwind, lucide-react. Mobile app = `frontend/`; web app = `frontend-web/` (re-uses `frontend/src` via the `@` alias; web-only UI under `@web`).

## Global Constraints

- Repo: `/home/frappe/frappe-bench/apps/vernon_project`, branch `feat/plan-my-day-enhancements`. (The shell CWD `/home/frappe/ui` is an unrelated app — always `cd` into the vernon_project repo.)
- **Frontend-only. No backend, doctype, or API changes.**
- Minutes are integers `≥ 0`. Free-form (the personal plan is not sum-to-estimate enforced).
- "Use estimate" / "+ Today" minutes = `todo.estimated` when `> 0`, else fallback `30`.
- Writes go through `mobileApi.setTodoAllocations(name, allocations)` (or the `useSetTodoAllocations(name)` hook), passing the full allocation array with **only today's row replaced** — every other-day row preserved.
- Shared components/hooks/libs live under `frontend/src` (so both apps get them); web-only shells under `frontend-web/src`.
- Typecheck command (run in the relevant app dir): `npx tsc -b --noEmit` → exit 0, no output.
- No JS test runner exists in this repo and we are **not** adding one. Pure logic is checked with an `assert`-based self-check transpiled by the already-installed esbuild.

---

### Task 1: Pure planning helpers + sort + self-check

**Files:**
- Create: `frontend/src/lib/planDay.ts`
- Modify: `frontend/src/lib/format.ts` (append `byAllocationAsc`)
- Test: `frontend/src/lib/planDay.selfcheck.ts`

**Interfaces:**
- Consumes: `ProjectItem` (type) from `@/lib/types`; `byEstimatedAsc` from `@/lib/format`.
- Produces:
  - `filterCandidates(candidates: ProjectItem[], query: string): ProjectItem[]`
  - `sortForPlanning(candidates: ProjectItem[], mins: Record<string, number>): ProjectItem[]`
  - `touchedDiff(candidates: ProjectItem[], mins: Record<string, number>): ProjectItem[]`
  - `buildNext(allocations: Alloc[], today: string, minutes: number): Alloc[]` where `Alloc = { date: string; minutes: number; note?: string }`
  - `byAllocationAsc(a, b): number` in `format.ts` (fewest today-minutes first; estimate tiebreak)

- [ ] **Step 1: Create the pure helpers**

Create `frontend/src/lib/planDay.ts`:

```ts
import type { ProjectItem } from './types'

export type Alloc = { date: string; minutes: number; note?: string }

// Case-insensitive substring match on todo title + project name. Empty query → all.
export function filterCandidates(candidates: ProjectItem[], query: string): ProjectItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return candidates
  return candidates.filter(
    (t) => t.to_do.toLowerCase().includes(q) || (t.project_name || '').toLowerCase().includes(q),
  )
}

// Todos with planned minutes (mins > 0) float to the top, most-minutes first;
// the rest keep their original order. Stable for ties and for unplanned items.
export function sortForPlanning(candidates: ProjectItem[], mins: Record<string, number>): ProjectItem[] {
  return candidates
    .map((t, i) => ({ t, i, m: mins[t.name] || 0 }))
    .sort((a, b) => {
      const ap = a.m > 0 ? 1 : 0
      const bp = b.m > 0 ? 1 : 0
      if (ap !== bp) return bp - ap // planned before unplanned
      if (ap && a.m !== b.m) return b.m - a.m // among planned: most minutes first
      return a.i - b.i // otherwise preserve input order (stable)
    })
    .map((x) => x.t)
}

// Candidates whose today-minutes differ from what's already saved.
export function touchedDiff(candidates: ProjectItem[], mins: Record<string, number>): ProjectItem[] {
  return candidates.filter((t) => (mins[t.name] || 0) !== (t.today_allocation || 0))
}

// Replace ONLY today's allocation row; preserve every other-day row. 0 min → drop today's row.
export function buildNext(allocations: Alloc[], today: string, minutes: number): Alloc[] {
  return [
    ...allocations.filter((a) => a.date !== today),
    ...(minutes > 0 ? [{ date: today, minutes }] : []),
  ]
}
```

- [ ] **Step 2: Append the homepage sort helper to `format.ts`**

Add to the end of `frontend/src/lib/format.ts` (after `byDeadlineDesc`):

```ts
/** Sort by today's allocated minutes ascending (fewest first); estimate as tiebreak. */
export function byAllocationAsc(
  a: { today_allocation: number; estimated: number; deadline: string | null },
  b: { today_allocation: number; estimated: number; deadline: string | null },
): number {
  const d = (a.today_allocation || 0) - (b.today_allocation || 0)
  return d !== 0 ? d : byEstimatedAsc(a, b)
}
```

- [ ] **Step 3: Write the failing self-check**

Create `frontend/src/lib/planDay.selfcheck.ts`:

```ts
import assert from 'node:assert'
import type { ProjectItem } from './types'
import { filterCandidates, sortForPlanning, touchedDiff, buildNext } from './planDay'
import { byAllocationAsc } from './format'

// Minimal ProjectItem factory — only the fields these pure fns read.
function item(over: Partial<ProjectItem>): ProjectItem {
  const base = { name: 'x', to_do: '', project_name: '', today_allocation: 0, estimated: 0, deadline: null, allocations: [] }
  return { ...base, ...over } as unknown as ProjectItem
}

// filterCandidates
const cands = [
  item({ name: 'a', to_do: 'Write report', project_name: 'Acme' }),
  item({ name: 'b', to_do: 'Fix bug', project_name: 'Beta' }),
]
assert.deepEqual(filterCandidates(cands, '').map((t) => t.name), ['a', 'b'], 'empty query → all')
assert.deepEqual(filterCandidates(cands, 'report').map((t) => t.name), ['a'], 'title match')
assert.deepEqual(filterCandidates(cands, 'beta').map((t) => t.name), ['b'], 'project match (case-insensitive)')

// sortForPlanning: planned first (most minutes), unplanned keep input order
const list = [
  item({ name: 'a' }), item({ name: 'b' }), item({ name: 'c' }), item({ name: 'd' }),
]
const mins = { b: 30, d: 60 }
assert.deepEqual(
  sortForPlanning(list, mins).map((t) => t.name),
  ['d', 'b', 'a', 'c'],
  'planned (d=60, b=30) on top; unplanned a,c stable',
)

// touchedDiff: only rows whose today-minutes changed vs today_allocation
const saved = [item({ name: 'a', today_allocation: 0 }), item({ name: 'b', today_allocation: 30 })]
assert.deepEqual(
  touchedDiff(saved, { a: 15, b: 30 }).map((t) => t.name),
  ['a'],
  'a changed 0→15; b unchanged 30',
)

// buildNext: replace today's row, preserve others; 0 drops today's row
const allocs = [{ date: '2026-06-28', minutes: 60 }, { date: '2026-06-29', minutes: 30 }]
assert.deepEqual(
  buildNext(allocs, '2026-06-29', 45),
  [{ date: '2026-06-28', minutes: 60 }, { date: '2026-06-29', minutes: 45 }],
  'today row replaced, other-day kept',
)
assert.deepEqual(
  buildNext(allocs, '2026-06-29', 0),
  [{ date: '2026-06-28', minutes: 60 }],
  '0 minutes drops today row',
)

// byAllocationAsc: fewest today-minutes first
const sorted = [
  item({ name: 'big', today_allocation: 90, estimated: 0 }),
  item({ name: 'small', today_allocation: 15, estimated: 0 }),
].sort(byAllocationAsc)
assert.deepEqual(sorted.map((t) => t.name), ['small', 'big'], 'fewest minutes first')

console.log('planDay self-check OK')
```

- [ ] **Step 4: Run the self-check — verify it passes**

Run (from the repo, in `frontend/`):
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend
./node_modules/.bin/esbuild src/lib/planDay.selfcheck.ts --bundle --platform=node --format=esm | node --input-type=module
```
Expected: `planDay self-check OK` (exit 0). If an assert fails, node prints the message (e.g. `planned (d=60, b=30) on top`) and exits non-zero — fix the helper, rerun.

- [ ] **Step 5: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc -b --noEmit`
Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/planDay.ts frontend/src/lib/planDay.selfcheck.ts frontend/src/lib/format.ts
git commit -m "feat(plan): pure planning helpers + byAllocationAsc sort"
```

---

### Task 2: `usePlanDay` hook

**Files:**
- Create: `frontend/src/hooks/usePlanDay.ts`

**Interfaces:**
- Consumes: `filterCandidates`, `sortForPlanning`, `touchedDiff`, `buildNext` from `@/lib/planDay`; `mobileApi` from `@/lib/api`; `keys` from `@/hooks/useData`; `useToast` from `@/components/Toast`; `todayISO` from `@/lib/format`; `ProjectItem` type.
- Produces: `usePlanDay(candidates: ProjectItem[]) => { mins: Record<string,number>; setMin(id,v): void; useEstimate(t): void; query: string; setQuery(q): void; visible: ProjectItem[]; total: number; saving: boolean; save(): Promise<void> }`. `save()` resolves on success (or no-op when nothing changed) and **rejects** on error (after toasting) so callers can keep the drawer open.

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/usePlanDay.ts`:

```ts
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mobileApi } from '@/lib/api'
import { keys } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { todayISO } from '@/lib/format'
import { filterCandidates, sortForPlanning, touchedDiff, buildNext } from '@/lib/planDay'
import type { ProjectItem } from '@/lib/types'

// Shared plan-my-day state + save semantics for both the mobile sheet and the
// web drawer. Writes only today's allocation row per touched todo, preserving
// other-day rows (planning only — never touches status/scoring).
export function usePlanDay(candidates: ProjectItem[]) {
  const qc = useQueryClient()
  const toast = useToast()
  const today = todayISO()

  const [mins, setMins] = useState<Record<string, number>>(() =>
    Object.fromEntries(candidates.map((t) => [t.name, t.today_allocation || 0])),
  )
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)

  const setMin = (id: string, v: number) => setMins((m) => ({ ...m, [id]: Math.max(0, Math.round(v)) }))
  const useEstimate = (t: ProjectItem) => setMin(t.name, t.estimated > 0 ? t.estimated : 30)

  const visible = useMemo(
    () => sortForPlanning(filterCandidates(candidates, query), mins),
    [candidates, query, mins],
  )
  const total = Object.values(mins).reduce((s, v) => s + v, 0)

  const save = async () => {
    const touched = touchedDiff(candidates, mins)
    if (!touched.length) return
    setSaving(true)
    try {
      await Promise.all(
        touched.map((t) => mobileApi.setTodoAllocations(t.name, buildNext(t.allocations ?? [], today, mins[t.name] || 0))),
      )
      qc.invalidateQueries({ queryKey: keys.dashboard })
      for (const t of touched) qc.invalidateQueries({ queryKey: keys.projectItem(t.name) })
      toast('success', 'Day planned')
    } catch (e) {
      toast('error', (e as Error).message || 'Could not save plan')
      throw e
    } finally {
      setSaving(false)
    }
  }

  return { mins, setMin, useEstimate, query, setQuery, visible, total, saving, save }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc -b --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/hooks/usePlanDay.ts
git commit -m "feat(plan): usePlanDay shared hook (mins, search, save)"
```

---

### Task 3: Shared `PlanRow` (steppers + manual input + use-estimate + chips)

**Files:**
- Create: `frontend/src/components/PlanRow.tsx`

**Interfaces:**
- Consumes: `formatEstimate` from `@/lib/format`; `ProjectItem` type.
- Produces: `PlanRow({ todo, minutes, onSet, onUseEstimate }: { todo: ProjectItem; minutes: number; onSet(id: string, v: number): void; onUseEstimate(t: ProjectItem): void })` — one `<li>` with a −15 button, an editable numeric minutes `<input>`, a +15 button, a "Use est." button (only when `estimated > 0`), and 15/30/60 chips.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/PlanRow.tsx`:

```tsx
import { Minus, Plus, Wand2 } from 'lucide-react'
import { formatEstimate } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

const CHIPS = [15, 30, 60]

// One candidate row in the plan-my-day drawer. Shared by the mobile sheet and
// the web drawer — all minute edits route through onSet (clamped upstream).
export function PlanRow({
  todo,
  minutes,
  onSet,
  onUseEstimate,
}: {
  todo: ProjectItem
  minutes: number
  onSet: (id: string, v: number) => void
  onUseEstimate: (t: ProjectItem) => void
}) {
  return (
    <li className="rounded-2xl border border-paper-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold text-stone-800 dark:text-slate-100">{todo.to_do}</p>
          <p className="mt-0.5 truncate text-[11px] text-stone-400 dark:text-slate-500">
            {todo.project_name}
            {todo.estimated > 0 ? ` · est ${formatEstimate(todo.estimated)}` : ''}
          </p>
        </div>
        {todo.estimated > 0 && (
          <button
            onClick={() => onUseEstimate(todo)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition active:scale-95 dark:bg-brand-500/15 dark:text-brand-300"
          >
            <Wand2 className="h-3.5 w-3.5" /> Use est.
          </button>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={() => onSet(todo.name, minutes - 15)}
          aria-label="15 minutes less"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={minutes || 0}
          onChange={(e) => onSet(todo.name, Number(e.target.value) || 0)}
          aria-label="Planned minutes"
          className="w-16 shrink-0 rounded-lg border border-paper-edge bg-paper-card px-1 py-1 text-center text-sm font-bold tabular-nums text-stone-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          onClick={() => onSet(todo.name, minutes + 15)}
          aria-label="15 minutes more"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          {CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => onSet(todo.name, c)}
              className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition active:scale-95 dark:bg-brand-500/15 dark:text-brand-300"
            >
              {c}m
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/PlanRow.tsx
git commit -m "feat(plan): shared PlanRow (manual edit + use-estimate)"
```

---

### Task 4: Refactor mobile `PlanDaySheet` to hook + PlanRow + search

**Files:**
- Modify: `frontend/src/components/PlanDaySheet.tsx`

**Interfaces:**
- Consumes: `usePlanDay` (Task 2), `PlanRow` (Task 3).
- Produces: unchanged public props `PlanDaySheet({ todos, onClose })`.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `frontend/src/components/PlanDaySheet.tsx` with:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 3: Run the mobile app and verify the drawer**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run dev`
Open the app → Home → "Plan my day". Verify: search filters the list; typing a number in a row's input updates minutes; "Use est." fills the estimate; rows with minutes sort to the top; Save persists and the "today" pills update on Home.

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/PlanDaySheet.tsx
git commit -m "feat(plan): mobile sheet — search, manual/estimate edit, planned-on-top"
```

---

### Task 5: Web `PlanDayDrawer`

**Files:**
- Create: `frontend-web/src/components/PlanDayDrawer.tsx`

**Interfaces:**
- Consumes: `Drawer` from `@web/components/overlays/Drawer`; `usePlanDay` (Task 2); `PlanRow` (Task 3); `EmptyState`, `Spinner` from `@/components/ui`; `formatEstimate` from `@/lib/format`; `ProjectItem` type.
- Produces: `PlanDayDrawer({ open, onClose, candidates }: { open: boolean; onClose(): void; candidates: ProjectItem[] })`.

Note: the `Drawer` primitive (`frontend-web/src/components/overlays/Drawer.tsx`) signature is `Drawer({ open, onClose, title, children, footer, widthClass?, onSubmit?, scrim? })`.

- [ ] **Step 1: Create the drawer**

Create `frontend-web/src/components/PlanDayDrawer.tsx`:

```tsx
import { Search, Save } from 'lucide-react'
import { Drawer } from '@web/components/overlays/Drawer'
import { EmptyState, Spinner } from '@/components/ui'
import { PlanRow } from '@/components/PlanRow'
import { usePlanDay } from '@/hooks/usePlanDay'
import { formatEstimate } from '@/lib/format'
import { CalendarRange } from 'lucide-react'
import type { ProjectItem } from '@/lib/types'

const DAILY_TARGET_MIN = 360

export function PlanDayDrawer({
  open,
  onClose,
  candidates,
}: {
  open: boolean
  onClose: () => void
  candidates: ProjectItem[]
}) {
  const plan = usePlanDay(candidates)
  const pct = Math.min(1, plan.total / DAILY_TARGET_MIN)

  const onSave = async () => {
    try {
      await plan.save()
      onClose()
    } catch {
      /* save() already toasted — keep open */
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Plan my day"
      widthClass="max-w-lg"
      footer={
        <button
          onClick={onSave}
          disabled={plan.saving}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {plan.saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save plan
        </button>
      }
    >
      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>Planned today</span>
          <span>
            <span className="font-bold text-brand-600 dark:text-brand-400">{formatEstimate(plan.total)}</span> /{' '}
            {formatEstimate(DAILY_TARGET_MIN)}
          </span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>

      {/* Search */}
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={plan.query}
          onChange={(e) => plan.setQuery(e.target.value)}
          placeholder="Search tasks…"
          className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
        />
      </div>

      {plan.visible.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={plan.query ? 'No matches' : 'Nothing to plan'}
          subtitle={plan.query ? 'Try a different search.' : 'No tasks due today or overdue.'}
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {plan.visible.map((t) => (
            <PlanRow key={t.name} todo={t} minutes={plan.mins[t.name] || 0} onSet={plan.setMin} onUseEstimate={plan.useEstimate} />
          ))}
        </ul>
      )}
    </Drawer>
  )
}
```

- [ ] **Step 2: Typecheck the web app**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend-web/src/components/PlanDayDrawer.tsx
git commit -m "feat(plan): web PlanDayDrawer (reuses usePlanDay + PlanRow)"
```

---

### Task 6: `TodoCard` "add to today" toggle

**Files:**
- Modify: `frontend/src/components/TodoCard.tsx`

**Interfaces:**
- Consumes: `useSetTodoAllocations` from `@/hooks/useData`; `buildNext` from `@/lib/planDay`; `todayISO` from `@/lib/format`.
- Produces: same `TodoCard` props. New behaviour: on own lists (`!showAssignee`) a "+ Today" / "✓ {minutes}" toggle; the read-only `today_allocation` pill now shows only on assignee/review lists.

- [ ] **Step 1: Add imports**

In `frontend/src/components/TodoCard.tsx`:

Replace the lucide import (line 3):
```tsx
import { Clock, ChevronRight, CalendarDays, ArrowRight, Repeat, Play, Timer } from 'lucide-react'
```
with:
```tsx
import { Clock, ChevronRight, CalendarDays, ArrowRight, Repeat, Play, Timer, Plus, Check } from 'lucide-react'
```

Replace the format import (line 5):
```tsx
import { formatEstimate } from '@/lib/format'
```
with:
```tsx
import { formatEstimate, todayISO } from '@/lib/format'
```

After the existing `import { openFocusOverlay } from '@/lib/focusUI'` line, add:
```tsx
import { useSetTodoAllocations } from '@/hooks/useData'
import { buildNext } from '@/lib/planDay'
```

- [ ] **Step 2: Add the toggle handler**

After the `onAdvance` handler (ends at line 44, the `}` closing `onAdvance`), add inside the component:

```tsx
  const setAlloc = useSetTodoAllocations(todo.name)
  const planned = todo.today_allocation > 0
  const onToggleToday = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (setAlloc.isPending) return
    const minutes = planned ? 0 : todo.estimated > 0 ? todo.estimated : 30
    setAlloc.mutate(buildNext(todo.allocations ?? [], todayISO(), minutes))
  }
```

- [ ] **Step 3: Gate the existing today pill to assignee lists**

Find the today-allocation pill block (lines 105-113) starting with `{todo.today_allocation > 0 && (`. Change the opening condition from:

```tsx
            {todo.today_allocation > 0 && (
```
to:
```tsx
            {todo.today_allocation > 0 && showAssignee && (
```

- [ ] **Step 4: Add the toggle button (own lists)**

Immediately after that pill block's closing `)}` (line 113) and before the closing `</div>` of the metadata row (line 114), insert:

```tsx
            {!showAssignee && (
              <span
                role="button"
                tabIndex={0}
                onClick={onToggleToday}
                aria-disabled={setAlloc.isPending}
                title={planned ? 'Remove from today' : 'Add to today'}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition active:scale-95',
                  setAlloc.isPending && 'opacity-50',
                  planned
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-stone-100 text-stone-600 dark:bg-slate-700 dark:text-slate-300',
                )}
              >
                {planned ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {planned ? `${formatEstimate(todo.today_allocation)} today` : 'Today'}
              </span>
            )}
```

- [ ] **Step 5: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 6: Run both apps and verify the toggle**

Mobile: `cd frontend && npm run dev` → Home → a todo card shows "+ Today"; tap → becomes "✓ {minutes} today" and the card persists allocation (re-open Plan-my-day to confirm). Tap again → removed.
Web: `cd frontend-web && npm run dev` → same card behaviour in the deadline tiles. Review lists (showAssignee) show the old read-only pill, no toggle.

- [ ] **Step 7: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/TodoCard.tsx
git commit -m "feat(plan): TodoCard one-tap add/remove from today"
```

---

### Task 7: Mobile homepage "Today's plan" list

**Files:**
- Modify: `frontend/src/pages/Today.tsx`

**Interfaces:**
- Consumes: `byAllocationAsc` (Task 1).
- Produces: a new "Today's plan" section under the "Plan my day" banner; the deadline group switcher is unchanged below it.

- [ ] **Step 1: Import the sort helper**

In `frontend/src/pages/Today.tsx`, change the format import (line 41) from:

```tsx
import { byDeadlineAsc, byDeadlineDesc, byEstimatedAsc, formatEstimate, formatEstimateRatio } from '@/lib/format'
```
to:
```tsx
import { byAllocationAsc, byDeadlineAsc, byDeadlineDesc, byEstimatedAsc, formatEstimate, formatEstimateRatio } from '@/lib/format'
```

- [ ] **Step 2: Derive the planned-today list**

After the `plannedTodayMin` line (line 202) add:

```tsx
  // "Today's plan": only todos I've allocated minutes to today, fewest-first.
  const plannedTodos = all.filter((t) => (t.today_allocation || 0) > 0).slice().sort(byAllocationAsc)
```

(`all` is the existing `[...overdue, ...due_today, ...upcoming]` memo at line 143.)

- [ ] **Step 3: Render the section under the banner**

The "Plan my day" banner button ends at line 451 (`</button>`). Immediately after it, before the `{(() => { const groups...` deadline block (line 452), insert:

```tsx
                  {plannedTodos.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                        <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                        Today's plan · {plannedTodos.length} · {formatEstimate(plannedTodayMin)}
                      </div>
                      <div className="flex flex-col gap-3">
                        {plannedTodos.map((t) => (
                          <TodoCard key={t.name} todo={t} />
                        ))}
                      </div>
                    </div>
                  )}
```

(`Sparkles` is already imported at line 22.)

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 5: Run and verify**

`cd frontend && npm run dev` → Home (For me). Allocate minutes to a couple todos via Plan-my-day. Verify a "Today's plan" section appears under the banner listing those todos fewest-minutes-first; the Today/Overdue/Upcoming switcher still shows below.

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/Today.tsx
git commit -m "feat(plan): mobile home Today's-plan list (fewest-first)"
```

---

### Task 8: Web homepage "Today's plan" tile + drawer entry

**Files:**
- Modify: `frontend-web/src/pages/Today.tsx`

**Interfaces:**
- Consumes: `byAllocationAsc` (Task 1); `PlanDayDrawer` (Task 5).
- Produces: a "Today's plan" Bento tile with a "Plan my day" button (opens the drawer) under the lens bar; deadline tiles unchanged below.

- [ ] **Step 1: Imports + state**

In `frontend-web/src/pages/Today.tsx`:

Change the format import (line 10) from:
```tsx
import { formatNumber, formatEstimateRatio } from '@/lib/format'
```
to:
```tsx
import { formatNumber, formatEstimateRatio, formatEstimate, byAllocationAsc } from '@/lib/format'
```

Replace the lucide import (line 13):
```tsx
import { CheckCircle2, ShieldCheck, CheckCheck, FolderKanban } from 'lucide-react'
```
with:
```tsx
import { CheckCircle2, ShieldCheck, CheckCheck, FolderKanban, Sparkles } from 'lucide-react'
```

Add the drawer import after that line:
```tsx
import { PlanDayDrawer } from '@web/components/PlanDayDrawer'
```
(`@web/components/...` is the correct alias — line 7's `import ... from '@web/components/bento'` confirms it resolves to `frontend-web/src/components`.)

Add the drawer open state — after `const [filterOpen, setFilterOpen] = useState(false)` (line 65):
```tsx
  const [planOpen, setPlanOpen] = useState(false)
```

- [ ] **Step 2: Derive plan candidates + planned list**

After the `visible` memo (line 85) add:

```tsx
  // Plan-my-day candidates (mobile parity): due-today + overdue + anything
  // already allocated today. plannedTodos = today's plan, fewest-minutes-first.
  const planCandidates = useMemo(() => {
    const d = dash.data
    if (!d) return []
    const byId = new Map<string, ProjectItem>()
    for (const t of [...d.due_today, ...d.overdue]) byId.set(t.name, t)
    for (const t of d.upcoming) if ((t.today_allocation || 0) > 0) byId.set(t.name, t)
    return [...byId.values()]
  }, [dash.data])
  const plannedTodos = useMemo(
    () => allTasks.filter((t) => (t.today_allocation || 0) > 0).slice().sort(byAllocationAsc),
    [allTasks],
  )
  const plannedTodayMin = plannedTodos.reduce((s, t) => s + (t.today_allocation || 0), 0)
```

Note: this `useMemo` block must sit **above** the early `if (!dash.data)` return (line 87) so hooks run unconditionally. It already does if inserted right after line 85. Keep it there.

- [ ] **Step 3: Render the Today's-plan tile**

Inside the `lens === 'mine' ? (` branch, the deadline tiles are produced by `groups.map(...)` (lines 206-214). Immediately **before** `{groups.map(...)}` insert a fragment wrapper so we can render the plan tile first. Change line 205-214 from:

```tsx
        {lens === 'mine' ? (
          groups.map((g) => (
            <BentoTile key={g.title} span="md" tone="plain" title={`${g.title} · ${g.items.length}`}>
              <div className="space-y-2">
                {g.items.length === 0
                  ? <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400 dark:border-slate-800">Nothing here</div>
                  : g.items.map((t) => <TodoCard key={t.name} todo={t} showProject />)}
              </div>
            </BentoTile>
          ))
        ) : (
```
to:
```tsx
        {lens === 'mine' ? (
          <>
            <BentoTile
              span="full"
              tone="plain"
              title={`Today's plan · ${plannedTodos.length} · ${formatEstimate(plannedTodayMin)}`}
              actions={
                <button
                  onClick={() => setPlanOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  <Sparkles className="h-4 w-4" /> Plan my day
                </button>
              }
            >
              <div className="space-y-2">
                {plannedTodos.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400 dark:border-slate-800">
                    Nothing planned for today yet — hit “Plan my day”.
                  </div>
                ) : (
                  plannedTodos.map((t) => <TodoCard key={t.name} todo={t} showProject />)
                )}
              </div>
            </BentoTile>
            {groups.map((g) => (
              <BentoTile key={g.title} span="md" tone="plain" title={`${g.title} · ${g.items.length}`}>
                <div className="space-y-2">
                  {g.items.length === 0
                    ? <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400 dark:border-slate-800">Nothing here</div>
                    : g.items.map((t) => <TodoCard key={t.name} todo={t} showProject />)}
                </div>
              </BentoTile>
            ))}
          </>
        ) : (
```

(`BentoTile` supports an `actions` prop rendered in the tile header — confirmed in `frontend-web/src/components/bento.tsx`.)

- [ ] **Step 4: Mount the drawer**

Before the final closing `</div>` of the returned tree (the `</div>` after `</BentoGrid>` / the trailing all-clear EmptyState, around line 247), add:

```tsx
      <PlanDayDrawer open={planOpen} onClose={() => setPlanOpen(false)} candidates={planCandidates} />
```

Place it as a sibling after `</BentoGrid>` (and after the existing `{lens === 'mine' && visible.length === 0 && (...)}` block), still inside the outermost `<div className="space-y-6">`.

- [ ] **Step 5: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 6: Run the web app and verify**

`cd frontend-web && npm run dev` → Home. Verify the "Today's plan" tile lists allocated todos fewest-first; "Plan my day" opens the side drawer (search, manual edit, use-estimate, planned-on-top, save); after save the tile + deadline tiles refresh. Deadline tiles (Overdue/Today/Upcoming) still render below.

- [ ] **Step 7: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend-web/src/pages/Today.tsx
git commit -m "feat(plan): web home Today's-plan tile + plan drawer entry"
```

---

## Final verification

- [ ] Pure-logic self-check: `cd frontend && ./node_modules/.bin/esbuild src/lib/planDay.selfcheck.ts --bundle --platform=node --format=esm | node --input-type=module` → `planDay self-check OK`.
- [ ] Typecheck both apps: `cd frontend && npx tsc -b --noEmit` and `cd frontend-web && npx tsc -b --noEmit` → both exit 0.
- [ ] Production build both apps: `cd frontend && npm run build` and `cd frontend-web && npm run build` → both succeed.
- [ ] Manual smoke (both apps): plan drawer search/sort/estimate/manual edit; card +Today / ✓ toggle (and removal); homepage Today's-plan list fewest-first; deadline lists still present and prominent.

## Self-review notes (coverage vs spec)

- Spec A (shared hook + pure helpers) → Tasks 1, 2. ✅
- Spec B (drawer: estimate button + manual input + search + planned-on-top) → `PlanRow` (Task 3), mobile sheet (Task 4), web drawer (Task 5). ✅
- Spec C (TodoCard toggle, own-lists only) → Task 6. ✅
- Spec D (homepage Today's-plan list, fewest-first; deadlines stay prominent) → Tasks 7 (mobile), 8 (web). ✅
- No backend changes. ✅
