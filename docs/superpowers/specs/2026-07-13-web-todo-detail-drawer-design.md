# /w Todo Detail Drawer — design spec (2026-07-13)

Clicking a todo anywhere in the /w web app opens its detail in a right-side
drawer over the current page, instead of navigating to a full page.

## Approach: modal route via synthesized background location

Every todo entry point in /w already navigates to `/project-item/:name`
(shared `TodoCard`, CommandPalette, ReportPage, FocusHost, FeedbackInbox,
DataHealth, GroupForm, Project/ProjectDetail charts). So a single interceptor
covers every screen — present and future — with no per-screen edits and no
change to the shared mobile `TodoCard`.

In `App.tsx`, wrap the router:
- Track the last location whose path is NOT `/project-item/:name` in a ref
  (`bgRef`), updated during render when the current path is not a todo.
- When the current path IS `/project-item/:name` **and** `bgRef` holds a real
  previous page, render the app `<Routes>` against `bgRef.current` (the page
  stays mounted behind) and render an overlay drawer.
- No previous page (refresh / direct load / deep-link as first paint) → pass
  the real location through; the existing `/project-item/:name` route renders
  the full `ProjectItem` page unchanged (fallback).

## Files

- `frontend-web/src/App.tsx` — background ref + `/project-item/:name` regex
  match + `<Routes location={bg ?? location}>` + overlay `<Routes location=
  {location}>` with one `<Route path="/project-item/:name" element={
  <TodoDrawer onClose={closeToBg} />}>`. `closeToBg` = `navigate(bgPath)`.
- **new** `frontend-web/src/components/TodoDrawer.tsx` — reads `:name` via
  `useParams` (it is inside a `<Route>`), renders the existing
  `overlays/Drawer` primitive (`widthClass="max-w-2xl"`, `closeOnEscape=
  {false}`) wrapping `<ProjectItem />`.
- **new** `frontend-web/src/lib/todoDrawer.ts` — pure helper
  `isTodoPath(path: string): boolean` (regex `^/project-item/[^/]+$`), the
  single source of truth for both the app-Routes branch and the bg-ref guard.
- **new** `frontend-web/src/lib/todoDrawer.test.ts` — asserts `isTodoPath`
  matches `/project-item/T1`, rejects `/project-item/T1/x`, `/project-detail/
  T1`, `/`, `/projects`.

`ProjectItem.tsx` is reused unchanged: its root is `<div class="space-y-6">`
with no outer width wrapper and no standalone back-link (only the `in {detail}`
breadcrumb, kept), so no `inDrawer` prop is needed. It reads its id from
`useParams` (`itemName ?? name`) and fetches via `useProjectItem(name)` —
works identically inside the overlay Route.

## Why the overlay works outside AppShell

The overlay `<TodoDrawer>` is a sibling of `<AppShell>` inside `<App>`, not a
child. All providers `ProjectItem` needs — QueryClient, Toast, Confirm,
Advance, Reject, BrowserRouter — are mounted ABOVE `<App>` in `main.tsx`, so
the overlay has them. `Drawer` is `fixed inset-0 z-50`, so being outside
`<main>` is correct.

## Data flow

Unchanged. No API changes. `ProjectItem` fetches by name via react-query.

## Edge cases

- **Refresh / direct load / first-paint deep-link** on `/project-item/x` →
  `bgRef` empty → full-page `ProjectItem` (existing route).
- **Deep-link while app open** (notification, command palette) → `bgRef` =
  current page → drawer over it.
- **Sibling-todo link inside the drawer** (`ProjectItem` related links →
  `/project-item/y`) → still a todo path → `bgRef` stays frozen → drawer
  swaps content, background unchanged.
- **`in {detail}` breadcrumb inside drawer** → navigates to `/project-detail/
  x` (non-todo) → drawer closes, background becomes that page. Expected.
- **Browser back and the X button** both land on the page behind (back pops
  the pushed history entry; X calls `navigate(bgPath)`).
- **Workspace / project-detail item panes** (`/project/:n/detail/:d/item/:i`,
  `/project-detail/:n/item/:i`) are different paths, not matched → unchanged
  master-detail panes (Leave-as-is decision).
- **Mobile `/m`** — separate shell, separate `App`; untouched.
- **Missing/unauthorized todo** → `ProjectItem` already renders "Could not
  load todo" inside the drawer.
- **Esc key** → `Drawer closeOnEscape={false}` so Esc closes `ProjectItem`'s
  own nested confirms (cancel / waiting / duplicate / follow-up), not the
  drawer; drawer closes via X, scrim, or browser back.

## Testing

Live-site convention: `npx tsc --noEmit` + manual. One runnable unit self-check
on the pure `isTodoPath` helper (the only non-trivial branch logic); the rest
is router wiring, verified live.

## Non-goals

- No new detail view (reuse `ProjectItem`).
- No change to shared `TodoCard` or any of the ~11 entry points.
- No change to the workspace/project-detail inline panes.
- No `/m` changes.
