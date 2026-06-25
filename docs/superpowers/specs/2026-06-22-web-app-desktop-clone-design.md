# Web App — Desktop Clone of the Mobile PWA

**Date:** 2026-06-22
**Status:** Design approved, pending spec review

## Goal

Clone the Vernon mobile PWA (React + Vite + Tailwind, served at `/m`) into a
desktop-optimized web app served at **`/web`**. Same product, same backend, but a
true desktop layout: persistent sidebar nav, wide multi-column content,
master-detail split views, data tables, and centered dialogs instead of
bottom sheets.

The existing mobile app at `/m` is **never edited** — zero regression risk on the
live app. The web app reuses the mobile app's pure-logic layer (data, hooks,
types, reusable widgets) by importing it; it rebuilds only the layout chrome.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Architecture | Separate sibling build `frontend-web/`; mobile `frontend/` untouched |
| Desktop UX ambition | **True desktop redesign** — master-detail, tables, multi-column dashboards |
| First scope | **Core daily flow** — Login, Today, Projects + drill-down, Review, Me |
| Route | **`/web`** (page name `web`, basename `/web`) |
| Code sharing | **Import via Vite/TS alias** from `../frontend/src` (single source of truth, no drift) |
| PWA / service worker | **None** for web (desktop; also avoids SW scope collision with `/m`) |
| Backend | Reused unchanged — all `mobile.py` + `project_todo.py` endpoints are presentation-agnostic |

## Non-goals (v1)

- No edits to `frontend/` (mobile) source.
- No new backend endpoints (every screen in scope is served by existing
  whitelisted methods). The only known data-layer gap — `grantPoints` /
  `listGrantUsers` lack wrapper hooks — is in Phase 3 (admin), out of v1 scope.
- No offline / installable PWA for web.
- Phase 2 (Reports, Wallet, Leaderboard, Marketplace) and Phase 3 (admin:
  Users, Brands, Groups, Marketplace admin, Grant points) are deferred.

---

## Architecture

### Code sharing — alias scheme

The mobile data layer was confirmed to have **zero layout coupling**. `frontend-web`
imports it directly. The only naming hazard is the `@` path alias: the shared
mobile files use `@/...` internally, so the web build must keep `@` pointing at
the mobile source, and give web's own code a separate alias.

- In `frontend-web/vite.config.ts` + `tsconfig.json`:
  - `@`    → `../frontend/src`  (resolves shared files' internal `@/lib/...` imports)
  - `@web` → `./src`            (web's own components / pages / shell)
- Nothing in `frontend/` changes.

**Reused as-is** (imported via `@`):

- `lib/api.ts` — Frappe client, `mobileApi`, `resource`, `login`, `logout`,
  `uploadRewardImage`, `renameDoc`, `ApiError`.
- `lib/types.ts`, `lib/status.ts`, `lib/format.ts`, `lib/filters.ts`,
  `lib/gantt.ts`, `lib/theme.ts`, `lib/reports.ts`.
- `hooks/useData.ts` — every query/mutation hook, `permFlags`, all `can*`
  helpers, `VERNON_ROLE_OPTIONS`. `hooks/useFocusTimer.ts`, `lib/ambientSound.ts`.
- Layout-agnostic components: `TodoCard`, `ProjectCard`, `GanttChart`,
  `CommentThread`, `SearchableSelect`, `MultiSelectChips`, `RichEditor`,
  `MergeIntoCard`, `ui.tsx` primitives (`Spinner`, `Avatar`, `ProgressBar`,
  `EmptyState`, `Pill`, `FilterChips`, `Segmented`, `FullScreenLoader`),
  `FilterButton` + `activeFilterCount`, and the providers `ToastProvider`,
  `ConfirmProvider`, `ErrorBoundary`.

**Rebuilt in `@web` for desktop** (the mobile chrome the map flagged):

- Phone shell — `BottomNav`, `TabScreen`, `DetailScreen`, `PullToRefresh` →
  replaced by `AppShell` (sidebar) + plain content containers.
- Bottom-sheet modals (`ProjectFormSheet`, `CreateProjectItemSheet`,
  `ProjectDetailFormSheet`, `ProjectDetailEditSheet`, `TeamManagerSheet`,
  `MemberWorkloadSheet`, `ChangePasswordSheet`, `GroupManagerSheet`,
  `FilterSheet`) → rebuilt as desktop `Dialog` / `Drawer` / `Popover`. **Their
  form logic is reused via the same mutation hooks** (`useCreateProject`,
  `useUpdateProject`, `useCreateProjectItem`, `useSetTodoAllocations`,
  `useChangeMyPassword`, …) — only the container chrome is new.

**Page-internal pieces that are NOT importable** (defined inside mobile page
files, so web rebuilds them — they are not in the reuse contract):

- `Ring` (progress arc, inside `Today.tsx`), `Stepper` + `FocusOverlay` +
  `EditForm` + `Notes` + `AllocationCard` (inside `ProjectItemScreen.tsx`),
  `Splash` + the auth `Login` + `Onboarding` (inside `App.tsx` / page files).
  Web rebuilds each in `@web`, calling the same reused hooks. `useFocusTimer`
  and `ambientSound` (the focus engine) ARE importable and reused by the rebuilt
  `FocusOverlay`.
- Type-only imports from mobile-chrome files are allowed (no layout pulled in):
  `FilterDimension` / `FilterValue` from `FilterSheet.tsx` feed web's `Popover`.

**Two mobile-coupled bits in `api.ts`, handled without editing it:**

- `login(usr, pwd)` only POSTs; the *caller* reloads. Web's login screen calls
  `login()` then `window.location.href = '/web'`.
- `logout()` clears the localStorage cache key `vernon-mobile-cache` (harmless on
  web). Web's React Query persistence uses a **separate** key `vernon-web-cache`,
  so the two apps' caches never clash.

### Build & serve plumbing

The `/m` chain is single-tenant; `/web` gets a full parallel chain. Nothing is
shared between the two build outputs.

| Item | Mobile (existing) | Web (new) |
|---|---|---|
| Source dir | `frontend/` | `frontend-web/` |
| Vite `--base` | `/assets/vernon_project/frontend/` | `/assets/vernon_project/frontend_web/` |
| `build.outDir` | `../vernon_project/public/frontend` | `../vernon_project/public/frontend_web` |
| HTML shell | `www/m.html` | `www/web.html` |
| Page controller | `www/m.py` (`no_cache=1`) | `www/web.py` (`no_cache=1`) |
| Route rule | `/m/<path:app_path>` → `m` | `/web/<path:app_path>` → `web` |
| Router basename | `/m` | `/web` |
| Service worker | `vernon_sw.js` @ scope `/m` | **none** |

- `frontend-web/package.json` build script:
  `vite build --base=/assets/vernon_project/frontend_web/ && npm run copy-html`.
- `frontend-web/copy-html.mjs`: copies
  `../vernon_project/public/frontend_web/index.html` → `../vernon_project/www/web.html`.
  Does **not** copy a service worker.
- `frontend-web/index.html`: same Jinja CSRF line
  (`window.csrf_token = '{{ frappe.session.csrf_token }}'`); favicon/manifest
  hrefs under `/assets/vernon_project/frontend_web/` (manifest optional, no PWA).
- `www/web.py`: hand-written controller, `no_cache = 1` (mirrors `m.py`).
- `hooks.py`: append `{"from_route": "/web/<path:app_path>", "to_route": "web"}`
  to the existing `website_route_rules` list.
- Deploy: `npm run build` in `frontend-web/`, then `bench --site <site>
  clear-cache` + `bench restart` so the new route is live. (Per the deploy-mechanics
  memory: migrate only for schema — none here; restart for the new route rule;
  npm build for assets.)

### Frontend bootstrap (`frontend-web/src/main.tsx` + `App.tsx`)

- Provider stack mirrors mobile: `PersistQueryClientProvider` (key
  `vernon-web-cache`, own `CACHE_BUSTER`) → `BrowserRouter basename="/web"` →
  `ToastProvider` → `ConfirmProvider` → `ErrorBoundary` → `App`.
- `initTheme()` before render (reused).
- **No** `serviceWorker.register`.
- `App.tsx`: `useBoot()` gate identical in spirit — `Splash` while loading,
  in-app `Login` on 401/403, otherwise the routed `AppShell`. Onboarding tour is
  **dropped** for v1 (mobile-tour content; revisit later).

---

## Desktop layout system

### `AppShell` (`@web/components/AppShell`)

- Persistent **left sidebar** (~240px): brand mark; nav items Today (`/`),
  Projects (`/projects`), Review (`/review` with count badge from
  `useDashboard().data.counts.review`), Me (`/me`). Active item highlighted with
  `text-brand-600` / brand fill.
- Sidebar footer: user `Avatar` + name, theme toggle (light/dark/system via
  reused `theme.ts`), logout.
- Content area: `flex-1`, fluid, `max-w-7xl` centered with responsive padding;
  a slim sticky top bar shows the current screen title + screen-level actions.
- Under `lg`: sidebar collapses into a top bar with a drawer toggle (graceful
  fallback; the app is desktop-first but shouldn't break on a tablet).

### `Dialog`, `Drawer`, `Popover` (`@web/components/overlays`)

- `Dialog` — centered modal (backdrop, Esc/click-out close, body-scroll lock);
  hosts create/edit forms. Reuses `Confirm` for destructive confirms.
- `Drawer` — right-side slide-in; hosts member workload / team management.
- `Popover` — anchored panel; hosts filter dimensions (replacing `FilterSheet`)
  and column/period menus. Built on reused `SearchableSelect`, `FilterChips`.

---

## Screen designs (core daily flow)

Routes are under basename `/web`. Legacy mobile path redirects are **not** carried
over (fresh app, fresh URLs).

### Login (`@web/pages/Login`)

Centered desktop card on a brand-gradient backdrop (wider than mobile, no
safe-area insets). Email + password (show/hide), error banner, submit spinner,
"Forgot password?" → `/login#forgot?redirect-to=/web`. Calls reused `login()`,
then `window.location.href = '/web'`.

### Today (`@web/pages/Today`)

Multi-column dashboard (reuses `useDashboard`, `useWallet`):

- Top row: progress hero — rebuild the SVG ring wide in `@web` (the mobile `Ring`
  is inline in `Today.tsx`, not importable) + "today done / due" stats; points
  summary card (balance, today/yesterday earned →
  links to Phase-2 marketplace, link inert until Phase 2).
- Main: the user's tasks. Lens switcher (For me / Owned / Led / I'm in) as a
  segmented control or sidebar sub-nav (no horizontal-scroll chips). Status
  filter chips + Today/Overdue/Upcoming grouping rendered as columns or stacked
  sections in the wide area. Task rows reuse `TodoCard`.
- Filters open in a `Popover` (reuse dimensions via `FilterButton` +
  `activeFilterCount`).

### Projects (`@web/pages/Projects`)

Reuses `useProjects`, `canCreateProject`. Search input + status `Segmented`
(Ongoing/Closed/All) + filter `Popover` (brand/owner/leader). Projects grouped by
brand in a responsive **grid** of `ProjectCard`s (or a sortable table — grid is the
v1 default). "New project" button (gated) opens `ProjectFormSheet`'s logic in a
`Dialog`.

### Project (`@web/pages/Project`, `/web/project/:name`)

**Master-detail split** (reuses `useProject`, `useProjectGantt`, `permFlags`):

- Top band: project hero (brand, name, progress bar, counts, deadline,
  owner/leader), "blocked by" banner, action buttons (Edit / Team / Delete, perm-
  gated) opening dialogs/drawers, goal card, team workload strip (avatars →
  `Drawer` with `useMemberWorkload`).
- Left pane: project details + their tasks as a **tree/table** with List/Gantt
  toggle (Gantt reuses `GanttChart`), All/Open/Completed filter. +Detail / +Todo
  buttons (perm-gated) open dialogs (reuse `useCreateProjectDetail`,
  `useCreateProjectItem`).
- Right pane: the selected task's detail (the Project Item view, below). Falls
  back to a project-level `CommentThread` when nothing is selected.

**Routing for the split:** the project page owns the left pane; the right pane is
a **nested route**. `/web/project/:name` shows the project with an empty right
pane; `/web/project/:name/item/:itemName` keeps the same project shell and renders
the item in the right pane (React Router `<Outlet>`). The standalone wide route
`/web/project-item/:itemName` renders the same `ProjectItem` component
full-width (no left pane) for deep links / Today/Review navigation. Selecting a
task in the left pane `navigate`s to the nested URL (back button works; URL is
shareable). Same pattern for `/web/project-detail/:name`.

### Project Detail / Project Item

- A Project Detail (`/web/project-detail/:name`, reuses `useProjectDetail`) when
  opened standalone shows its header (sanitized `current_condition` /
  `expected_outcome`) + its tasks table + `CommentThread`.
- A Project Item (`/web/project-item/:name`, reuses `useProjectItem`,
  `useAdvanceStatus`, `useUpdateTodo`, `useSetTodoAllocations`, `useSaveNotes`,
  `useFocusTimer`) renders in the right pane **and** is deep-linkable as its own
  wide route. Two columns:
  - Left: workflow `Stepper` over `STATUS_ORDER` + advance button (or "waiting on
    someone else" locked state); stat grid (assignee, deadlines, estimate,
    group/level/points); day allocations (editable for assignee, read-only
    otherwise); Focus mode (overlay reused/rebuilt).
  - Right: notes editor (autosave on blur), activity timeline, `CommentThread`.
  - Edit opens an inline form or `Dialog` (reuse `useUpdateTodo`); fields lock
    once Done, same as mobile.

### Review (`@web/pages/Review`)

Reuses `useDashboard().data.review`. Approval queue as a **table** grouped by
project, sorted by deadline ascending, with inline advance/approve (reuse
`useAdvanceStatus`) and a filter `Popover` (project/brand/assignee). Empty states
preserved.

### Me (`@web/pages/Me`)

Profile (name, avatar, roles from `useBoot`), theme toggle, change-password
`Dialog` (reuse `useChangeMyPassword`), logout (reused `logout()` → reload),
link to the mobile app at `/m`. No onboarding-replay in v1.

---

## Deferred phases

- **Phase 2:** Reports (filter card + **data tables**, reuse `useReportOptions` /
  `useReport`), Wallet, Leaderboard, Marketplace (reuse the points hooks).
- **Phase 3:** Admin — Users, Brands, Groups, Marketplace admin, Grant points.
  Note: add `useGrantPoints` / `useGrantUsers` wrapper hooks (or call the api
  methods directly) since `useData.ts` lacks them.

Each later phase reuses the same `AppShell`, overlay primitives, and data hooks;
only new pages + sidebar entries (some role-gated via the reused `can*` helpers)
are added.

---

## Testing

Per the live-site / code-first convention: no test DB, defer formal automated
tests to a final phase. During build, verify each screen against the running site
(`project.vernon.id/web`) — auth gate, the three core flows (advance a task, edit
notes/allocations, drill project → detail → item), permission-gated actions, and
that `/m` is unaffected.

## Risks & mitigations

- **Alias coupling** between the two app dirs — if a shared mobile file gains a new
  `@/` import to a *mobile-chrome* file, the web build could pull in phone layout.
  Mitigation: web only imports from the reused-list above; treat that list as the
  contract.
- **Sheet→Dialog parity** — rebuilt forms must match the sheets' fields/validation
  exactly. Mitigation: forms call the identical mutation hooks; diff field-by-field
  against each sheet during build.
- **CSS bleed** — shared components carry Tailwind classes; `CommentThread` still
  uses legacy `gray-*` with no dark mode (flagged in the map). Mitigation: web
  ships the same Tailwind config/tokens; fix `CommentThread` dark mode in web's own
  wrapper if it surfaces (without editing the mobile file).
- **CSRF / session** — identical to mobile (Jinja-injected token, session auth);
  no new surface.
