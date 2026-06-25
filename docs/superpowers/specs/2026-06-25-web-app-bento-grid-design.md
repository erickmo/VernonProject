# Web App Bento Grid Redesign — Design Spec

**Date:** 2026-06-25
**Surface:** Web app only (`frontend-web/`, served at `/w`). Mobile (`frontend/`, `/m`) is **out of scope**.
**Scope:** All ~25 web pages, full content restructure into a bento mosaic, one spec, phased rollout.
**Aesthetic:** Playful / colorful — but disciplined by a fixed token + accent system.

---

## 1. Goal

Replace the web app's current centered/sectioned layouts with a **bento grid** visual language: every page becomes a mosaic of mixed-size rounded tiles, with oversized stat numbers, soft gradients, and a per-domain accent color. The look should feel modern and lively without becoming visually noisy across 25 pages.

### Success criteria
- A single shared primitive (`BentoGrid` + `BentoTile`) drives every page; no page hand-rolls its own grid math.
- Color is assigned by **domain**, deterministically — the same kind of content gets the same accent everywhere.
- Each page reads as a deliberate mosaic (varied tile spans), not a uniform column of equal cards.
- Dark mode is preserved on every tile/tone.
- Every phase builds clean (`npm run build`) and is visually checked before the next.

### Non-goals
- No change to mobile (`frontend/`, `/m`). Shared components under `frontend/src/` must not regress mobile. Bento primitives live in **web-only** `frontend-web/src/`.
- No backend / API / data-model changes. This is presentation only.
- No route changes. URLs and navigation targets stay identical.
- No new features or content — restructuring existing content into tiles, not inventing new data.

---

## 2. Design System

### 2.1 Primitives — `frontend-web/src/components/bento.tsx`

**`BentoGrid`**
- CSS grid. Responsive columns: `grid-cols-2 md:grid-cols-6 xl:grid-cols-12`.
- Rows: `auto-rows-[minmax(7rem,auto)]` (a base row unit so `tall` tiles get real height).
- Gap: `gap-4` (token — see 2.4).
- Props: `{ children, className? }`.

**`BentoTile`**
- The standard surface: `rounded-3xl`, `shadow-card`, `transition`, hover lift (`hover:-translate-y-0.5 hover:shadow-lg`) **only when clickable**.
- Props:
  - `span?: SpanToken` — default `md`. Maps to responsive col/row span classes (see 2.2).
  - `tone?: 'plain' | 'tint' | 'gradient' | 'solid'` — default `plain`.
  - `accent?: Accent` — domain accent key (see 2.3). Ignored when `tone='plain'`.
  - `title?`, `subtitle?`, `icon?` (lucide component), `actions?` (ReactNode, top-right).
  - `to?: string` — when set, the whole tile is a `<Link>` (clickable styling + hover lift).
  - `children`, `className?`.
- Internal layout: optional header row (icon + title/subtitle left, actions right), then `children`.

**`BentoStat`** (helper tile content, not a separate tile)
- Renders an oversized number + label for stat tiles: `text-4xl/5xl font-bold tabular-nums` value, `text-xs uppercase tracking-wide text-{muted}` label, optional delta line. Used inside `BentoTile`.

### 2.2 Span tokens

Mosaics are built **only** from these tokens (no arbitrary `col-span-*` in pages):

| Token | Desktop (`xl`, 12-col) | Tablet (`md`, 6-col) | Mobile (2-col) |
|-------|------------------------|----------------------|----------------|
| `sm`   | col-span-3 | col-span-2 | col-span-1 |
| `md`   | col-span-4 | col-span-3 | col-span-2 |
| `lg`   | col-span-6 | col-span-3 | col-span-2 |
| `wide` | col-span-8 | col-span-6 | col-span-2 |
| `full` | col-span-12 | col-span-6 | col-span-2 |
| `tall` | modifier: adds `row-span-2` | same | (row-span-2 retained) |

`span` accepts a base token, optionally `tall` combined (e.g. `span="md" tall`). Implemented as a lookup map of static class strings (so Tailwind's JIT sees them — no dynamic class construction).

### 2.3 Accent system — domain-driven

Accent is chosen by the **content domain**, never ad hoc:

| Domain | Accent key | Tailwind family |
|--------|-----------|-----------------|
| Tasks / Today / calendar | `brand` | brand (indigo) |
| Points / wallet | `amber` | amber |
| Leaderboard / badges / achievements | `violet` | violet |
| Projects | `sky` | sky |
| Marketplace / rewards | `emerald` | emerald |
| People / users | `rose` | rose |
| Admin / settings / reports | `slate` | slate |

Each accent resolves (via a `ACCENTS` map in `bento.tsx`) to class strings for each tone. Status tiles (todo states) reuse the existing `STATUS` map from `frontend/src/lib/status.ts` rather than this table.

### 2.4 Tones

| Tone | Background | Use |
|------|-----------|-----|
| `plain` | `bg-white dark:bg-slate-900` | default, most tiles |
| `tint` | `bg-{accent}-50 dark:bg-{accent}-500/10` | gentle categorization |
| `gradient` | `bg-gradient-to-br from-{accent}-500/15 to-{accent}-400/5 dark:from-{accent}-500/20 dark:to-{accent}-400/5` | feature/summary tiles |
| `solid` | `bg-{accent}-500 text-white` (+ `shadow-{accent}-500/20`) | hero / primary CTA only |

**Discipline rule (the anti-noise guardrail):** at most **1–2** `solid` or `gradient` tiles per page. Everything else is `plain` or `tint`. This is what keeps "colorful × 25 pages" coherent.

### 2.5 Tokens (Tailwind config)
- Confirm/extend `tailwind.config` so all seven accent families + needed opacity steps are available (most are core palette; `brand` already exists). No purge surprises — `ACCENTS` uses full literal class strings.
- Radius: tiles `rounded-3xl`. Gap: `gap-4`. Shadow: existing `shadow-card` + `hover:shadow-lg`.

---

## 3. Per-page restructure pattern

Every page becomes a single `<BentoGrid>`:

1. **Summary/stat tiles** at top — small spans (`sm`/`md`), `tint`/`gradient`, oversized numbers. (≤2 bright tiles.)
2. **Primary content** — the page's main list/table/form/detail in a `wide` or `full` tile (`plain`).
3. **Secondary tiles** — related items, help, preview, danger zone, recipient, summary — `sm`/`md`, `plain`/`tint`.
4. **Forms** split their field groups into separate tiles (e.g. "Basics", "Settings", "Preview/Danger") instead of one long column. Field grid inside a tile stays 2-up where it fits.

The current layout primitives (`PageGrid`, `SectionCard`, `FieldGrid` in `frontend-web/src/components/layout.tsx`) are **superseded**. During rollout they remain as thin wrappers; after P5 they are deleted and the memory `vernon-web-layout-convention` updated.

---

## 4. Page inventory + tile sketches

High-level tile plan per page (exact tile content finalized during implementation). Accent shown in brackets.

**Dashboards (P2)**
- **Today** [brand]: hero progress-ring tile (`lg` `gradient`), points stat (`sm` `tint` amber), counts stats (overdue/due/upcoming/review as `sm` tint), then Overdue/Today/Upcoming task lists as `md`/`wide` plain tiles.
- **Me** [violet]: profile/avatar hero tile (`lg`), badges grid tile (`wide`), stat tiles (points, rank, streak — `sm`), settings/links tile.
- **Leaderboard** [violet]: top-3 podium hero tile (`wide` `gradient`), my-rank stat (`sm` `solid`), full ranking list (`full` plain), filter/period tile.
- **WalletLog** [amber]: balance hero (`md` `solid` amber), today/yesterday earned stats (`sm`), transaction log (`full` plain).

**Lists (P3)** — Projects, Users, Groups, Brands, Marketplace, Reports, Review
- Pattern: count/summary stat tiles top (`sm`), optional filter tile, then the list/grid as `full` plain tile. Marketplace [emerald] reward cards become tinted tiles. Review [slate] groups pending items into tiles.

**Details (P4)** — Project, ProjectItem, ProjectDetail, ReportPage
- Header/summary hero tile, key stats as `sm` tiles, main body (description/items/allocations) in `wide`/`full` tiles, side metadata in `sm`/`md`. **ProjectItem (47 KB) and ReportPage (20 KB) are the largest — break their existing sections into tiles incrementally; do not rewrite logic.**

**Forms (P5)** — UserForm, GroupForm (21 KB), BrandForm, RewardForm, GiftPoints, GrantPoints, BadgeSettings, MarketplaceAdmin
- Field groups → tiles. Live preview / summary / danger-zone → side tiles. Submit actions in a sticky footer tile or the preview tile.

**AppShell chrome (P1)**
- Sidebar nav items → rounded pills with accent active-state (active route uses its domain accent). Header/topbar restyled to match radius/shadow. Structure, routes, responsive collapse unchanged.

---

## 5. Rollout phases (one spec, sequential plans)

| Phase | Content | Exit check |
|-------|---------|-----------|
| **P0** | `bento.tsx` primitives (`BentoGrid`, `BentoTile`, `BentoStat`), `ACCENTS` map, span lookup, tailwind tokens, a `/bento-demo` gallery route (dev-only) showing every span/tone/accent | build clean; gallery renders all variants light+dark |
| **P1** | AppShell chrome restyle | build clean; nav active-states correct; mobile-web collapse intact |
| **P2** | Today, Me, Leaderboard, WalletLog | build clean; each page visually checked light+dark |
| **P3** | Projects, Users, Groups, Brands, Marketplace, Reports, Review | build clean; lists render; filters work |
| **P4** | Project, ProjectItem, ProjectDetail, ReportPage | build clean; no logic regressions on heavy pages |
| **P5** | UserForm, GroupForm, BrandForm, RewardForm, GiftPoints, GrantPoints, BadgeSettings, MarketplaceAdmin; then delete deprecated `layout.tsx` wrappers + update memory | build clean; forms submit; old primitives gone |

Each phase = its own implementable unit. `npm run build` writes to `vernon_project/public/frontend_web/` + `www/w.html` (see `vernon-deploy-mechanics`).

---

## 6. Risks & mitigations

- **Consistency drift across 25 pages** (top risk). → Domain-accent table (§2.3), span tokens (§2.2), and the ≤2-bright-tiles rule (§2.4) are hard guardrails. The P0 demo gallery is the reference.
- **Visual noise from "colorful".** → Most tiles `plain`/`tint`; `solid`/`gradient` rationed per page.
- **Heavy pages (ProjectItem 47 KB, GroupForm 21 KB).** → Restructure by wrapping existing sections in tiles; do **not** rewrite their logic/state. Tile-ization is layout-only.
- **Shared-component regressions.** → Bento primitives are web-only. Where a web page imports a shared `frontend/src/` component, wrap it in a tile rather than editing the shared component. Any shared edit must keep mobile working.
- **Dark mode.** → Every tone defines a `dark:` variant; the demo gallery is reviewed in both themes.

---

## 7. Verification

- Per phase: `cd frontend-web && npm run build` must succeed (TS + vite).
- Visual check each converted page in light + dark (live site is the only environment — see `vernon-live-site-codefirst`).
- No console errors; existing interactions (filters, popovers, forms, navigation) still work.
- Final: confirm `layout.tsx` deprecated wrappers removed and no dead imports remain.

---

## 8. Out-of-scope / future
- Mobile (`/m`) bento adaptation — separate spec if ever wanted.
- Animation/motion polish beyond hover lift.
- Per-user theming / accent customization.
