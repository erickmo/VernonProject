# Web redesign → Mobile Soft-Pop flow

**Date:** 2026-07-12
**Status:** Approved (design), pending implementation plan
**Scope:** `frontend-web` (`/w`) only. `frontend` (`/m`) is the reference, unchanged.

## Goal

Re-shape the web app (`/w`) to feel and flow like the mobile app (`/m`): a
tab-bar shell, card feeds, bottom-sheets, a floating action button (FAB), and
one-level-deep drill-down navigation — but laid out to use a wide desktop
viewport rather than a 448px phone column.

The user's words: *"Forget notion style, I prefer you copy the style of the
current mobile version, not just the design but also the flow."*

## Key finding: this is not a repaint

The web app already ported mobile's visual tokens. Confirmed in
`frontend-web/src/index.css` and `tailwind.config.js`:

- Warm paper palette (`#FAF7F0` canvas, `#FFFDF8` surface, `#3A2F28` ink, `#EAE3D5` line)
- Brand indigo scale (`brand-600 #4f46e5` primary)
- Warm brown-tinted shadows (`shadow-card`, `shadow-nav`)
- Paper dot-grain body background
- Fonts: Familjen Grotesk (display) + Figtree (body)
- The `pop` / `wiggle` / `float` keyframes already exist in web's tailwind config

So **no color or font work.** (The `MEMORY.md` "Soft Pop = Bricolage + Plus
Jakarta" note is stale — the live fonts are Familjen Grotesk + Figtree; correct
the memory after this ships.)

The gap is **shell + flow + component shape**, not paint.

## The decision that shaped everything

Web is a wide screen; mobile is a phone column. Chosen approach (of three
presented): **"Mobile flow, desktop-fit."** Adopt mobile's entire flow — tab
nav, card feeds, sheets, FAB, drill-down — but let it breathe on wide screens
(cards tile into columns, sheets dock as centered modals, the Projects split
stays responsive, dense admin/report pages keep soft-pop-skinned tables).

Rejected: (A) literal phone-in-a-column (wastes desktop, 3× scroll); (C)
soft-pop paint on the existing desktop shell (keeps the desktop *flow*, which
is the opposite of the request).

Two follow-on decisions:

- **Nav shell:** top tab bar (5 tabs) + a "More" grid overlay for the ~40
  secondary destinations. (Rejected: true bottom bar — mouse-far; left icon
  dock — reintroduces the sidebar we're removing.)
- **Desktop extras:** keep ⌘K palette, hover-card previews, and keyboard
  shortcuts as *progressive bonuses* — present on desktop, absent on touch.
  (Rejected: strip to strict phone parity — throws away real ergonomics.)

## Design

### 1. Shell — highest leverage, gates every route

Replace the persistent left `Sidebar` + breadcrumb `TopBar` (current
`AppShell.tsx`) with a mobile-modeled shell:

- **Top tab bar** (new `TabBar.tsx`): brand · 5 primary tabs
  (Today / Projects / Review / Reports / Me, with the review-count badge) ·
  **More** button · search icon · avatar menu. `frontend-web/src/lib/nav.ts`
  already pins those same 5 as `NAV_PRIMARY`, so the IA intent exists.
- **More overlay** (new `MoreSheet.tsx`): a soft-pop sheet showing the ~40
  secondary destinations grouped (Admin · Attendance · Points · Marketplace ·
  Learn …). Built on the shared `Sheet` primitive (§3), not a mega-menu.
- **FAB** (new `Fab.tsx`, modeled on `frontend/src/components/Fab.tsx`):
  bottom-right, quick-create, and grows a focus-timer companion button when
  timers are running. The existing `FocusDock` folds into it.
- **Sticky title header** per page (mobile's pattern) instead of breadcrumbs.
  `useCrumbs`/`buildCrumbs` retire or reduce to a plain page title.
- **Content width**: cap to a centered column that fits 2–3 card columns
  (~`max-w-6xl`). This **deliberately overrides** the `LOCKED: main area is
  full width on every route` comment in `AppShell.tsx` — that lock is a chosen
  casualty of this redesign, not an oversight.
- **Keep**: `CommandPalette` (⌘K), the bare-`c` quick-create shortcut — as
  desktop bonuses.

Files touched: `AppShell.tsx`, `TopNav.tsx` (→ tab bar or replaced),
`Sidebar.tsx` (retired), new `TabBar.tsx`, `MoreSheet.tsx`, `Fab.tsx`.

### 2. Tokens — nearly free

- Bump the default radius so primitives read soft-pop: web is `rounded-lg`
  (~0.5rem) almost everywhere; mobile is `rounded-2xl` cards / `rounded-t-3xl`
  sheets / `rounded-full` pills. Adjust the shared `Button`/`Field`/card radii.
- Wire the existing `pop` / `wiggle` / `float` keyframes and `active:scale`
  press feedback into the interactive primitives (they exist in config but web
  uses them only on celebration).

Files: `tailwind.config.js`, `index.css`, `components/ui.tsx`.

### 3. Shared primitives — the real consistency work

- **One `Sheet` primitive** (new `components/Sheet.tsx`), breakpoint-branched:
  a bottom-sheet on narrow screens, a centered modal-card on `lg+`. Replaces
  the current ad-hoc Dialog/Drawer split. Drag-to-dismiss is progressive
  (pointer-friendly, never required). Mobile copy-pastes this chrome across 17
  `*Sheet.tsx` files — web builds it once and reuses it (More overlay, quick
  create, plan-day, team manager, etc.).
- **`CardList` + card primitive** (new): soft-pop, `border-l-4` status stripe,
  pill meta row, `active:scale-[0.99]` press — mirrors mobile `TodoCard` /
  `ProjectCard`. This is the surface that replaces DataTable-first list pages.
- **Restyle** `Button` / `Field` / `Section` / `EntityChip` / `bento` tiles to
  soft-pop (pill-shaped chips, higher-contrast active states, real
  raised/gradient/solid bento tone differentiation).
- **DataTable stays** but gets a soft-pop skin (rounded warm container, more row
  padding, pill status cells). Used only where density genuinely earns it
  (admin, reports, dense data).

### 4. Responsive rules

- Cards **tile** into 2–3 columns on wide screens. `BentoGrid` is already
  2/6/12-col, so cards can flow across the width.
- Projects **3-pane split** (rail | detail | todos) stays on `lg+` (desktop
  benefits from seeing all three); collapses to mobile's stacked drill-down
  below `lg`.
- Sheets breakpoint-branch (§3).
- Hover-card previews, ⌘K, keyboard shortcuts = desktop-only progressive
  bonuses; nothing depends on touch (no pull-to-refresh requirement — use a
  refresh control or auto-refetch on desktop).

### 5. Per-page convergence — long mechanical tail, gated on §1–3

~74 web pages are ≈ 1:1 with the 79 mobile screens and share the `@/` data
layer, so most pages *converge* on the mobile screen's structure rather than
being rebuilt. Order of attack:

1. **Home** (`Home.tsx` command-center → vertical card feed modeled on
   `Today.tsx`).
2. **Tab-primary list pages** (Projects, Review, Reports task/project lists →
   card feeds + FilterChips).
3. **Detail pages** (project → detail → item drill-down; responsive split).
4. **Secondary/admin/report pages** — keep on soft-pop-skinned tables; light
   convergence.

### 6. Phasing

1. **Shell + tokens** — the feel flips immediately across every route.
2. **Sheet + CardList primitives** — everything per-page depends on these.
3. **The 5 tabs** — Home, Projects, Review, Reports, Me.
4. **Long tail** of secondary pages.

Each phase is independently shippable and browser-verifiable.

## Non-goals

- **Not** merging the two frontends into one responsive codebase. It's
  plausible later (near-1:1 pages + shared `@/` layer) but is a separate
  architectural call, explicitly out of scope here.
- No backend, API, or route-path changes.
- No new product pages or features — this is a reskin + reflow of existing `/w`.

## Verification

Per project norm (one LIVE site, no test DB): verification is
**build + browser-check per phase**, not an upfront test suite. Automated tests
deferred to the final phase. Deploy = `npm run build` in `frontend-web` +
Cloudflare asset-cache purge / SW version bump where the live bundle is cached
(per the Cloudflare-asset-cache project note).

## Open items intentionally defaulted (not user decisions)

- DataTable retention per page is decided page-by-page during §5, defaulting to
  cards for feeds and tables for dense/admin/report data.
- Exact `max-w` value tuned during §1 against real content.
- Whether `TopNav.tsx` is edited into the tab bar or replaced by a fresh
  `TabBar.tsx` is an implementation detail for the plan.
