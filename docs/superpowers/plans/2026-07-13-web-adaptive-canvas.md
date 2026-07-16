# /w Adaptive Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the /w soft-pop redesign: adaptive content widths, denser tables, hover/stagger motion polish, 2-col Home command center on xl.

**Architecture:** Render-only changes in `frontend-web/` (`@web`). Width ownership moves from a fixed `max-w-6xl` in `AppShell` to a route→width map inside `AppShell` (spec §1 amended: 37 pages don't render `<Page>`, so a `Page` prop can't carry width). Density/motion land in shared web primitives (`DataTable`, `Card`, `Page`, tailwind.config); Home/Review/Reports/Projects get hand edits.

**Tech Stack:** React 18 + TS, Tailwind, vite. No new dependencies.

## Global Constraints

- Shared `@` components (`../frontend/src`, the /m app) are OFF LIMITS — edit only `frontend-web/**`.
- No native `<select>`, no `alert()` (project conventions).
- Live site: no test suite for this pass (project convention); per-task check = `npx tsc --noEmit` clean from `frontend-web/`.
- `rise()` helper is a trivial pure one-liner — exempt from a dedicated test (ponytail).
- Do NOT `git add` files you didn't touch — user works in parallel; working tree already has unrelated modified build artifacts.
- All commits end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01XXKG4Te8Mu1tNpiB7J1bM6`

---

### Task 1: Route→width map in AppShell

**Files:**
- Modify: `frontend-web/src/components/AppShell.tsx:49-53`
- Modify: `frontend-web/src/components/Page.tsx:5-6` (comment only)

**Interfaces:**
- Produces: `<main>` width now varies by route — `/project*` full-bleed, `/`, `/review`, `/reports*`, `/report/*` at `max-w-7xl`, everything else unchanged at `max-w-6xl`. Later tasks rely on this (no page passes width anywhere).

- [ ] **Step 1: Add width map + apply**

In `AppShell.tsx`, add import and helper above `export function AppShell()`:

```tsx
import clsx from 'clsx'

// Content-type width: workspaces full-bleed, table/grid-heavy routes wide,
// feeds stay at the readable 6xl cap. Route-based because most pages don't
// render <Page> — the shell is the only place that always wraps content.
function mainWidth(path: string): string {
  if (path.startsWith('/project/') || path === '/projects') return ''
  if (path === '/' || path === '/review' || path === '/reports' ||
      path.startsWith('/reports/') || path.startsWith('/report/')) return 'max-w-7xl'
  return 'max-w-6xl'
}
```

Replace the `<main>` line:

```tsx
      <main className={clsx('mx-auto w-full px-4 py-6 pb-28 lg:px-6', mainWidth(pathname))}>
```

(`pathname` already exists from `useLocation()` at the top of `AppShell`.)

- [ ] **Step 2: Update Page.tsx LOCKED comment**

Replace the comment at `Page.tsx:5-6` with:

```tsx
  // Full width within the shell column; AppShell's route→width map owns the
  // outer cap (feed 6xl / wide 7xl / full). Narrow pages pass their own max-w.
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend-web && npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/components/AppShell.tsx frontend-web/src/components/Page.tsx
git commit -m "feat(web): route-based adaptive content width (feed/wide/full)"
```

---

### Task 2: DataTable density + hover accent

**Files:**
- Modify: `frontend-web/src/components/DataTable.tsx:64,88,95`

**Interfaces:**
- Consumes: nothing new. Produces: every DataTable consumer gets ~36px rows automatically.

- [ ] **Step 1: Tighten paddings + add hover accent**

Header `<th>` (line 64): `'px-4 py-3 font-medium'` → `'px-3 py-2.5 font-medium'`.

Body `<td>` (line 95): `'px-4 py-3 align-middle'` → `'px-3 py-2 align-middle'`.

Clickable row (line 88): change

```tsx
                  onRowClick && 'cursor-pointer hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04]',
```

to

```tsx
                  onRowClick && 'cursor-pointer hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04] hover:shadow-[inset_2px_0_0_#6366f1]',
```

(`#6366f1` = brand-500; inset shadow avoids the 2px layout shift a border would cause.)

- [ ] **Step 2: Typecheck**

Run: `cd frontend-web && npx tsc --noEmit` — clean.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/components/DataTable.tsx
git commit -m "feat(web): denser DataTable rows + brand hover accent"
```

---

### Task 3: Elevation, motion, type tokens

**Files:**
- Modify: `frontend-web/tailwind.config.js:36-41` (boxShadow)
- Modify: `frontend-web/src/components/Card.tsx:23-27`
- Modify: `frontend-web/src/components/Page.tsx` (h1 size + new `rise` export)

**Interfaces:**
- Produces: `rise(i: number): { className: string; style: { animationDelay: string } }` exported from `@web/components/Page` — Tasks 4–5 spread it onto card wrappers. Shadow utility `shadow-card-hover`.

- [ ] **Step 1: Add hover shadow tier**

In `tailwind.config.js` `boxShadow`, after the `card` line add:

```js
        'card-hover': '0 6px 20px -4px rgb(120 80 40 / 0.12), 0 2px 6px -1px rgb(120 80 40 / 0.07)',
```

- [ ] **Step 2: Card hover lift + focus ring**

In `Card.tsx`, change

```tsx
        onClick && 'active:scale-[0.99]',
```

to

```tsx
        onClick && 'active:scale-[0.99] hover:-translate-y-px hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
```

- [ ] **Step 3: Bigger display title + rise helper**

In `Page.tsx` PageHeader h1: `text-[1.7rem]` → `text-[1.85rem]`.

At the bottom of `Page.tsx` add:

```tsx
// Stagger entrance for card feeds: spread onto each item's wrapper div.
// Delay caps at item 8 so long feeds don't crawl in.
export const rise = (i: number) => ({
  className: 'animate-rise',
  style: { animationDelay: `${Math.min(i, 8) * 40}ms` },
})
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend-web && npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/tailwind.config.js frontend-web/src/components/Card.tsx frontend-web/src/components/Page.tsx
git commit -m "feat(web): card-hover elevation, hover lift, rise() stagger, bigger page titles"
```

---

### Task 4: Home — 2-col command center on xl

**Files:**
- Modify: `frontend-web/src/pages/Home.tsx:399-703` (the main `return`)

**Interfaces:**
- Consumes: Task 1 (Home route `/` is now `max-w-7xl`). No API/data changes; pure JSX re-nesting — every existing element keeps its props and handlers.

- [ ] **Step 1: Split body into main column + aside**

Inside `<Page className="space-y-6">`, keep in order at top level: `PageHeader`, `WebBanners`, shortfall alert, `MeetingReminder` (all span full width). Then wrap EVERYTHING from the stat-tile grid down to (and including) the Jump-to block in:

```tsx
      <div className="space-y-6 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-6 xl:space-y-0">
        <div className="min-w-0 space-y-6">
          {/* stat tiles, lens switcher, lens bodies ('me' / 'owned' / 'led' / 'in') */}
        </div>
        <aside className="space-y-6">
          {/* This week recap, VerseCard, Today's meetings, Attendance, Jump to */}
        </aside>
      </div>
```

Move blocks verbatim (JSX untouched except the grid-class tweaks in Step 2):
- **main column**: stat-tile grid → lens switcher → the four lens bodies.
- **aside**: `{r && <Card title="This week" ...>}` → `<VerseCard />` → Today's meetings `Card` → `{attToday && ...}` Attendance `Card` → Jump-to `<div>`.

Drawers/sheets at the bottom (`PlanDayDrawer`, `QuickCreate`, `MarkDoneSheet`, `MeetingSheet`) stay at `Page` top level.

Below-xl note: side-rail content now stacks AFTER the work list (recap/verse used to sit above the lens switcher). Accepted deviation — recorded in spec §4.

- [ ] **Step 2: Grid tweaks for the narrow rail**

- Stat tiles (line ~456): `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6` → `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-3`.
- Recap MiniStat grid (line ~468): `grid grid-cols-2 gap-3 sm:grid-cols-4` → `grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2`.
- Jump-to leaf grid (line ~674): `grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6` → `grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-2`.

- [ ] **Step 2b: Stagger the work list**

Import `rise` (`import { Page, PageHeader, rise } from '@web/components/Page'`) and in the 'me' lens change

```tsx
            <CardList>
              {rows.map((t) => <TodoCard key={t.name} todo={t} />)}
            </CardList>
```

to

```tsx
            <CardList>
              {rows.map((t, i) => (
                <div key={t.name} {...rise(i)}>
                  <TodoCard todo={t} />
                </div>
              ))}
            </CardList>
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend-web && npx tsc --noEmit` — clean.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/Home.tsx
git commit -m "feat(web): Home 2-col command center on xl (work left, pulse rail right)"
```

---

### Task 5: Review + Reports stagger; wider project rail

**Files:**
- Modify: `frontend-web/src/pages/Review.tsx:250` (plain-card branch)
- Modify: `frontend-web/src/pages/Reports.tsx:22-37`
- Modify: `frontend-web/src/pages/ProjectsWorkspace.tsx:16`

**Interfaces:**
- Consumes: `rise` from `@web/components/Page` (Task 3), widths from Task 1.

- [ ] **Step 1: Review stagger**

Import `rise`: `import { Page, PageHeader, rise } from '@web/components/Page'`.

Change the map to expose the index — `{visible.map((t) =>` → `{visible.map((t, i) =>` — and the plain (non-selectMode) branch from

```tsx
              <TodoCard key={t.name} todo={t} showAssignee />
```

to

```tsx
              <div key={t.name} {...rise(i)}>
                <TodoCard todo={t} showAssignee />
              </div>
```

(Select-mode branches keep no stagger — they re-render on every toggle.)

- [ ] **Step 2: Reports stagger**

Import: `import { Page, PageHeader, rise } from '@web/components/Page'`.

Wrap the bespoke Todos Due card: `<div {...rise(0)}><Card onClick={...} ... /></div>`, and the mapped cards:

```tsx
        {REPORTS.map((r, i) => (
          <div key={r.name} {...rise(i + 1)}>
            <Card
              onClick={() => navigate(`/report/${encodeURIComponent(r.name)}`)}
              eyebrow={<ReportBadge icon={r.icon} accent={r.accent} />}
              title={r.title}
              meta={r.desc}
            />
          </div>
        ))}
```

(remove the `key` from `Card` — it moves to the wrapper div.)

- [ ] **Step 3: Wider rail on xl**

`ProjectsWorkspace.tsx:16`: both `lg:w-64` occurrences → `lg:w-64 xl:w-72`.

- [ ] **Step 4: Typecheck**

Run: `cd frontend-web && npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/Review.tsx frontend-web/src/pages/Reports.tsx frontend-web/src/pages/ProjectsWorkspace.tsx
git commit -m "feat(web): stagger Review/Reports feeds, wider project rail on xl"
```

---

### Task 6: Build, deploy, verify

**Files:**
- Build outputs under `vernon_project/public/frontend_web/` + `vernon_project/www/w.html` (generated).

- [ ] **Step 1: Build**

Run: `cd frontend-web && npm run build`
Expected: vite build succeeds, new hashed assets in `vernon_project/public/frontend_web/assets/`.

CAUTION: working tree already holds unrelated modified build artifacts (assign-overload pass, user-pending). Building regenerates them together — that is fine (source for both is committed), but say so in the commit message.

- [ ] **Step 2: Commit build artifacts**

```bash
git add vernon_project/public/frontend_web vernon_project/www/w.html
git commit -m "build(web): adaptive-canvas bundle (includes pending assign-overload rebuild)"
```

- [ ] **Step 3: Purge Cloudflare + verify bundle**

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/<cloudflare-zone-id>/purge_cache" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

Expected: `"success":true`.

Then verify the live bundle is non-zero (poisoned-cache gotcha):

```bash
curl -sI "https://project.vernon.id/assets/frontend_web/assets/$(ls /home/frappe/frappe-bench/apps/vernon_project/vernon_project/public/frontend_web/assets | grep '^index-.*\.js$')" | grep -i content-length
```

Expected: content-length well above 0 (hundreds of KB).

- [ ] **Step 4: Spot-check live**

Open `https://project.vernon.id/w` desktop-width: Home 2-col at ≥1280px, `/review` + `/reports` wider with stagger, `/projects` full-bleed, one untouched page (e.g. `/leaderboard`) still centered 6xl, dark mode sane. Report anything off instead of claiming done.
