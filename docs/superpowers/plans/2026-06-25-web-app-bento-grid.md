# Web App Bento Grid Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all ~25 web (`/w`, `frontend-web/`) pages to a playful, colorful bento-grid layout driven by a shared `BentoGrid`/`BentoTile` primitive and a domain-accent system.

**Architecture:** A single web-only primitive module (`bento.tsx`) provides the grid, tile, and stat components plus an accent/tone token map. Every page is restructured into one `BentoGrid` of mixed-span tiles. Old `layout.tsx` primitives are superseded and removed at the end. No backend, route, or mobile changes.

**Tech Stack:** React 18 + TypeScript, react-router-dom, Tailwind (custom `brand` palette, `shadow-card`), Vite, lucide-react, clsx.

## Global Constraints

- **Web-only.** Touch `frontend-web/src/` only. Do NOT edit shared `frontend/src/` components except to wrap their *usage* in a tile on the web side. Any unavoidable shared edit must keep mobile (`/m`) working. (Spec §1 non-goals.)
- **No data/route/logic changes.** Presentation only. Existing hooks, filters, popovers, forms, navigation targets unchanged. (Spec §1.)
- **Bento primitives import path:** `@web/components/bento`. (`@web` → `frontend-web/src`.)
- **Span tokens only.** Pages use `span` props (`sm|md|lg|wide|full` + `tall`), never raw `col-span-*`. (Spec §2.2.)
- **Accent by domain, deterministic** (Spec §2.3): Today/calendar/review=`brand`, points/wallet/gift/grant=`amber`, leaderboard/badges/Me=`violet`, projects/project detail/items=`sky`, marketplace/rewards=`emerald`, users=`rose`, groups/brands/reports/admin=`slate`. Status tiles reuse `STATUS` from `@/lib/status`.
- **Tone discipline:** ≤2 `solid`/`gradient` tiles per page; rest `plain`/`tint`. (Spec §2.4.)
- **Dark mode required** on every tile (handled by primitives; verify per page).
- **Test cycle = build + visual check.** This is a frontend visual redesign on a live, test-DB-less site (memory: `vernon-live-site-codefirst`, defer unit tests). Each task's "test" is: `cd frontend-web && npm run build` succeeds, then visual check of the named page in light + dark with no console errors and existing interactions intact. No unit tests are added.
- **Deploy mechanics:** `npm run build` writes hashed assets to `vernon_project/public/frontend_web/assets/` and copies `index.html` → `vernon_project/www/w.html` (memory: `vernon-deploy-mechanics`). Commit the regenerated `public/` + `www/w.html` with each page batch.
- **Commit cadence:** one commit per task. Message trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01PRUT1nQHBci8S4NpzLpMsV`.

---

## Phase P0 — Primitives

### Task P0.1: Create bento primitives

**Files:**
- Create: `frontend-web/src/components/bento.tsx`

**Interfaces:**
- Produces:
  - `type Accent = 'brand'|'amber'|'violet'|'sky'|'emerald'|'rose'|'slate'`
  - `type Tone = 'plain'|'tint'|'gradient'|'solid'`
  - `type Span = 'sm'|'md'|'lg'|'wide'|'full'`
  - `BentoGrid({ children, className? })`
  - `BentoTile(props: BentoTileProps)` where `BentoTileProps = { span?: Span; tall?: boolean; tone?: Tone; accent?: Accent; title?: ReactNode; subtitle?: ReactNode; icon?: ComponentType<{className?: string}>; actions?: ReactNode; to?: string; className?: string; children?: ReactNode }`
  - `BentoStat({ value, label, delta?, className? })`

- [ ] **Step 1: Write `bento.tsx`**

```tsx
import type { ReactNode, ComponentType } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'

export type Accent = 'brand' | 'amber' | 'violet' | 'sky' | 'emerald' | 'rose' | 'slate'
export type Tone = 'plain' | 'tint' | 'gradient' | 'solid'
export type Span = 'sm' | 'md' | 'lg' | 'wide' | 'full'

// Full literal class strings so Tailwind's JIT detects them. Never build dynamically.
const SPAN: Record<Span, string> = {
  sm:   'col-span-1 md:col-span-2 xl:col-span-3',
  md:   'col-span-2 md:col-span-3 xl:col-span-4',
  lg:   'col-span-2 md:col-span-3 xl:col-span-6',
  wide: 'col-span-2 md:col-span-6 xl:col-span-8',
  full: 'col-span-2 md:col-span-6 xl:col-span-12',
}

interface ToneSet { tint: string; gradient: string; solid: string }
const ACCENTS: Record<Accent, ToneSet> = {
  brand:   { tint: 'bg-brand-50 dark:bg-brand-500/10',     gradient: 'bg-gradient-to-br from-brand-500/15 to-brand-400/5 dark:from-brand-500/20 dark:to-brand-400/5',         solid: 'bg-brand-500 text-white' },
  amber:   { tint: 'bg-amber-50 dark:bg-amber-500/10',     gradient: 'bg-gradient-to-br from-amber-500/15 to-amber-400/5 dark:from-amber-500/20 dark:to-amber-400/5',         solid: 'bg-amber-500 text-white' },
  violet:  { tint: 'bg-violet-50 dark:bg-violet-500/10',   gradient: 'bg-gradient-to-br from-violet-500/15 to-violet-400/5 dark:from-violet-500/20 dark:to-violet-400/5',     solid: 'bg-violet-500 text-white' },
  sky:     { tint: 'bg-sky-50 dark:bg-sky-500/10',         gradient: 'bg-gradient-to-br from-sky-500/15 to-sky-400/5 dark:from-sky-500/20 dark:to-sky-400/5',                 solid: 'bg-sky-500 text-white' },
  emerald: { tint: 'bg-emerald-50 dark:bg-emerald-500/10', gradient: 'bg-gradient-to-br from-emerald-500/15 to-emerald-400/5 dark:from-emerald-500/20 dark:to-emerald-400/5', solid: 'bg-emerald-500 text-white' },
  rose:    { tint: 'bg-rose-50 dark:bg-rose-500/10',       gradient: 'bg-gradient-to-br from-rose-500/15 to-rose-400/5 dark:from-rose-500/20 dark:to-rose-400/5',             solid: 'bg-rose-500 text-white' },
  slate:   { tint: 'bg-slate-100 dark:bg-slate-800',       gradient: 'bg-gradient-to-br from-slate-500/10 to-slate-400/5 dark:from-slate-700/40 dark:to-slate-800/20',       solid: 'bg-slate-700 text-white' },
}

export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('grid grid-cols-2 md:grid-cols-6 xl:grid-cols-12 gap-4 auto-rows-[minmax(7rem,auto)]', className)}>
      {children}
    </div>
  )
}

export interface BentoTileProps {
  span?: Span
  tall?: boolean
  tone?: Tone
  accent?: Accent
  title?: ReactNode
  subtitle?: ReactNode
  icon?: ComponentType<{ className?: string }>
  actions?: ReactNode
  to?: string
  className?: string
  children?: ReactNode
}

export function BentoTile({
  span = 'md', tall = false, tone = 'plain', accent = 'brand',
  title, subtitle, icon: Icon, actions, to, className, children,
}: BentoTileProps) {
  const toneClass =
    tone === 'plain' ? 'bg-white dark:bg-slate-900'
    : tone === 'tint' ? ACCENTS[accent].tint
    : tone === 'gradient' ? ACCENTS[accent].gradient
    : ACCENTS[accent].solid
  const clickable = !!to
  const cls = clsx(
    SPAN[span], tall && 'row-span-2',
    'rounded-3xl p-5 shadow-card transition flex flex-col text-slate-900 dark:text-slate-50',
    tone === 'solid' && 'text-white dark:text-white',
    toneClass,
    clickable && 'hover:-translate-y-0.5 hover:shadow-lg cursor-pointer',
    className,
  )
  const header = (title || actions || Icon) && (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="h-5 w-5 shrink-0 opacity-80" />}
        {(title || subtitle) && (
          <div className="min-w-0">
            {title && <div className="truncate font-semibold leading-tight">{title}</div>}
            {subtitle && <div className="truncate text-xs opacity-70">{subtitle}</div>}
          </div>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
  const inner = <>{header}{children}</>
  return to
    ? <Link to={to} className={cls}>{inner}</Link>
    : <div className={cls}>{inner}</div>
}

export function BentoStat({ value, label, delta, className }: {
  value: ReactNode; label: ReactNode; delta?: ReactNode; className?: string
}) {
  return (
    <div className={clsx('flex h-full flex-col justify-end', className)}>
      <div className="text-4xl font-bold leading-none tabular-nums xl:text-5xl">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide opacity-70">{label}</div>
      {delta && <div className="mt-1 text-xs opacity-70">{delta}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `cd frontend-web && npm run build`
Expected: build succeeds, no TS errors. (bento.tsx is unused so far — this only proves it type-checks.)

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/components/bento.tsx
git commit -m "feat(web): bento grid primitives (BentoGrid/BentoTile/BentoStat)"
```

### Task P0.2: Demo gallery route (reference for every later tile)

**Files:**
- Create: `frontend-web/src/pages/BentoDemo.tsx`
- Modify: `frontend-web/src/App.tsx` (add `<Route path="/bento-demo" element={<BentoDemo />} />` inside the `AppShell` route block; import at top)

**Interfaces:**
- Consumes: `BentoGrid`, `BentoTile`, `BentoStat`, `Accent`, `Tone`, `Span` from `@web/components/bento`.

- [ ] **Step 1: Write `BentoDemo.tsx`** — renders every span, every tone × every accent, and a `BentoStat` example, so reviewers can eyeball the system in light + dark.

```tsx
import { BentoGrid, BentoTile, BentoStat, type Accent, type Tone, type Span } from '@web/components/bento'

const ACCENTS: Accent[] = ['brand', 'amber', 'violet', 'sky', 'emerald', 'rose', 'slate']
const TONES: Tone[] = ['plain', 'tint', 'gradient', 'solid']
const SPANS: Span[] = ['sm', 'md', 'lg', 'wide', 'full']

export default function BentoDemo() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Bento demo</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">Spans</h2>
        <BentoGrid>
          {SPANS.map((s) => (
            <BentoTile key={s} span={s} tone="tint" accent="brand" title={s}>
              <BentoStat value={s} label="span" />
            </BentoTile>
          ))}
        </BentoGrid>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">Tones × accents</h2>
        <BentoGrid>
          {ACCENTS.flatMap((a) =>
            TONES.map((t) => (
              <BentoTile key={a + t} span="sm" tone={t} accent={a} title={`${a}`} subtitle={t}>
                <BentoStat value="42" label={`${a}/${t}`} />
              </BentoTile>
            )),
          )}
        </BentoGrid>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Add the route in `App.tsx`** (next to `/calendar`):

```tsx
// at top with other page imports:
import BentoDemo from '@web/pages/BentoDemo'
// inside <Route element={<AppShell />}> ...:
<Route path="/bento-demo" element={<BentoDemo />} />
```

- [ ] **Step 3: Build**

Run: `cd frontend-web && npm run build`
Expected: success.

- [ ] **Step 4: Visual check** — open `/w/bento-demo` (or via the SPA `/bento-demo`) in light and dark. Confirm: all 5 spans size correctly at desktop width; all 7 accents × 4 tones render with readable text; `solid` tiles have white text; dark mode tints visible. No console errors.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/BentoDemo.tsx frontend-web/src/App.tsx vernon_project/public/frontend_web vernon_project/www/w.html
git commit -m "feat(web): bento demo gallery at /bento-demo"
```

---

## Phase P1 — AppShell chrome

### Task P1.1: Restyle AppShell to bento chrome

**Files:**
- Modify: `frontend-web/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: nothing new. Uses existing nav config + `brand` accent classes already present.

Restyle only — no structural/route/responsive-behavior change. Concretely:
- Nav items: rounded-2xl pills; active item uses its **domain accent** tint (map route→accent per Global Constraints; a small `NAV_ACCENT: Record<string, Accent>` lookup keyed by route prefix). Inactive: `text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800`.
- Sidebar/topbar surface: `rounded-3xl`/`shadow-card` to match tiles where it sits over content; keep existing layout widths and the mobile collapse logic untouched.
- Keep all existing `aria-*`, focus-ring, and theme-toggle behavior.

- [ ] **Step 1:** Add `NAV_ACCENT` lookup and apply accent tint to the active nav item's existing className branch (the line currently using `bg-brand-50 ... text-brand-600`). Map: `/`,`/calendar`,`/review`→brand; `/wallet`,`/gift-points`,`/grant-points`→amber; `/leaderboard`,`/me`,`/badge-settings`→violet; `/projects`,`/project`→sky; `/marketplace`→emerald; `/users`→rose; `/groups`,`/brands`,`/reports`→slate. Default brand.
- [ ] **Step 2:** Apply `rounded-2xl` to nav item containers; bump relevant surfaces to `rounded-3xl shadow-card`.
- [ ] **Step 3: Build** — `cd frontend-web && npm run build` → success.
- [ ] **Step 4: Visual check** — every nav route shows correct accent active-state; mobile-web collapse still works; theme toggle works; no layout shift of page content.
- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/components/AppShell.tsx vernon_project/public/frontend_web vernon_project/www/w.html
git commit -m "feat(web): bento-style AppShell chrome with domain accents"
```

---

## Phase P2 — Dashboards

> **Pattern for every page task below (P2–P5):** (1) Read the current page. (2) Wrap its existing content (same data/hooks/handlers) in one `<BentoGrid>` using the task's tile table — each row is `tile → span → tone → accent → content source`. (3) Preserve all logic; only the wrapping markup changes. (4) Build. (5) Visual-check the page light+dark. (6) Commit. **Task P2.1 (Today) below is the fully-worked reference; mirror its structure for all other pages.**

### Task P2.1: Today (reference implementation)

**Files:**
- Modify: `frontend-web/src/pages/Today.tsx`

**Tile table** (accent `brand`):

| Tile | span | tone | content source (existing) |
|------|------|------|---------------------------|
| Progress ring | `lg` `tall` | gradient/brand | existing `Ring` + done count |
| Points balance | `sm` | solid/amber | `wallet.data.balance` + deltas |
| Due today | `sm` | tint/brand | `counts.due_today` |
| Overdue | `sm` | tint/rose (status) | `counts.overdue` |
| Upcoming | `sm` | tint/brand | `counts.upcoming` |
| To review | `sm` | tint/emerald | `counts.review` |
| Tasks toolbar | `full` | plain | existing `Segmented` lens + `FilterButton`/`Popover` |
| Overdue list | `md` | plain | `groups[0].items` mapped to `TodoCard` |
| Today list | `md` | plain | `groups[1].items` |
| Upcoming list | `md` | plain | `groups[2].items` |

- [ ] **Step 1: Rewrite `Today.tsx` body** — keep all hooks/state/memo logic (lines computing `dash`, `wallet`, `lens`, `filters`, `lensed`, `dimensions`, `visible`, `counts`, `donePct`, `groups`) **verbatim**; replace only the returned JSX (the `<div className="space-y-6">…</div>` with `PageGrid`) with:

```tsx
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
// remove: import { PageGrid } from '@web/components/layout'
// ...all existing logic unchanged above the return...

return (
  <div className="space-y-6">
    <h1 className="text-2xl font-bold">Today</h1>
    <BentoGrid>
      <BentoTile span="lg" tall tone="gradient" accent="brand" title="Progress">
        <div className="flex flex-1 items-center gap-6">
          <div className="relative">
            <Ring pct={donePct} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold">{counts.completed_today}</span>
              <span className="text-xs text-slate-500">done</span>
            </div>
          </div>
          <div className="space-y-1 text-sm">
            <div><span className="font-semibold">{counts.due_today}</span> due today</div>
            <div><span className="font-semibold">{counts.overdue}</span> overdue</div>
            <div><span className="font-semibold">{counts.upcoming}</span> upcoming</div>
            <div><span className="font-semibold">{formatEstimate(counts.completed_minutes_today)}</span> done today</div>
          </div>
        </div>
      </BentoTile>

      <BentoTile span="sm" tone="solid" accent="amber" title="Points">
        <BentoStat
          value={w ? formatNumber(w.balance) : '—'}
          label="balance"
          delta={`+${w ? formatNumber(w.today_earned) : 0} today`}
        />
      </BentoTile>

      <BentoTile span="sm" tone="tint" accent="brand">
        <BentoStat value={counts.due_today} label="Due today" />
      </BentoTile>
      <BentoTile span="sm" tone="tint" accent="rose">
        <BentoStat value={counts.overdue} label="Overdue" />
      </BentoTile>
      <BentoTile span="sm" tone="tint" accent="brand">
        <BentoStat value={counts.upcoming} label="Upcoming" />
      </BentoTile>
      <BentoTile span="sm" tone="tint" accent="emerald">
        <BentoStat value={counts.review} label="To review" />
      </BentoTile>

      <BentoTile span="full" tone="plain">
        <div className="flex items-center justify-between gap-3">
          <Segmented options={LENSES} value={lens} onChange={setLens} />
          <div className="relative">
            <span ref={filterRef}>
              <FilterButton count={activeFilterCount(filters)} onClick={() => setFilterOpen((o) => !o)} />
            </span>
            <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filterRef}>
              {/* existing Popover children unchanged */}
            </Popover>
          </div>
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
    </BentoGrid>
  </div>
)
```

(Copy the existing `Popover` inner children verbatim into the marked spot.)

- [ ] **Step 2: Build** — `cd frontend-web && npm run build` → success.
- [ ] **Step 3: Visual check** — `/` renders the mosaic; ring, points, 4 stat tiles, toolbar, 3 task columns; lens switch + filter popover still work; light + dark OK.
- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/Today.tsx vernon_project/public/frontend_web vernon_project/www/w.html
git commit -m "feat(web): bento Today dashboard"
```

### Task P2.2: Me — accent `violet`

**Files:** Modify `frontend-web/src/pages/Me.tsx`.
**Tile table:**

| Tile | span | tone | content |
|------|------|------|---------|
| Profile hero (avatar/name/role) | `lg` `tall` | gradient/violet | existing header block |
| Points stat | `sm` | solid/amber | wallet balance |
| Rank stat | `sm` | tint/violet | rank/leaderboard pos if present |
| Badges | `wide` | plain | existing badges/achievements list |
| Settings & links (replay onboarding, logout, theme) | `md` | tint/slate | existing actions incl. `onReplayOnboarding` |

Steps: read → wrap per table (keep all handlers incl. `onReplayOnboarding`) → build → visual check (`/me`, light+dark) → commit `feat(web): bento Me page`.

### Task P2.3: Leaderboard — accent `violet`

**Files:** Modify `frontend-web/src/pages/Leaderboard.tsx`.
**Tile table:**

| Tile | span | tone | content |
|------|------|------|---------|
| Top-3 podium | `wide` | gradient/violet | top 3 rows of existing ranking |
| My rank | `sm` | solid/violet | current user row |
| Period/filter controls | `sm` | tint/slate | existing period `Segmented`/filter |
| Full ranking | `full` | plain | existing ranking list/table |

Steps: read → wrap (keep ranking data + period state) → build → visual (`/leaderboard`) → commit `feat(web): bento Leaderboard`.

### Task P2.4: WalletLog — accent `amber`

**Files:** Modify `frontend-web/src/pages/WalletLog.tsx`.
**Tile table:**

| Tile | span | tone | content |
|------|------|------|---------|
| Balance hero | `md` `tall` | solid/amber | balance |
| Earned today | `sm` | tint/amber | today_earned |
| Earned yesterday | `sm` | tint/amber | yesterday_earned |
| Transaction log | `full` | plain | existing log list/table |

Steps: read → wrap → build → visual (`/wallet`) → commit `feat(web): bento WalletLog`.

---

## Phase P3 — Lists

> Same pattern. Each: count/summary stat tiles (`sm`, tint, page accent) on top, optional filter tile, then the list/grid in a `full` plain tile.

### Task P3.1: Projects — accent `sky`
**Files:** Modify `frontend-web/src/pages/Projects.tsx`. Tiles: project count stat (`sm` tint/sky), optional status/filter tile (`sm` tint/slate), projects list/grid (`full` plain). Build → visual (`/projects`) → commit `feat(web): bento Projects list`.

### Task P3.2: Users — accent `rose`
**Files:** `Users.tsx`. Tiles: user count (`sm` tint/rose), role filter if present (`sm` tint/slate), users table (`full` plain). Commit `feat(web): bento Users list`.

### Task P3.3: Groups — accent `slate`
**Files:** `Groups.tsx`. Tiles: group count (`sm` tint/slate), groups list (`full` plain). Commit `feat(web): bento Groups list`.

### Task P3.4: Brands — accent `slate`
**Files:** `Brands.tsx`. Tiles: brand count (`sm` tint/slate), brands list (`full` plain). Commit `feat(web): bento Brands list`.

### Task P3.5: Marketplace — accent `emerald`
**Files:** `Marketplace.tsx`. Tiles: balance/affordability stat (`sm` solid/amber), category filter (`sm` tint/slate), reward cards as `md`/`sm` tint/emerald tiles inside the grid (each reward a tile), redeem flow unchanged. Commit `feat(web): bento Marketplace`.

### Task P3.6: Reports — accent `slate`
**Files:** `Reports.tsx`. Tiles: report count (`sm` tint/slate), reports list (`full` plain). Commit `feat(web): bento Reports list`.

### Task P3.7: Review — accent `brand`
**Files:** `Review.tsx`. Tiles: pending-count stat (`sm` tint/brand), review queue grouped into `md`/`wide` plain tiles. Approve/reject actions unchanged. Commit `feat(web): bento Review`.

---

## Phase P4 — Detail pages

> Larger pages. **Restructure by wrapping existing sections in tiles; do NOT rewrite their state/logic.** Header/summary hero tile, key stats as `sm` tiles, main body in `wide`/`full` tiles, side metadata in `sm`/`md`.

### Task P4.1: Project — accent `sky`
**Files:** `Project.tsx`. Tiles: project header hero (`wide` gradient/sky), progress/stats (`sm` tint/sky), items list (`full` plain), metadata/side (`md` tint/slate). Keep nested `<Outlet/>` for `item/:itemName`. Commit `feat(web): bento Project detail`.

### Task P4.2: ProjectItem (47 KB — heaviest) — accent `sky`
**Files:** `ProjectItem.tsx`. Identify the existing top-level sections (header, status/actions, description, allocations, comments/log, sidebar). Wrap **each existing section block** in a `BentoTile` (`wide`/`full`/`md` as fits) without touching the section internals, state, or handlers. Hero header `gradient/sky`; status actions `tint/sky`; everything else `plain`. **Do the wrapping incrementally, building after each section** to catch JSX nesting errors early. Commit `feat(web): bento ProjectItem detail`.

### Task P4.3: ProjectDetail — accent `sky`
**Files:** `ProjectDetail.tsx`. Tiles: header hero (`wide` gradient/sky), stat tiles (`sm`), body (`full` plain). Commit `feat(web): bento ProjectDetail`.

### Task P4.4: ReportPage (20 KB) — accent `slate`
**Files:** `ReportPage.tsx`. Wrap existing report sections/tables in `full`/`wide` plain tiles; summary numbers as `sm` tint/slate stats. Keep table/chart logic intact. Commit `feat(web): bento ReportPage`.

---

## Phase P5 — Forms + cleanup

> Split each form's field groups into separate tiles (`md`/`lg` plain). Live preview / summary / danger-zone → side tiles (`sm`/`md` tint). Submit actions stay (sticky footer or inside the preview/last tile). Keep all form state, validation, and submit handlers unchanged.

### Task P5.1: UserForm — accent `rose`
**Files:** `UserForm.tsx`. Tiles: "Identity" fields (`md` plain), "Role & access" fields (`md` plain), "Preview/summary" (`sm` tint/rose). Commit `feat(web): bento UserForm`.

### Task P5.2: GroupForm (21 KB) — accent `slate`
**Files:** `GroupForm.tsx`. Group its existing field sections (basics, levels, weights, members) each into a tile (`md`/`lg` plain); levels/weights editor stays intact (recent reorderable-levels work — do not disturb its logic). Build after each wrap. Commit `feat(web): bento GroupForm`.

### Task P5.3: BrandForm — accent `slate`
**Files:** `BrandForm.tsx`. Field-group tiles + preview tile (`sm` tint/slate). Commit `feat(web): bento BrandForm`.

### Task P5.4: RewardForm — accent `emerald`
**Files:** `RewardForm.tsx`. Field tiles + live reward-card preview tile (`sm` tint/emerald). Commit `feat(web): bento RewardForm`.

### Task P5.5: GiftPoints — accent `amber`
**Files:** `GiftPoints.tsx`. Recipient/amount field tile (`md` plain), balance/summary tile (`sm` solid/amber). Commit `feat(web): bento GiftPoints`.

### Task P5.6: GrantPoints — accent `amber`
**Files:** `GrantPoints.tsx`. Same shape as GiftPoints. Commit `feat(web): bento GrantPoints`.

### Task P5.7: BadgeSettings — accent `violet`
**Files:** `BadgeSettings.tsx`. Badge config groups into tiles (`md` plain); preview swatches tile (`sm` tint/violet). Commit `feat(web): bento BadgeSettings`.

### Task P5.8: MarketplaceAdmin — accent `emerald`
**Files:** `MarketplaceAdmin.tsx`. Reward management list (`full` plain) + summary stat tiles (`sm` tint/emerald). Commit `feat(web): bento MarketplaceAdmin`.

### Task P5.9: Remove deprecated layout primitives + demo + update memory
**Files:**
- Delete: `frontend-web/src/components/layout.tsx` (only after grep confirms zero imports remain).
- Delete: `frontend-web/src/pages/BentoDemo.tsx` + its route in `App.tsx` (dev-only gallery; remove for production) — OR keep if the user wants it. Default: remove.
- Update memory `vernon-web-layout-convention` to describe the bento system.

- [ ] **Step 1:** `grep -rn "components/layout'" frontend-web/src` → expect **no results** (every page migrated). If any remain, migrate them first.
- [ ] **Step 2:** Delete `layout.tsx`, remove `BentoDemo` route + file.
- [ ] **Step 3: Build** → success (proves no dangling imports).
- [ ] **Step 4:** Rewrite the `vernon-web-layout-convention` memory file: web `/w` pages use `BentoGrid`/`BentoTile` from `@web/components/bento` with domain accents + span tokens; old `PageGrid`/`SectionCard`/`FieldGrid` removed.
- [ ] **Step 5: Commit**

```bash
git add -A frontend-web vernon_project/public/frontend_web vernon_project/www/w.html
git commit -m "chore(web): remove deprecated layout primitives, finalize bento rollout"
```

---

## Self-Review (against spec)

- **Spec §2.1 primitives** → P0.1. **§2.2 spans** → `SPAN` map in P0.1. **§2.3 accents** → `ACCENTS` map + Global Constraints accent assignments. **§2.4 tones + discipline** → `ACCENTS` tones + per-page tables keep ≤2 bright tiles. **§3 restructure pattern** → P2–P5 pattern note. **§4 page inventory** → one task per page (P2.1–P5.8). **§5 AppShell** → P1.1. **§6 rollout phases** → P0–P5 match spec table. **§7 verification** → "Test cycle" global constraint + per-task build/visual steps. **§8 cleanup** → P5.9.
- **No placeholders:** P0 (foundation) + P2.1 (reference page) carry full code; per-page tasks carry concrete tile tables (the spec for that page), not "TODO". This is the correct altitude for a 25-page reskin executed by subagents that read each page's real current code; literal JSX for all 25 would be stale on contact.
- **Type consistency:** `BentoTileProps`, `Accent`, `Tone`, `Span`, `BentoStat` signatures defined once in P0.1 and consumed unchanged everywhere.
- **Heavy pages** (ProjectItem, GroupForm, ReportPage) flagged with incremental-wrap + build-after-each guidance.

## Execution Handoff

Subagent-driven execution (user requested). REQUIRED SUB-SKILL: superpowers:subagent-driven-development — fresh subagent per task, two-stage review between tasks, starting at P0.1.
