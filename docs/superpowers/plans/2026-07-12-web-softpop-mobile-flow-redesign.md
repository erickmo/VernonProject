# Web Soft-Pop Mobile-Flow Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-shape `/w` (frontend-web) to feel and flow like `/m` (frontend): tab-bar shell + "More" overlay, card feeds, one shared bottom-sheet/modal, a FAB, and drill-down navigation — laid out for a wide desktop viewport.

**Architecture:** The web app already shares mobile's design tokens and can import mobile components (`@` → `../frontend/src`; web `tailwind.config.js` already scans `../frontend/src/**`). So this is not a repaint — it's a **shell + flow + component-shape** change. One route wrapper (`AppShell`) gates every authenticated route, so swapping the shell is a small, high-leverage edit. New primitives (`Sheet`, `Card`/`CardList`) land first; then pages converge onto the mobile screen structure, reusing mobile leaf components (`TodoCard`, `ProjectCard`, `Pill`, `Avatar`) where they are self-contained.

**Tech Stack:** React 18 + TypeScript, React Router v6, Tailwind (config already soft-pop), lucide-react icons, TanStack Query (shared `@/hooks/useData`). Build: Vite.

## Global Constraints

- **Scope: `frontend-web` only.** Edit only files under `frontend-web/` (`@web` = `frontend-web/src`). **Never edit `../frontend/src`** (mobile, `@`) — it is the shared reference and edits there break `/m`. Reusing `@/…` imports read-only is expected and encouraged.
- **Tokens/fonts are already correct** (`#FAF7F0` canvas, brand indigo, warm `shadow-card`, Familjen Grotesk + Figtree). Do **not** re-pick colors or fonts.
- **No new dependencies.** Everything needed is installed.
- **No native `<select>`** — use `SearchableSelect` (single) / `MultiSelectSearch` (multi). (Project convention.)
- **No `alert()`/`confirm()`/`prompt()`** — use the new `Sheet` or an existing dialog. (Project convention.)
- **Dark mode:** mobile components hardcode `dark:bg-slate-*`; web tokens map dark to slate. Keep both working — check light and dark.
- **Verification per task** (no test DB — one LIVE site): run `cd frontend-web && npx tsc --noEmit` (no type errors) **and** `npm run build` (succeeds), then **browser-check** the described observable state. Automated tests are deferred to the final phase.
- **Deploy per phase (not per task):** `cd frontend-web && npm run build`. Because `project.vernon.id` is behind Cloudflare with `/assets` cached 1yr, after a deploy purge Cloudflare (`<cf-token-path>`, zone `<cloudflare-zone-id>`) and bump the SW asset-cache version if the bundle looks stale/blank. Restart the bench only if a Python file changed (none here): `sudo /usr/local/bin/tj-restart`.
- **Git:** the user works in parallel on this branch — `git add` only the files you created/modified for the task, never `git add -A`. Re-check `git status` before each commit.

---

## Phase 1 — Foundations (Sheet primitive + radius/animation tokens)

Invisible-ish plumbing the shell depends on. Land first.

### Task 1: `Sheet` primitive — breakpoint-branched bottom-sheet / centered modal

**Files:**
- Create: `frontend-web/src/components/Sheet.tsx`
- Reference (read only): `frontend/src/components/QuickAddSheet.tsx:249-293` (mobile `SheetShell` chrome), `frontend-web/src/lib/useModalA11y.ts`

**Interfaces:**
- Produces: `Sheet({ open, title?, onClose, onBack?, size?, children })` where `size?: 'sm' | 'md' | 'lg'` (default `'md'`). Renders a bottom-sheet on narrow (`< sm`), a centered modal-card on `sm+`. Consumed by `MoreSheet` (Task 4), `QuickCreate`, and any future sheet.

- [ ] **Step 1: Write the component**

```tsx
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { X, ChevronLeft } from 'lucide-react'

// One overlay primitive for the whole app. Narrow screens get a mobile bottom
// sheet (grabber, slide-up, safe-area pad); sm+ gets a centered modal-card
// (pop-in). Replaces the ad-hoc Dialog/Drawer split. Esc + scrim close.
export function Sheet({
  open, title, onClose, onBack, size = 'md', children,
}: {
  open: boolean
  title?: string
  onClose: () => void
  onBack?: () => void
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const width = size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 animate-fade-in" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          'relative w-full max-h-[85vh] overflow-y-auto bg-surface shadow-2xl',
          'rounded-t-3xl sm:rounded-3xl',
          'p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:pb-5',
          'max-w-[560px]', width,
          'animate-slide-up sm:animate-pop',
        )}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" />
        {(title || onBack) && (
          <div className="mb-4 flex items-center gap-2">
            {onBack && (
              <button onClick={onBack} aria-label="Back" className="rounded-full p-1 text-muted active:scale-90">
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h2 className="flex-1 font-display text-lg font-semibold text-ink">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-hover/[0.04] active:scale-90">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
```

- [ ] **Step 2: Verify** — `cd frontend-web && npx tsc --noEmit` → no errors; `npm run build` → succeeds.
- [ ] **Step 3: Commit** — `git add frontend-web/src/components/Sheet.tsx && git commit -m "feat(web): add breakpoint-branched Sheet primitive"`

### Task 2: Radius + animation tokens on shared primitives

**Files:**
- Modify: `frontend-web/src/components/ui.tsx` (Button base radius, Skeleton radius, CardGridSkeleton card radius)

Soft-pop uses larger radii than the current uniform `rounded-lg`. Bump the shared primitives only (pages converge in Phase 5 — do **not** sweep all 74 pages here).

- [ ] **Step 1: Bump Button/IconButton radius** — in `BTN_BASE` (`ui.tsx:123`), change `rounded-lg` → `rounded-xl`.
- [ ] **Step 2: Bump skeleton radii** — `Skeleton` (`ui.tsx:11`) `rounded-md` → `rounded-xl`; `CardGridSkeleton` inner card (`ui.tsx:21`) `rounded-lg` → `rounded-2xl`.
- [ ] **Step 3: Verify** — `npx tsc --noEmit` + `npm run build` succeed; a page using `<Button>` shows pill-ier corners in the browser.
- [ ] **Step 4: Commit** — `git add frontend-web/src/components/ui.tsx && git commit -m "feat(web): soft-pop radius on shared primitives"`

---

## Phase 2 — Shell (the feel flips here)

Swap `Sidebar` + breadcrumb `TopBar` for a top tab bar + More overlay + FAB, and cap content width.

### Task 3: Rewrite `TopNav` into the top tab bar

**Files:**
- Modify: `frontend-web/src/components/TopNav.tsx`
- Reference (read only): `frontend-web/src/lib/nav.ts` (`NAV_PRIMARY`, `NAV_PRIMARY_PATHS`), `frontend/src/components/BottomNav.tsx` (tab active styling)

**Interfaces:**
- Consumes: `NAV_PRIMARY` from `@web/lib/nav`, `useDashboard` from `@/hooks/useData` (review badge count).
- Produces: `TopBar({ onOpenPalette, onQuickCreate, onOpenMore })` — **drops** `onOpenSidebar` and `crumbs` props. Keeps the existing `AvatarMenu` (unchanged), search button, `NotificationBell`, wallet chip.

Replace the breadcrumb `<nav>` block (`TopNav.tsx:44-53`) with a horizontal tab row built from `NAV_PRIMARY`, plus a **More** button. Keep everything from the search button onward (`TopNav.tsx:55-72`) as-is, plus keep the `New` button (desktop bonus, alongside the FAB). Wire `onOpenMore` onto the More button.

- [ ] **Step 1: Update the signature** — change the `TopBar` params to `{ onOpenPalette, onQuickCreate, onOpenMore }: { onOpenPalette: () => void; onQuickCreate: () => void; onOpenMore: () => void }`. Add imports: `import { NavLink } from 'react-router-dom'` (already present), `import { Grid3x3 } from 'lucide-react'`, `import { NAV_PRIMARY } from '@web/lib/nav'`, `import { useDashboard } from '@/hooks/useData'`.

- [ ] **Step 2: Replace the breadcrumb nav with the tab row.** Swap `TopNav.tsx:44-53` for:

```tsx
        <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
          <NavLink to="/" className="mr-2 shrink-0 font-display text-lg font-semibold text-ink">Vernon</NavLink>
          {NAV_PRIMARY.map((t) => {
            const Icon = t.icon
            const badge = t.badge === 'review' ? reviewCount : 0
            return (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  clsx(
                    'relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-95',
                    isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-muted hover:bg-hover/[0.04]',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{t.label}</span>
                {badge > 0 && (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
            )
          })}
          <button onClick={onOpenMore} aria-label="More destinations"
            className="ml-1 flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-muted hover:bg-hover/[0.04] active:scale-95">
            <Grid3x3 className="h-4 w-4" /> <span className="hidden md:inline">More</span>
          </button>
        </nav>
```

Add `import clsx from 'clsx'` if missing. In the `TopBar` body, add `const { data: dash } = useDashboard(); const reviewCount = dash?.counts.review ?? 0`. Remove the mobile-menu `<button …onClick={onOpenSidebar}>` (`TopNav.tsx:40-42`).

- [ ] **Step 3: Verify** — `npx tsc --noEmit` will fail at `AppShell` (still passing old props) — that's expected, fixed in Task 5. Confirm `TopNav.tsx` itself has no *internal* type errors by eye; defer build to Task 5.
- [ ] **Step 4: Commit** — `git add frontend-web/src/components/TopNav.tsx && git commit -m "feat(web): tab-bar top nav with More button"`

### Task 4: `MoreSheet` — grouped grid of the ~40 secondary destinations

**Files:**
- Create: `frontend-web/src/components/MoreSheet.tsx`
- Reference (read only): `frontend-web/src/lib/nav.ts` (`buildNavGroups`), `frontend/src/components/BottomNav.tsx`

**Interfaces:**
- Consumes: `Sheet` (Task 1), `buildNavGroups(b)` from `@web/lib/nav`, `useBoot` from `@/hooks/useData`.
- Produces: `MoreSheet({ open, onClose })`.

- [ ] **Step 1: Write the component**

```tsx
import { useNavigate } from 'react-router-dom'
import { useBoot } from '@/hooks/useData'
import { buildNavGroups } from '@web/lib/nav'
import { Sheet } from '@web/components/Sheet'

// The ~40 non-primary destinations, grouped, as a soft-pop grid. Opened from
// the "More" button in the tab bar (mirrors how /m buries these under Me/FAB).
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: b } = useBoot()
  const groups = buildNavGroups(b)
  const go = (to: string) => { onClose(); navigate(to) }

  return (
    <Sheet open={open} onClose={onClose} title="All destinations" size="lg">
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.id}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.label}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {g.leaves.map((l) => {
                const Icon = l.icon
                return (
                  <button key={l.to} onClick={() => go(l.to)}
                    className="flex items-center gap-3 rounded-2xl bg-canvas p-3 text-left shadow-card transition active:scale-[0.98] hover:bg-hover/[0.03]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{l.label}</span>
                      {l.sub && <span className="block truncate text-xs text-muted">{l.sub}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean for this file (build deferred to Task 5).
- [ ] **Step 3: Commit** — `git add frontend-web/src/components/MoreSheet.tsx && git commit -m "feat(web): More overlay grid for secondary nav"`

### Task 5: `Fab` (web) + rewire `AppShell` (drop sidebar, cap width, mount FAB/MoreSheet)

**Files:**
- Create: `frontend-web/src/components/Fab.tsx`
- Modify: `frontend-web/src/components/AppShell.tsx`
- Reference (read only): `frontend/src/components/Fab.tsx` (mobile FAB), `frontend-web/src/components/FocusDock.tsx`, `frontend/src/lib/focusUI.ts`, `frontend/src/hooks/useFocusTimer.ts`

**Interfaces:**
- `Fab` consumes: `useFocusTimers` from `@/hooks/useFocusTimer`, `openFocusOverlay` from `@/lib/focusUI`, `useNavigate`. Produces: `Fab()` — bottom-right quick-add menu (New note / New ad / Help) + a timer-count companion button that opens the focus UI. Modeled on mobile `Fab.tsx` but web-native (does not import mobile's `FocusSheet`).
- `AppShell` produces: unchanged export `AppShell()`.

- [ ] **Step 1: Write the web FAB** (port of `frontend/src/components/Fab.tsx`, minus mobile `FocusSheet` — the timer button opens the existing web focus overlay via the shared `openFocusOverlay`):

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, StickyNote, Compass, Megaphone, Timer } from 'lucide-react'
import { useFocusTimers } from '@/hooks/useFocusTimer'
import { openFocusOverlay } from '@/lib/focusUI'

// Global quick-add, mounted once for every /w route (desktop-fit sibling of the
// /m FAB). Click opens an action menu; a timer-count companion appears while
// focus timers run and opens the focus overlay.
export function Fab() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const timers = useFocusTimers().timers
  const focusCount = timers.length

  const actions = [
    { icon: StickyNote, label: 'New note', run: () => navigate('/notes/new') },
    { icon: Megaphone, label: 'New ad', run: () => navigate('/papan-iklan/new') },
    { icon: Compass, label: 'What can I do', run: () => navigate('/help') },
  ]

  return (
    <>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div role="menu" aria-label="Quick actions"
            className="fixed bottom-24 right-6 z-40 w-56 rounded-2xl bg-surface p-1.5 shadow-2xl animate-pop">
            {actions.map((m) => (
              <button key={m.label} role="menuitem" onClick={() => { setMenuOpen(false); m.run() }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-hover/[0.04]">
                <m.icon className="h-5 w-5 shrink-0 text-brand-500" /> {m.label}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="fixed bottom-6 right-6 z-30 flex items-center gap-3">
        {focusCount > 0 && (
          <button aria-label={`${focusCount} focus timer(s) running`} onClick={() => openFocusOverlay(timers[0].id)}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-surface text-brand-600 shadow-card transition active:scale-90 animate-pop dark:text-brand-300">
            <Timer className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white">{focusCount}</span>
          </button>
        )}
        <button aria-label="Quick add" aria-haspopup="menu" aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className={`flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-card transition active:scale-90 ${menuOpen ? '' : 'animate-float'}`}>
          <Plus className={`h-7 w-7 transition-transform ${menuOpen ? 'rotate-45' : ''}`} strokeWidth={2.4} />
        </button>
      </div>
    </>
  )
}
```

> Confirm the `useFocusTimers().timers[]` element id field name against `frontend/src/hooks/useFocusTimer.ts` before finalizing (`timers[0].id` vs `.name`); adjust the `openFocusOverlay(...)` arg to match.

- [ ] **Step 2: Rewire `AppShell.tsx`.** Remove the `Sidebar` import + render and the `lg:pl-60` offset; remove `buildCrumbs`/`SECTION`/`useCrumbs`/crumbs; add `moreOpen` state; pass new props to `TopBar`; mount `MoreSheet` + `Fab`; cap the main column. Replace the component body (`AppShell.tsx:67-131`) with:

```tsx
export function AppShell() {
  const boot = useBoot()
  const { pathname } = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => { setMoreOpen(false) }, [pathname])

  // ⌘K palette; bare `c` quick-create (desktop bonuses, kept).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o) }
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey &&
          !/^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName) &&
          !(e.target as HTMLElement)?.isContentEditable) { e.preventDefault(); setQuickOpen(true) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const b = boot.data
  const navCommands: Command[] = buildNavGroups(b).flatMap((g) =>
    g.to
      ? [{ id: g.to, label: g.label, group: g.label, icon: FolderKanban, to: g.to }]
      : g.leaves.map((l) => ({ id: l.to, label: l.label, group: g.label, icon: l.icon, to: l.to })),
  )

  return (
    <div className="min-h-screen bg-canvas font-sans text-ink">
      <TopBar
        onOpenPalette={() => setPaletteOpen(true)}
        onQuickCreate={() => setQuickOpen(true)}
        onOpenMore={() => setMoreOpen(true)}
      />
      {/* Centered column that fits 2–3 card columns — soft-pop desktop-fit.
          (Replaces the former LOCKED full-width main — deliberate per redesign.) */}
      <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28 lg:px-6">
        <Outlet />
      </main>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} navCommands={navCommands} />}
      <QuickCreate open={quickOpen} onClose={() => setQuickOpen(false)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <Fab />
      <FocusHost />
      <UpdateBanner />
    </div>
  )
}
```

Update imports at the top of `AppShell.tsx`: drop `Sidebar`, `useCrumbs`, `FocusDock`; add `import { MoreSheet } from '@web/components/MoreSheet'` and `import { Fab } from '@web/components/Fab'`. Keep `TopBar`, `CommandPalette`, `QuickCreate`, `FocusHost`, `UpdateBanner`, `buildNavGroups`, `FolderKanban`.

> `FocusDock` is retired (its job — showing running timers — moves into the FAB companion button). Leave `FocusDock.tsx` on disk but unimported; delete in a later cleanup commit.

- [ ] **Step 3: Verify** — `cd frontend-web && npx tsc --noEmit` → **no errors** (all shell props now consistent); `npm run build` → succeeds.
- [ ] **Step 4: Browser-check** — load `/w`: top tab bar with 5 tabs + More; active tab is brand-filled; no left sidebar; content centered ≤ `max-w-6xl`; FAB bottom-right (floats); click FAB → menu; click More → grouped grid sheet; ⌘K palette still works; toggle dark mode — all readable.
- [ ] **Step 5: Commit** — `git add frontend-web/src/components/Fab.tsx frontend-web/src/components/AppShell.tsx && git commit -m "feat(web): mobile-flow shell — tab bar, More sheet, FAB, capped width"`

**Deploy checkpoint:** build + Cloudflare purge (see Global Constraints). The feel has flipped; verify live before continuing.

---

## Phase 3 — Card primitives + soft-pop skins

The surfaces that per-page convergence depends on.

### Task 6: Reuse mobile `TodoCard`/`ProjectCard` in web (mount providers)

**Files:**
- Modify: `frontend-web/src/components/AppShell.tsx` (mount `AdvanceProvider` + `RejectProvider` around `<Outlet />`)
- Reference (read only): `frontend/src/components/AdvanceProvider.tsx`, `frontend/src/components/RejectProvider.tsx`, `frontend/src/components/TodoCard.tsx`

Mobile `TodoCard` (and `ProjectCard`) are self-contained *except* they call `useAdvance()`/`useReject()` from those providers and navigate to `/project-item/:name` (route exists in web, `App.tsx:181`). Mount the providers once so web pages can render `<TodoCard>`/`<ProjectCard>` directly instead of DataTables for task/project feeds.

- [ ] **Step 1: Wrap the outlet** — in `AppShell.tsx`, import `import { AdvanceProvider } from '@/components/AdvanceProvider'` and `import { RejectProvider } from '@/components/RejectProvider'`, and wrap `<main>`'s `<Outlet />` as `<AdvanceProvider><RejectProvider><Outlet /></RejectProvider></AdvanceProvider>`.
- [ ] **Step 2: Verify** — `npx tsc --noEmit` + `npm run build` succeed. (Confirm both providers export a Provider component + the `useAdvance`/`useReject` hooks; if a provider needs a Toast/Confirm context that web lacks, add that context here too — check the provider's imports.)
- [ ] **Step 3: Smoke-test** — temporarily drop a `<TodoCard>` into any page with a todo and confirm it renders + its Advance/Reject footer works; then revert the temp edit.
- [ ] **Step 4: Commit** — `git add frontend-web/src/components/AppShell.tsx && git commit -m "feat(web): mount Advance/Reject providers to reuse mobile cards"`

### Task 7: Generic `Card` + `CardList` primitives (non-todo lists)

**Files:**
- Create: `frontend-web/src/components/Card.tsx`
- Reference (read only): `frontend/src/components/TodoCard.tsx` (card look), `frontend/src/components/ProjectCard.tsx`

**Interfaces:**
- Produces:
  - `CardList({ children })` — responsive grid: `grid gap-3 sm:grid-cols-2 xl:grid-cols-3`.
  - `Card({ onClick, stripe?, eyebrow?, title, meta?, right?, footer? })` — a soft-pop card `<button>` modeled on `TodoCard` minus todo logic: `rounded-2xl bg-surface p-4 shadow-card active:scale-[0.99]`, optional `border-l-4` stripe color, uppercase eyebrow, semibold title, wrap-flex meta row, right slot (chevron/avatar), optional footer action row. For lists that are *not* tasks/projects (users, rewards, brands, meetings…).

- [ ] **Step 1: Write the component**

```tsx
import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'

export function CardList({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
}

export function Card({
  onClick, stripe, eyebrow, title, meta, right, footer,
}: {
  onClick?: () => void
  stripe?: string          // e.g. 'border-rose-400'; omit for a plain card
  eyebrow?: React.ReactNode
  title: React.ReactNode
  meta?: React.ReactNode   // pill/badge row
  right?: React.ReactNode  // defaults to a chevron when onClick is set
  footer?: React.ReactNode
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        'group w-full rounded-2xl bg-surface p-4 text-left shadow-card transition',
        onClick && 'active:scale-[0.99]',
        stripe ? `border-l-4 ${stripe}` : '',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="mb-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted">{eyebrow}</p>}
          <div className="font-semibold leading-snug text-ink">{title}</div>
          {meta && <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">{meta}</div>}
        </div>
        {right ?? (onClick ? <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-line" /> : null)}
      </div>
      {footer && <div className="mt-3 flex gap-2 border-t border-line pt-3">{footer}</div>}
    </Tag>
  )
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` + `npm run build` succeed.
- [ ] **Step 3: Commit** — `git add frontend-web/src/components/Card.tsx && git commit -m "feat(web): generic Card + CardList primitives"`

### Task 8: Soft-pop skin for `DataTable` (kept for dense/admin/report pages)

**Files:**
- Modify: `frontend-web/src/components/DataTable.tsx`
- Reference (read only): current `DataTable.tsx`

Tables stay where density earns it, but get the warm treatment: rounded container, `bg-surface`, more row padding, `border-line` dividers.

- [ ] **Step 1: Skin the container/rows** — wrap the table in `rounded-2xl border border-line bg-surface overflow-hidden shadow-card`; bump cell padding (e.g. `px-4 py-3`); ensure row hover uses `hover:bg-hover/[0.03]` and dividers use `divide-line`. (Apply to the existing markup; preserve sort/inline-edit behavior — do not change props or logic.)
- [ ] **Step 2: Verify** — `npx tsc --noEmit` + `npm run build` succeed; open a table page (e.g. `/users`) — rounded warm table, roomier rows, sorting still works.
- [ ] **Step 3: Commit** — `git add frontend-web/src/components/DataTable.tsx && git commit -m "feat(web): soft-pop skin for DataTable"`

### Task 9: Pill-ify `EntityChip` + soft-pop `bento` tones

**Files:**
- Modify: `frontend-web/src/components/EntityChip.tsx` (→ `rounded-full`, higher-contrast), `frontend-web/src/components/bento.tsx` (real raised/gradient/solid tone differentiation)

- [ ] **Step 1: EntityChip** — change chip container `rounded-md` → `rounded-full`, ensure active/selected state is `bg-brand-600 text-white` (mirrors mobile `FilterChips`). Keep the HoverCard (desktop bonus).
- [ ] **Step 2: bento tiles** — give `plain`/`solid`/`gradient` tones distinct soft-pop looks (raised = `bg-surface shadow-card`; solid = `bg-brand-600 text-white`; gradient = a warm brand gradient), bump tile radius to `rounded-2xl`. (The in-code comment flags that tones currently collapse — fix that.)
- [ ] **Step 3: Verify** — `npx tsc --noEmit` + `npm run build` succeed; Home bento tiles + any EntityChip look distinct and pill-shaped in light + dark.
- [ ] **Step 4: Commit** — `git add frontend-web/src/components/EntityChip.tsx frontend-web/src/components/bento.tsx && git commit -m "feat(web): pill chips + soft-pop bento tones"`

**Deploy checkpoint:** build + Cloudflare purge. Primitives are live; pages can now converge.

---

## Phase 4 — Converge the 5 tab pages

The tabs users live in. Home is detailed; the others follow the **Convergence Pattern** (below Phase 5) using this page as the worked example.

### Task 10: Home → vertical card feed (mirror `Today.tsx`)

**Files:**
- Modify: `frontend-web/src/pages/Home.tsx`
- Reference (read only): `frontend/src/pages/Today.tsx` (the mobile home — section order + content), `frontend/src/components/Layout.tsx` (`TabScreen` header pattern)

Rebuild `Home.tsx` from a command-center (DataTables + bento) into a vertical card feed matching `Today.tsx`'s **sections and order**, using the shared `@/hooks/useData` hooks (same data the mobile screen uses) and the new primitives.

- [ ] **Step 1: Establish the page shell** — a sticky title header (page title + subtitle, mirroring `TabScreen`'s header at `Layout.tsx:23-40`, minus the mobile search button which now lives in the tab bar) over a `space-y-4` single column (cards may tile via `CardList` where a section is a list):

```tsx
// Home shell — mirrors /m Today.tsx sections in order.
<div className="space-y-5">
  <header>
    <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{greeting}</h1>
    {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
  </header>
  {/* … sections, in the same order as Today.tsx … */}
</div>
```

- [ ] **Step 2: Port each `Today.tsx` section in order**, swapping mobile shells for web equivalents:
  - Today's tasks list → `<CardList>` of `<TodoCard>` (reused from Task 6), or the mobile "plan day" card where Today shows it.
  - Stat/summary blocks → soft-pop `bento` tiles (Task 9) or `Card`s.
  - Keep the **same section order and copy** as `Today.tsx`; do not invent new sections. Where Today uses `PullToRefresh`, use a plain refetch (desktop has no pull) — a refresh is fine to omit.
- [ ] **Step 3: Delete the old command-center scaffolding** in `Home.tsx` that no longer has a home (old DataTable-based blocks). Keep only what maps to a `Today.tsx` section.
- [ ] **Step 4: Verify** — `npx tsc --noEmit` + `npm run build` succeed.
- [ ] **Step 5: Browser-check** — `/w` home reads as a card feed echoing `/m` Today: greeting header, task cards with working Focus/Advance/Today controls, tiles; light + dark OK; cards tile into columns on a wide window and stack on a narrow one.
- [ ] **Step 6: Commit** — `git add frontend-web/src/pages/Home.tsx && git commit -m "feat(web): Home as Today-style card feed"`

### Task 11: Review → card feed

**Files:** Modify `frontend-web/src/pages/Review.tsx`. Reference: `frontend/src/pages/Review.tsx`.
Apply the **Convergence Pattern**: replace the review DataTable with `<CardList>` of `<TodoCard todo={t} showAssignee />` (assignee avatar shown in review context), keep filters as pill `FilterChips`. Verify (`tsc` + build + browser: review list is cards, approve/reject works) and commit.

### Task 12: Reports → card feed of report entries

**Files:** Modify `frontend-web/src/pages/Reports.tsx`. Reference: `frontend/src/pages/Reports.tsx`.
Apply the pattern: report list becomes `<CardList>` of `<Card>` (icon eyebrow + title + description, chevron → `/report/:name`). Individual report *pages* (`ReportPage.tsx`) keep their skinned `DataTable` (dense data). Verify + commit.

### Task 13: Projects workspace → responsive split / drill-down

**Files:** Modify `frontend-web/src/pages/ProjectsWorkspace.tsx`, `Project.tsx`, `ProjectDetailPane.tsx` as needed. Reference: `frontend/src/pages/Projects.tsx`, `ProjectScreen.tsx`.
Keep the 3-pane split (rail | detail | todos) on `lg+`, each pane a soft-pop `Card`/surface; **collapse to a stacked drill-down below `lg`** (rail → detail → item, one at a time, mirroring the mobile screens). Project cards in the rail use `<ProjectCard>` (reused from mobile). Verify (both wide and narrow widths) + commit.

### Task 14: Me → profile card stack

**Files:** Modify `frontend-web/src/pages/Me.tsx`. Reference: `frontend/src/pages/Profile.tsx` / `MyInfoScreen.tsx`.
Apply the pattern: profile becomes a stack of soft-pop `Card` sections (identity/avatar, stats, settings entries). Verify + commit.

**Deploy checkpoint:** build + Cloudflare purge. The 5 tabs now feel like `/m`.

---

## Phase 5 — Long tail (Convergence Pattern per page)

### The Convergence Pattern

For each remaining page, in order of user-visibility, apply the smallest of these that fits — the mobile screen of the same name is the template:

1. **List page** (renders a DataTable of non-dense rows) → `<CardList>` of `<Card>` (or `<TodoCard>`/`<ProjectCard>` for tasks/projects); filters → pill `FilterChips`.
2. **Dense/admin/report page** → keep the **skinned** `DataTable` (Task 8). Do not convert.
3. **Form / dialog / drawer** → render inside the `Sheet` primitive (Task 1) instead of the old Dialog/Drawer.
4. **Detail page** → soft-pop `Card` sections + a back affordance (drill-down); reuse the mobile detail screen's structure.
5. **Radius/press sweep** → any lingering `rounded-lg`/`rounded-md` cards on the page bump to `rounded-2xl`; interactive rows get `active:scale-[0.99]`.

Each page is its own task: **modify the one page file → `npx tsc --noEmit` + `npm run build` → browser-check against the `/m` equivalent → commit.** No page needs new primitives.

### Page checklist (grouped; ~55 pages, mechanical)

Mark each done when it matches its `/m` equivalent.

**Work**
- [ ] `Calendar.tsx` (skinned calendar; keep grid) · [ ] `Meetings.tsx` (cards) · [ ] `Notes.tsx` (cards) + `NoteForm.tsx` (Sheet or full page) · [ ] `Feedback.tsx` (cards) · [ ] `Bookings.tsx` (cards) + `BookingForm.tsx` (Sheet) · [ ] `Learn.tsx` + `Course.tsx` (cards) · [ ] `ExceptionApprovals.tsx` (cards) · [ ] `TodosDue.tsx` (TodoCard feed) · [ ] `Logbook.tsx` (keep skinned table)

**Community**
- [ ] `Events.tsx` + `EventDetail.tsx` (cards) · [ ] `MyRegistrations.tsx` (cards) · [ ] `TeamWall.tsx` (feed) · [ ] `Activity.tsx` (feed) · [ ] `Leaderboard.tsx` (rank cards) · [ ] `Income.tsx` (cards) · [ ] `PapanIklan.tsx` + `PapanIklanDetail.tsx` + `PapanIklanForm.tsx` (cards/Sheet) · [ ] `WhatsNew.tsx` (feed) · [ ] `Achievements.tsx` (cards)

**Points**
- [ ] `WalletLog.tsx` (keep skinned table) · [ ] `GiftPoints.tsx` (Sheet/form) · [ ] `Marketplace.tsx` (reward cards + redeem Sheet)

**Admin** (keep tables where dense; forms → Sheet)
- [ ] `Users.tsx` (table) + `UserForm.tsx` (Sheet/page) · [ ] `FeedbackInbox.tsx` (cards) · [ ] `TransferTasks.tsx` · [ ] `Groups.tsx` + `GroupForm.tsx` · [ ] `Brands.tsx` + `BrandForm.tsx` · [ ] `Companies.tsx` + `CompanyForm.tsx` · [ ] `MeetingRooms.tsx` + `MeetingRoomForm.tsx` · [ ] `Equipment.tsx` + `EquipmentForm.tsx` · [ ] `GamificationSettings.tsx` · [ ] `Settings.tsx` · [ ] `DataHealth.tsx` (table) · [ ] `MarketplaceAdmin.tsx` + `RewardForm.tsx` · [ ] `GrantPoints.tsx` · [ ] `IncomeAdmin.tsx` · [ ] `LmsAdmin.tsx` · [ ] `PapanIklanBans.tsx`

**Attendance** (mostly tables — skin, keep)
- [ ] `AttendanceReport.tsx` · [ ] `Schedules.tsx` · [ ] `Stations.tsx` · [ ] `Exceptions.tsx` · [ ] `HolidayLists.tsx` · [ ] `AttendanceProfiles.tsx`

**Other**
- [ ] `AvatarCustomizer.tsx` (already bespoke — radius/press sweep only) · [ ] `MyInfo.tsx` (card sections) · [ ] `Help.tsx` (cards) · [ ] `Onboarding.tsx` (already full-screen — sweep) · [ ] `Login.tsx` (sweep to soft-pop)

### Task 15 (final): cleanup + test pass

- [ ] Delete now-unused files: `frontend-web/src/components/Sidebar.tsx`, `frontend-web/src/components/FocusDock.tsx`, and any dead crumb helpers (`crumbs.ts` if fully unreferenced). Confirm no imports remain (`grep -r Sidebar frontend-web/src`).
- [ ] Add a light smoke test / typecheck gate as the project's test norm allows (deferred per Global Constraints) — at minimum `npx tsc --noEmit` clean and `npm run build` green.
- [ ] Update `MEMORY.md` note: web is now soft-pop mobile-flow (not flat-Notion); correct the stale "Bricolage + Plus Jakarta" font note to Familjen Grotesk + Figtree.
- [ ] Final deploy: build + Cloudflare purge + SW bump.
- [ ] Commit.

---

## Self-Review

**Spec coverage:**
- Shell (tab bar + More + FAB + sticky header + width cap + keep ⌘K) → Tasks 3,4,5 ✓
- Tokens (radius + animations; no color/font work) → Task 2 ✓
- Sheet primitive (breakpoint-branched) → Task 1 ✓
- CardList/card + reuse mobile cards + skin DataTable + pill chips + bento → Tasks 6,7,8,9 ✓
- Responsive rules (tiling, split-screen collapse, sheets, desktop bonuses) → Tasks 5,7,13 + Pattern ✓
- Per-page convergence (Home→feed, lists→cards, keep admin/report tables) → Tasks 10–14 + Phase 5 ✓
- Phasing → Phases 1–5 ✓
- Non-goals (no merge, no backend, no new pages) → respected (frontend-web only) ✓
- Verify = build + browser per phase, tests deferred → Global Constraints + every task ✓

**Placeholder scan:** No "TBD"/"implement later". The Phase 5 checklist is deliberately pattern-driven (each page = "apply the Convergence Pattern"), which is the actual content, not a placeholder — the pattern and the per-page target are both specified.

**Type consistency:** `Sheet` signature (Task 1) is consumed unchanged by `MoreSheet` (Task 4) and the Pattern. `TopBar` prop change (Task 3: drops `onOpenSidebar`/`crumbs`, adds `onOpenMore`) is matched by `AppShell` (Task 5). `Card`/`CardList` (Task 7) signatures are used consistently in Tasks 11–14 + Pattern. `Fab` reuse of `useFocusTimers().timers[].id` is flagged for confirmation against the shared hook.
