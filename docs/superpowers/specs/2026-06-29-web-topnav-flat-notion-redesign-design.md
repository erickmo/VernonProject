# /w Web App — Top-Nav + Flat-Notion Redesign

**Date:** 2026-06-29
**Surface:** `frontend-web/` (the `/w` desktop web app; basename `/w`)
**Goal:** Replace the left sidebar with a top navbar + mega dropdowns, migrate the colorful bento aesthetic to a flat minimalist Notion-like system, and enhance the main area for speed of work and visibility of data relations.

## Context (current state)

- **Shell:** `frontend-web/src/components/AppShell.tsx` — left sidebar (`w-60`) holding three nav groups (`MAIN`, `REWARDS`, permission-gated `admin`) + a slim desktop topbar (breadcrumb, ⌘K search, notification bell, wallet pill). Mobile renders the same sidebar in a slide-in drawer.
- **Design:** bento grid everywhere. Primitives in `frontend-web/src/components/bento.tsx`: `BentoGrid`, `BentoTile` (`rounded-3xl`, `shadow-card`, 7-accent × 4-tone system), `BentoStat`. ~50 pages each render one `BentoGrid`.
- **Tokens:** `frontend-web/tailwind.config.js` — indigo `brand` ramp, `font-sans: Inter` **declared but never loaded** (no `<link>`/`@import`; falls back to `system-ui`), `shadow-card`/`shadow-nav`. Surfaces hardcoded `bg-white dark:bg-slate-900`; body `#f1f5f9`/`#0f172a`. Warm `paper-*` tokens exist only in the **mobile** config (`frontend/tailwind.config.js`), not web.
- **Routing:** `frontend-web/src/App.tsx` — react-router, ~50 routes nested under `<AppShell>` Outlet. Permission gates from `useData` (`canManageUsers`, `canManageGroups`, `canManageBrands`, `canManageBadges`, `canManageMarketplace`, `canGrantPoints`, `canManageAttendance`).
- **Data:** TanStack Query v5 + shared hooks in `frontend/src/hooks/useData.ts` (aliased `@`); HTTP via `frontend/src/lib/api.ts`. Web aliases: `@` → `../frontend/src` (shared/mobile), `@web` → `frontend-web/src`.
- **Existing reusable pieces to keep:** `overlays/Popover.tsx`, `overlays/Drawer.tsx`, `overlays/Dialog.tsx`, `CommandPalette.tsx` (⌘K, nav+projects), `lib/crumbs.tsx` (`useSetCrumbs`/`useCrumbs`), `useAdvance()` provider, `@web/components/ui` (`Button`/`IconButton`/`OverflowMenu`/`Field`/`rowButtonProps`), shared `@/components/ui` (`Avatar`/`EmptyState`/`Segmented`/`Pill`/`ProgressBar`/`SearchableSelect`).

## Decisions (locked with user)

1. **Aesthetic = Flat Notion.** Replace colorful tiles with flat surfaces: hairline borders, whitespace, monochrome + one accent, tables/lists over tiles.
2. **Top navbar with 5 mega menus**, sidebar retired. Grouping: **Work / Rewards / Reports / Admin / Attendance** (Admin & Attendance only render when the matching permission gate passes).
3. **All four main-area enhancements:** global quick-create, power command palette, inline edit on lists, relation context.
4. **Scope = Everything** — all ~50 pages reach a consistent flat baseline this pass; the 4 highest-traffic pages get bespoke Notion document layouts.

## Architecture

### A. Design system (foundation)

**A1. Tokens** — rewrite `frontend-web/tailwind.config.js` to a flat Notion palette. Add CSS variables in `frontend-web/src/index.css` for light/dark so surfaces stop being hardcoded:

| Token | Light | Dark |
|---|---|---|
| `canvas` (page bg) | `#ffffff` | `#191919` |
| `surface` (raised card/popover) | `#ffffff` | `#202020` |
| `ink` (primary text) | `#37352f` | `#e9e9e7` |
| `muted` (secondary text) | `#787774` | `#979793` |
| `line` (hairline border) | `#e9e9e7` | `rgba(255,255,255,.09)` |
| `hover` (row/item hover) | `rgba(0,0,0,.04)` | `rgba(255,255,255,.055)` |
| accent | `brand` indigo `#6366f1`/`#4f46e5` (kept) | same |

- Radius: `rounded-md` (controls), `rounded-lg` (cards/popovers). Drop `rounded-3xl`.
- Shadows: remove `shadow-card` from cards (use `border border-line`); keep one soft shadow token for floating popovers only.
- Collapse the 7-accent tile system to **neutral + single accent**. The `Accent` type and per-page `accent=` props remain (no mass page edits), but in flat mode accent only tints faintly (e.g. icon color or a thin left rule), never a full colored tile.
- Fun, deliberately preserved: lucide icons in indigo, emoji on badges/achievements, gentle hover lift, amber wallet pill, the `pop` micro-animation on create.

**A2. Load the font.** Add Inter (weights 400–700) via the same Google Fonts `<link>` approach the mobile app uses in `frontend/index.html`, into `frontend-web/index.html`. This is a no-cost win since `Inter` is already the declared `font-sans`.

**A3. Flatten the bento primitives in place** — edit `frontend-web/src/components/bento.tsx` only; do **not** touch the ~50 consuming pages in this step. Result: every page flattens at once.
- `BentoTile`: default `bg-surface border border-line rounded-lg`, no shadow, tighter padding. `tone` `gradient`/`solid` → desaturated subtle (no gradients, no saturated fills). `tall`/`span` honored as-is.
- `BentoStat`: flat number, smaller scale, `tabular-nums` kept.
- `BentoGrid`: keep responsive grid, reduce `gap`, lighter rows.

**A4. New shared primitives** (in `@web/components/`, the reuse wins):
- `DataTable` (`@web/components/DataTable.tsx`) — one flat table: sticky header, hairline rows, hover, sort, empty state (`EmptyState`), and **editable cells**. Cell renderers: text, status (`STATUS` pill + advance), assignee (avatar + `SearchableSelect`), date (`<input type="date">`), and `EntityChip`. Replaces the ~10 hand-written `<table>`s (`Users`, `Groups`, `ReportPage`, `Review`, `Leaderboard`, `WalletLog`, `MarketplaceAdmin`, `Stations`, `AttendanceReport`, `AttendanceProfiles`).
- `Page` / `PageHeader` / `Section` (`@web/components/Page.tsx`) — Notion document scaffold: optional icon/emoji + title + actions row; `Section` = titled block with optional divider. Replaces ad-hoc page wrappers on the bespoke pages.
- `Property` / `PropertyRow` (`@web/components/Property.tsx`) — Notion key→value rows (label left, value chip right) for detail metadata (status, owner, leader, dates, brand).
- `EntityChip` (`@web/components/EntityChip.tsx`) — a linked-record chip (icon + label, navigates to the record) with an attached `HoverCard` preview.
- `HoverCard` (`@web/components/HoverCard.tsx`) — hover-triggered preview panel; reuses `overlays/Popover` positioning. Closes on mouse-leave with a small delay.

### B. Top navbar + mega menu (shell)

Replace the sidebar in `AppShell.tsx` with a top navbar.

- **`TopNav` (`@web/components/TopNav.tsx`):** sticky bar — left: Vernon logo (→ `/`). Center/left: top-level menu items **Work▾ · Rewards▾ · Reports · Admin▾ · Attendance▾**. Right cluster: ⌘K search button, **+ New** (quick-create, §C1), `NotificationBell`, amber wallet pill (→ `/wallet`), avatar menu (→ `/me`, theme toggle, logout — relocated from the old sidebar footer).
- **`MegaMenu` (`@web/components/MegaMenu.tsx`):** a `Popover`-anchored multi-column panel; opens on click (and hover-intent on desktop). Each entry = icon + label + one-line sublabel, arranged in columns. Closes on route change / outside-click / Esc.
- **Menu group definitions** move from the `MAIN`/`REWARDS`/`admin` arrays into a single `NAV_GROUPS` config:
  - **Work** (dropdown, always): Today, Calendar, Projects, Review (badge), Meetings, Notes, Send feedback.
  - **Rewards** (dropdown, always): Leaderboard, Team Wall, Marketplace, Wallet, Gift Points.
  - **Reports** (single link, always): Reports — no dropdown.
  - **Admin** (any of the management gates true): Users, Feedback inbox, Groups, Data Health, Settings, Brands, Gamification Settings, Marketplace Admin, Grant Points.
  - **Attendance** (`canManageAttendance`): Attendance Report, Schedules, Stations, Leave/WFH, Holidays, Enrolled.
- **Active state:** flat — current top-level item gets ink text + a thin underline/indigo accent; others muted. The 7-color `ACTIVE_PILL` map is removed.
- **Breadcrumb context bar:** a slim bar directly under `TopNav` rendering `useCrumbs()` (same data, same `buildCrumbs` fallback). Keeps page-set breadcrumbs working unchanged.
- **Mobile (`<lg`):** hamburger → full-screen sheet listing the same `NAV_GROUPS` (gated identically). Right cluster collapses to search + bell + avatar. Sidebar markup deleted.
- **Content wrapper:** `<main>` keeps `<Outlet/>`; width gains a comfortable max-width container (Notion-like centered column) with the existing responsive horizontal padding.

### C. Speed features

**C1. Global quick-create** (`@web/components/QuickCreate.tsx`): the navbar **+ New** button and a `c` keyboard shortcut open a small menu (Task / Note / Project). Selecting one opens the existing Drawer form (`CreateProjectItemDialog`, `NoteForm`, `ProjectFormDialog`), context-prefilled from the current route (active project, today's date). Reuses existing drawers — no new form logic.

**C2. Power command palette** — extend `CommandPalette.tsx` from nav+projects to:
- **Records:** projects (existing `useProjects`), plus todos and users via existing search hooks/endpoints in `useData`/`api` (lazy-queried on input, debounced).
- **Actions:** a static command registry — advance a todo, open quick-create, jump to a section — alongside the navigable pages.
- Reuses the current fuzzy `includes` filter + arrow-key nav + grouped sections. Results grouped: Actions / Pages / Projects / Todos / People.

**C3. Inline edit on lists** — implemented through `DataTable` editable cells (§A4) and applied to the master-detail todo lists in `Project.tsx` / `ProjectDetail.tsx`:
- Status cell → advance via existing `useAdvance()` (confirm + invalidation) — never raw mutation.
- Assignee cell → `SearchableSelect` in a `Popover`, writes via the existing update mutation in `useData`.
- Date cell → native `<input type="date">`, same mutation path.
- All writes go through existing `useData` mutations so cache invalidation stays correct.

### D. Relation context

- `EntityChip` (§A4) used wherever a record names another: todo→project, todo→assignee, project→brand/owner/leader, ledger→user. Each chip navigates and shows a `HoverCard` preview (title + a few key properties).
- **Relations rail** on `Project.tsx` / `ProjectDetail.tsx` / `ProjectItem`: a right-column `Section` listing linked records grouped by type (Details, Todos, Team, Brand, Comments), each row an `EntityChip`. Complements the existing master-detail `<Outlet/>` (rail = overview of links; Outlet = focused record).
- Property rows (§A4) on detail pages render owner/leader/assignee as `EntityChip`s, so relations are visible at a glance.

### E. Bespoke Notion document layouts (4 pages)

- **`Today.tsx`:** greeting header + a compact inline stat strip (Due/Overdue/Upcoming/To-review as plain numbers, not colored tiles) + flat task lists (`Overdue` / `Today` / `Upcoming`) using row items with `EntityChip` project links and inline status. Keep the lens `Segmented` + filter `Popover`. Drop the gradient hero ring (or render it minimal/mono).
- **`Projects.tsx`:** flat list grouped by brand (collapsible `<section>`s preserved, `localStorage` state preserved); each group a `DataTable` (name, progress, owner chip, status — inline editable where allowed) or compact rows. "New project" via quick-create.
- **`Project.tsx` / `ProjectDetail.tsx`:** `Page` + `PageHeader` (title, actions) + `PropertyRow` (status/owner/leader/dates/brand as chips) + body (rich-HTML meta sections kept, flat) + a todo `DataTable` (inline edit + relation chips) + **Relations rail**. Master-detail `<Outlet/>` retained for the focused item; Gantt toggle retained.

### F. Sweep the rest (~45 pages)

1. All pages already flat from §A3 (primitive restyle) — baseline consistent immediately.
2. Migrate the ~10 hand-written `<table>` pages to `DataTable`.
3. Walk every route; fix any page whose bento layout reads awkwardly when flat (e.g. pages leaning on `tone='solid'`/`gradient` for emphasis) by swapping to `Section`/`PropertyRow` where it improves clarity.
4. QA pass across all routes in light + dark.

## Build order (phases → maps to implementation plan)

- **P0 Foundation:** A1 tokens, A2 font, A3 flatten bento, A4 new primitives (`DataTable`, `Page`/`Section`, `Property`, `EntityChip`, `HoverCard`).
- **P1 Shell:** B — `TopNav`, `MegaMenu`, `NAV_GROUPS`, breadcrumb bar, mobile sheet; delete sidebar.
- **P2 Speed:** C1 quick-create, C2 power palette, C3 inline-edit cells.
- **P3 Relations:** D — `EntityChip` rollout, hover previews, relations rail.
- **P4 Key pages:** E — Today, Projects, Project, ProjectDetail.
- **P5 Sweep:** F — table migrations + per-route flat fixes + light/dark QA.

## Non-goals

- No backend/API changes — pure frontend; all data via existing `useData` hooks + `api`.
- No changes to the mobile `/m` app (`frontend/`) or its config. The `@` alias is consumed read-only.
- No new data fetching layer; reuse TanStack Query + `useData`.
- Bespoke document layouts limited to the 4 §E pages; remaining pages get the flat baseline, not custom redesigns (expandable on request).

## Risks / watch-items

- **Shared-component token coupling:** pages pull shared `@` components that reference mobile `paper-*`/`stone-*`/`font-display` tokens absent from the web config (today they render transparent/fallback). Flattening must not assume those exist; define web equivalents or neutral fallbacks where a shared component leaks them.
- **Accent prop churn:** keep the `accent` prop accepted (pages pass it) even though flat mode largely ignores it — avoids editing 50 pages.
- **Inline-edit correctness:** all row writes must route through existing `useAdvance`/`useData` mutations for cache invalidation; no direct `api` calls from cells.
- **Permission gating parity:** `NAV_GROUPS` must reproduce the exact gate logic from the current `admin` array so no item appears/disappears for the wrong role.
- **Deploy:** npm build writes `public/` + `www/w.html`, deploys live immediately on the single live site (no staging). Verify before/after on a few key routes.

## Testing

Deferred per project convention (single live site, no test DB) until a final phase. Minimal runnable checks where logic is non-trivial: command-palette fuzzy match and inline-edit mutation wiring. Primary verification = manual QA across routes in light/dark after each phase build.
