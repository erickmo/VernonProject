# Calendar View — Design

Date: 2026-06-25
Status: Approved

## Goal

Help users **manage what to do** via a month calendar. Entry from the dashboard.
Single responsive component serves both the mobile (`/m`) and web (`/w`) builds.

## User-facing behavior

- Month grid, **week starts Monday**, 7×6 cells, prev / next / "today" nav.
- Each visible todo placed on a day, colored by status (reuse `STATUS[key].dot`).
- Tap a day → bottom sheet listing that day's todos. Tap a todo → `/project-item/:name`.
- Overdue (deadline < today, not completed) gets a red accent.

### Toggles (persisted in `localStorage`)

1. **Scope**: `My | All | Project`
   - `My` = todos where `is_mine` and `status_key === 'planned'` (mirrors Today's personal queue).
   - `All` = every visible todo the API returns.
   - `Project` = `All` filtered to a picked project (`project` field). Picker = simple select.
2. **Date field** (which date drives placement): `deadline | owner_deadline | leader_deadline`.
3. **Split schedule** (on/off):
   - OFF → single chip on the chosen date's day.
   - ON → todo rendered across its **per-day allocation** dates (`allocations[].date`,
     the assignee's day-plan already returned by the API). Todos with no allocations
     fall back to a single chip on the chosen date.

### Counts / edges

- Todos with no value for the chosen date field (and no allocations when split on) are
  hidden; show an "N undated" note.
- Empty month → `EmptyState`.

## Architecture

### Backend — `vernon_project/api/mobile.py`

New whitelisted `get_calendar()`:
- `projects = _visible_projects()`, `rows = _fetch_todos(projects)`.
- Shape each via existing `_shape_todo` (already includes `deadline`,
  `owner_deadline`, `leader_deadline`, `allocations`, `status_key`, `is_mine`,
  `project`, `to_do`, `is_overdue`).
- Return `{ "todos": [...] }`. No date filtering server-side (dataset is per-user
  visible set; client filters by month). Revisit if payload too large.

### Frontend

- `lib/api.ts`: `calendar: () => api.get(M + 'get_calendar')`.
- `hooks/useData.ts`: `keys.calendar = ['calendar']`; `useCalendar()` query.
- `pages/Calendar.tsx`: `DetailScreen` shell, grid + toggles + day sheet.
  - Month math in component (UTC date helpers, Monday-first).
  - Reuse `STATUS` colors, `ProjectItem` type, existing day-sheet/bottom-sheet UI
    primitives from `components/ui`.
- `App.tsx`: route `/calendar`.
- `pages/Today.tsx`: quick-action button (`CalendarDays` icon) → `navigate('/calendar')`.

## Build / deploy

- `npm run build` for both targets (mobile + web) per deploy mechanics.
- `bench restart` to pick up the new Python whitelisted method.

## Testing

Live site, code-first: defer automated tests; smoke-check the build + manual click-through.

## Out of scope (YAGNI)

- Drag-to-replan (write-back). Week/agenda view. Recurring expansion. These can follow later.
