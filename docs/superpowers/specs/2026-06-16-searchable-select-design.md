# Searchable Select for All Filters/Selects + Default Sorting — Design

**Date:** 2026-06-16
**Status:** Approved for planning

## Problem

Filter and form dropdowns across the mobile PWA are inconsistent: `FilterSheet`
uses a chip grid (search only when >8 options), `ReportPage` and the form sheets
use plain `<select>` elements (no search), and option lists are unsorted. We want
one searchable-select component used everywhere, with option lists sorted A→Z,
plus a sensible default sort on result lists.

## Decisions (from brainstorming)

| Topic | Decision |
|-------|----------|
| Scope | Every select — filters AND form selects — uses one `SearchableSelect` |
| Option sort | All option lists sorted A→Z by label, inside the component |
| Filter UI | `FilterSheet` dimensions become searchable dropdowns (replace chip grid) |
| Result sort | Fixed default (no new UI): Projects A→Z by name; task lists by deadline soonest-first |
| Component | Custom, no new dependency |

## Architecture

### New component: `frontend/src/components/SearchableSelect.tsx`

A controlled select with type-ahead. Interface:

```typescript
export interface SelectOption { value: string; label: string }

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string          // shown when no value (default "Select…")
  disabled?: boolean
  allowClear?: boolean          // adds an "Any" entry that sets value=""
  allowCreate?: boolean         // offers "Create '<term>'" when no exact match
  id?: string
}
```

Behavior:
- Renders a button showing the selected option's label (or `placeholder`).
- Tapping opens a panel (absolute dropdown anchored to the control) with a
  search input (autofocused) and the option list.
- Options are **sorted A→Z by `label`** (`localeCompare`) inside the component,
  every render. The incoming order does not matter.
- Typing filters options by case-insensitive label substring.
- `allowClear`: a leading "Any" row that calls `onChange("")`.
- `allowCreate`: when the trimmed search term has no exact (case-insensitive)
  label match, show a "Create '<term>'" row that calls `onChange(term)` — this
  preserves the work-item grouping's pick-or-type behavior.
- Closes on selection, on outside click/backdrop, and on Escape.
- Disabled state mirrors the existing `disabled:bg-slate-50` styling.
- Styling matches the existing form-field classes (`rounded-xl border
  border-slate-200 ...`) so it drops in where `<select>` was.

This is the single unit of new logic; everything else is wiring.

### Replace `<select>` usages

| File | Selects → SearchableSelect |
|------|----------------------------|
| `components/ProjectFormSheet.tsx` | customer, project_group, project_owner, project_leader (respect `disabled`/lockLeads), project_admin (`allowClear`/None), status |
| `components/WorkItemFormSheet.tsx` | grouping (`allowCreate`, seeded with `groupings`), status |
| `components/CreateTaskSheet.tsx` | assigned_to, recurring_frequency |
| `pages/ReportPage.tsx` | each filter `<select>` |

Each call passes `options` as `{value,label}[]`; the component sorts them. For
fixed lists (status, frequency) order is already short but still sorted A→Z for
consistency — acceptable (e.g. status options reorder alphabetically).

### `FilterSheet.tsx`

Replace the `DimensionGroup` chip grid with a `SearchableSelect` per dimension
(`allowClear` so the user can pick "Any"). Each dimension renders its label, the
select, and a Clear affordance via the "Any" option. The per-dimension local
search state and the >8 threshold are removed (search is now always available in
the component). `FilterDimension`/`FilterValue` types and the sheet's open/close
chrome are unchanged.

### Default result sorting (client-side, fixed)

- `pages/Projects.tsx`: after the existing filter, sort the rendered `list` by
  `project_name` using `localeCompare` (A→Z). The `useProjects` query order is
  left as-is; sorting happens on the derived list.
- Task lists by deadline soonest-first (nulls last), sorted where the arrays are
  consumed:
  - `pages/Today.tsx` — each dashboard group array (overdue, due_today,
    upcoming, review) sorted by `deadline` ascending before render.
  - `pages/Review.tsx` — the review list sorted by `deadline` ascending.
  - `pages/WorkItemPage.tsx` — `data.todos` sorted by `deadline` ascending.
- A shared helper `byDeadlineAsc(a, b)` (in `lib/format.ts` or inline) keeps the
  comparison DRY; nulls sort last.

## Data flow

No backend or API changes. Sorting and search are entirely client-side:
options sorted inside `SearchableSelect`; result lists sorted where rendered.

## Error handling

- Empty options list → the panel shows "No options" (and, with `allowCreate`,
  still offers the create row when a term is typed).
- No search matches → "No matches for '<term>'" (plus the create row if
  `allowCreate`).
- `disabled` → control is non-interactive; existing form validation unchanged.

## Testing

- No JS test runner is configured in `frontend/`. Verify with
  `npx tsc --noEmit` + `npm run build`.
- Manual PWA checks: open each filter (Projects/Today/Review) and confirm a
  searchable dropdown with A→Z options; open each form (project create/edit,
  work item with a brand-new grouping, task) and confirm selects are searchable;
  confirm Projects list is A→Z and task lists are deadline-ordered.

## Out of scope (YAGNI)

- Work-items list ordering on `ProjectDetailPage` (work items are not a task list).
- Multi-select. Backend/query sorting. A user-facing sort control.
- Virtualized option lists (option counts here are small).
