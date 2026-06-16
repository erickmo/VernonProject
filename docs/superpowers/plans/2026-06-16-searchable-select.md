# Searchable Select + Default Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One reusable searchable-select component used for every filter and form dropdown in the PWA (options sorted A→Z), plus fixed default sorting on result lists (Projects A→Z; task lists by deadline soonest-first).

**Architecture:** A new client-only `SearchableSelect` component replaces all `<select>` elements and the `FilterSheet` chip grid. Result lists are sorted client-side where rendered. No backend/API changes.

**Tech Stack:** React + TypeScript + Tailwind + lucide-react (Vite PWA).

**App root:** `/home/frappe/frappe-bench/apps/vernon_project` · **Frontend:** `frontend/`

**Verification:** No JS test runner is configured. Each task verifies with `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`. The production bundle is rebuilt once in the final task.

---

## File Structure

- Create `frontend/src/components/SearchableSelect.tsx` — the component (only new logic).
- Modify `frontend/src/lib/format.ts` — `byDeadlineAsc` helper.
- Modify `frontend/src/pages/Projects.tsx`, `Today.tsx`, `Review.tsx`, `WorkItemPage.tsx` — result sorting.
- Modify `frontend/src/components/ProjectFormSheet.tsx`, `WorkItemFormSheet.tsx`, `CreateTaskSheet.tsx` — form selects.
- Modify `frontend/src/pages/ReportPage.tsx` — filter selects.
- Modify `frontend/src/components/FilterSheet.tsx` — dimensions become searchable selects.

---

## Task 1: SearchableSelect component

**Files:** Create `frontend/src/components/SearchableSelect.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown, Search, Check, Plus } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  /** Adds a leading "Any" entry that selects the empty value (for filters). */
  allowClear?: boolean
  /** Offers "Create '<term>'" when the typed term has no exact label match. */
  allowCreate?: boolean
  id?: string
}

const FIELD =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400'

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  allowClear,
  allowCreate,
  id,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const sorted = [...options].sort((a, b) => a.label.localeCompare(b.label))
  const term = q.trim().toLowerCase()
  const shown = term ? sorted.filter((o) => o.label.toLowerCase().includes(term)) : sorted
  const selected = options.find((o) => o.value === value)
  const exact = !!term && options.some((o) => o.label.toLowerCase() === term)

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    setQ('')
  }

  return (
    <div className="relative mt-1" ref={ref}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={clsx(FIELD, 'flex items-center justify-between text-left')}
      >
        <span className={clsx('truncate', !selected && 'text-slate-400')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="relative border-b border-slate-100 p-2">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-lg bg-slate-50 py-1.5 pl-9 pr-3 text-sm outline-none focus:bg-white"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {allowClear && (
              <button
                type="button"
                onClick={() => pick('')}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-500 active:bg-slate-50"
              >
                Any
                {!value && <Check className="h-4 w-4 text-brand-600" />}
              </button>
            )}
            {shown.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 active:bg-slate-50"
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check className="ml-2 h-4 w-4 shrink-0 text-brand-600" />}
              </button>
            ))}
            {allowCreate && term && !exact && (
              <button
                type="button"
                onClick={() => pick(q.trim())}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-brand-600 active:bg-brand-50"
              >
                <Plus className="h-4 w-4" /> Create “{q.trim()}”
              </button>
            )}
            {!shown.length && !(allowCreate && term) && (
              <p className="px-3 py-3 text-sm text-slate-400">
                {term ? `No matches for “${q}”.` : 'No options'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

Note: the component owns its top margin (`mt-1` on the wrapper), so callers replacing a `<select className={field + ' mt-1'}>` should NOT add `mt-1` themselves.

- [ ] **Step 2: Type-check**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/SearchableSelect.tsx
git commit -m "feat: add reusable SearchableSelect component"
```

---

## Task 2: Default result sorting

**Files:** Modify `frontend/src/lib/format.ts`, `pages/Projects.tsx`, `pages/Today.tsx`, `pages/Review.tsx`, `pages/WorkItemPage.tsx`

- [ ] **Step 1: Add the deadline comparator to format.ts**

Append to `frontend/src/lib/format.ts`:

```typescript
/** Sort by ISO date string ascending (soonest first); nulls last. */
export function byDeadlineAsc(
  a: { deadline: string | null },
  b: { deadline: string | null },
): number {
  if (!a.deadline && !b.deadline) return 0
  if (!a.deadline) return 1
  if (!b.deadline) return -1
  return a.deadline.localeCompare(b.deadline)
}
```
(ISO `YYYY-MM-DD` strings compare lexically in chronological order.)

- [ ] **Step 2: Projects.tsx — sort the rendered list A→Z by name**

In `frontend/src/pages/Projects.tsx`, find where the filtered `list` is computed (`const list = projects.filter(...)`). Append a sort so the rendered list is alphabetical:

```tsx
  const list = projects
    .filter(
      (p) =>
        (status === 'all' ? true : p.status === status) &&
        (!filters.brand || p.customer === filters.brand) &&
        (!filters.owner || p.project_owner === filters.owner) &&
        (!filters.leader || p.project_leader === filters.leader) &&
        (!q || p.project_name.toLowerCase().includes(q) || (p.customer || '').toLowerCase().includes(q)),
    )
    .sort((a, b) => a.project_name.localeCompare(b.project_name))
```
(Keep the existing filter predicate exactly; only add the trailing `.sort(...)`. If the current code stores the predicate differently, just append `.sort((a, b) => a.project_name.localeCompare(b.project_name))` to the filtered result.)

- [ ] **Step 3: Today.tsx — sort each task group by deadline**

In `frontend/src/pages/Today.tsx`, add `byDeadlineAsc` to the import from `@/lib/format`. The component builds `filtered = { overdue, due_today, upcoming }` via `applyTaskFilters(...)`. Sort each array. Replace the `filtered` construction:

```tsx
  const filtered = {
    overdue: applyTaskFilters(data.overdue, filters).slice().sort(byDeadlineAsc),
    due_today: applyTaskFilters(data.due_today, filters).slice().sort(byDeadlineAsc),
    upcoming: applyTaskFilters(data.upcoming, filters).slice().sort(byDeadlineAsc),
  }
```
(Match the existing variable/shape; only add `.slice().sort(byDeadlineAsc)` to each array. `.slice()` avoids mutating cached query data.)

- [ ] **Step 4: Review.tsx — sort the review list by deadline**

In `frontend/src/pages/Review.tsx`, add `byDeadlineAsc` to the `@/lib/format` import. Change:

```tsx
  const review = data?.review ?? []
```
to:

```tsx
  const review = (data?.review ?? []).slice().sort(byDeadlineAsc)
```

- [ ] **Step 5: WorkItemPage.tsx — sort todos by deadline**

In `frontend/src/pages/WorkItemPage.tsx`, add `byDeadlineAsc` to the `@/lib/format` import (the file already imports `stripHtml` from there). Where it renders `data.todos.map(...)`, sort first. Just above the `return`, add:

```tsx
  const todos = data.todos.slice().sort(byDeadlineAsc)
```
and replace `data.todos.map((t) =>` with `todos.map((t) =>` and `data.todos.length` (in the Tasks count and empty-state check) with `todos.length`.

- [ ] **Step 6: Type-check**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/format.ts frontend/src/pages/Projects.tsx frontend/src/pages/Today.tsx frontend/src/pages/Review.tsx frontend/src/pages/WorkItemPage.tsx
git commit -m "feat: default result sorting (projects A-Z, task lists by deadline)"
```

---

## Task 3: Form selects → SearchableSelect

**Files:** Modify `frontend/src/components/ProjectFormSheet.tsx`, `WorkItemFormSheet.tsx`, `CreateTaskSheet.tsx`

> Read each file first; replace each `<select>…</select>` block (and the grouping input+datalist in WorkItemFormSheet) with a `<SearchableSelect>`. Add `import { SearchableSelect } from '@/components/SearchableSelect'` to each file.

- [ ] **Step 1: ProjectFormSheet.tsx**

Add the import. Replace each of the six `<select>` blocks with a `SearchableSelect`. Status options need mapping to `{value,label}`; the others already have `{value,label}` option arrays from `opts`. Use:

- Customer:
```tsx
<SearchableSelect value={f.customer} onChange={(v) => set('customer', v)} options={opts?.customers ?? []} placeholder="Select…" />
```
- Project group:
```tsx
<SearchableSelect value={f.project_group} onChange={(v) => set('project_group', v)} options={opts?.project_groups ?? []} placeholder="Select…" />
```
- Owner:
```tsx
<SearchableSelect value={f.project_owner} onChange={(v) => set('project_owner', v)} options={users} disabled={lockLeads} placeholder="Select…" />
```
- Leader:
```tsx
<SearchableSelect value={f.project_leader} onChange={(v) => set('project_leader', v)} options={users} disabled={lockLeads} placeholder="Select…" />
```
- Admin (optional → allowClear gives the "None"/Any entry):
```tsx
<SearchableSelect value={f.project_admin ?? ''} onChange={(v) => set('project_admin', v)} options={users} allowClear placeholder="None" />
```
- Status:
```tsx
<SearchableSelect value={f.status} onChange={(v) => set('status', v)} options={STATUSES.map((s) => ({ value: s, label: s }))} />
```
Remove the now-unused inline `field`-class on those selects; the local `field` const is still used by text inputs, so keep the const.

- [ ] **Step 2: WorkItemFormSheet.tsx**

Add the import. Replace the grouping `<input list="wi-groupings">` + `<datalist>` block with a creatable searchable select; replace the status `<select>`:

- Grouping:
```tsx
<SearchableSelect
  value={grouping}
  onChange={setGrouping}
  options={groupings.map((g) => ({ value: g, label: g }))}
  allowCreate
  placeholder="Pick or type a new grouping"
/>
```
- Status:
```tsx
<SearchableSelect value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: s }))} />
```

- [ ] **Step 3: CreateTaskSheet.tsx**

Add the import. Replace the assignee `<select>` and the recurring-frequency `<select>`:

- Assignee (team is `{user,name}[]`):
```tsx
<SearchableSelect
  value={assignedTo}
  onChange={setAssignedTo}
  options={team.map((m) => ({ value: m.user, label: m.name }))}
  placeholder="Select a team member…"
/>
```
- Frequency:
```tsx
<SearchableSelect
  value={frequency}
  onChange={setFrequency}
  options={['Daily', 'Weekly', 'Monthly'].map((s) => ({ value: s, label: s }))}
/>
```

- [ ] **Step 4: Type-check**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors. Remove any now-unused imports (e.g. lucide icons only used by the removed datalist) that tsc/no-unused flags.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/ProjectFormSheet.tsx frontend/src/components/WorkItemFormSheet.tsx frontend/src/components/CreateTaskSheet.tsx
git commit -m "feat: use SearchableSelect in create/edit forms"
```

---

## Task 4: ReportPage filter selects → SearchableSelect

**Files:** Modify `frontend/src/pages/ReportPage.tsx`

> Read the file. It renders report filter controls including `<select>` elements (around the control-rendering `.map`, near lines 130–200). Each select has a current value, an onChange that sets the filter, and an options array (`opts`/`set`).

- [ ] **Step 1: Replace the filter selects**

Add `import { SearchableSelect } from '@/components/SearchableSelect'`. For each `<select>` that renders a report filter, replace it with:

```tsx
<SearchableSelect
  value={<current value expression>}
  onChange={(v) => <existing onChange body using v instead of e.target.value>}
  options={<the options array mapped to {value,label}>}
  allowClear
  placeholder="Any"
/>
```
Map the existing option source to `{value,label}[]`: if options are objects `{value,label}` already, pass them through; if they are strings, map `s => ({value: s, label: s})`. Use `allowClear` so a filter can be reset to empty (matching the current "Any"/empty `<option value="">`). Preserve any existing label/wrapper markup around the select.

- [ ] **Step 2: Type-check**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/ReportPage.tsx
git commit -m "feat: use SearchableSelect for report filters"
```

---

## Task 5: FilterSheet dimensions → SearchableSelect

**Files:** Modify `frontend/src/components/FilterSheet.tsx`

- [ ] **Step 1: Replace DimensionGroup internals with a SearchableSelect**

Add `import { SearchableSelect } from '@/components/SearchableSelect'`. Replace the `DimensionGroup` component body so each dimension renders its label plus a single searchable select (the per-dimension search box, the `>8` threshold, the chip grid, and the local `q` state are removed). New `DimensionGroup`:

```tsx
function DimensionGroup({
  dim,
  selected,
  onSelect,
}: {
  dim: FilterDimension
  selected: string
  onSelect: (v: string) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-500">{dim.label}</p>
        {selected && (
          <button onClick={() => onSelect('')} className="text-xs font-medium text-brand-600">
            Clear
          </button>
        )}
      </div>
      <SearchableSelect
        value={selected}
        onChange={onSelect}
        options={dim.options.map((o) => ({ value: o.value, label: o.label }))}
        allowClear
        placeholder="Any"
      />
    </div>
  )
}
```
Remove now-unused imports from `FilterSheet.tsx` if they become unused (e.g. `Search` if no longer referenced — but `clsx`, `SlidersHorizontal`, `X`, `RotateCcw` are still used elsewhere in the file; only drop what tsc flags). Leave `FilterButton`, `FilterSheet`, `activeFilterCount`, and the exported types unchanged.

- [ ] **Step 2: Type-check**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/FilterSheet.tsx
git commit -m "feat: FilterSheet dimensions use SearchableSelect"
```

---

## Task 6: Build + verification

**Files:** rebuilt bundle under `vernon_project/public/frontend/`, `vernon_project/www/m.html`, `vernon_project/www/vernon_sw.js`

- [ ] **Step 1: Type-check + build**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && npm run build`
Expected: tsc clean; build succeeds, emitting hashed assets to `vernon_project/public/frontend/` and updating `www/m.html` + `www/vernon_sw.js`.

- [ ] **Step 2: Commit the rebuilt bundle**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/public/frontend vernon_project/www/m.html vernon_project/www/vernon_sw.js
git commit -m "build: rebuild PWA bundle for searchable select"
```

- [ ] **Step 3: Clear cache + manual verification**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id clear-cache
```
Then in the PWA confirm:
- Filters (Projects, Today, Review) open a searchable dropdown with options A→Z and an "Any" reset.
- Forms (project create/edit, work item with a brand-new grouping via "Create '<term>'", task) have searchable selects.
- Projects list is alphabetical; task lists (Today groups, Review, work-item tasks) are deadline soonest-first.

---

## Notes / risks

- `byDeadlineAsc` relies on ISO `YYYY-MM-DD` deadline strings (the API returns these); lexical compare = chronological.
- `.slice()` before `.sort()` avoids mutating react-query cached arrays in place.
- The component bakes in `mt-1`; callers must not double it.
- `allowCreate` value is the raw typed term (the work-item create flow then creates the Glossary), matching existing behavior.
