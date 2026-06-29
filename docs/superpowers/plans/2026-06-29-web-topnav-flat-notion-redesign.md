# /w Top-Nav + Flat-Notion Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/w` left sidebar with a top navbar + mega dropdowns, migrate the colorful bento aesthetic to a flat minimalist Notion-like system, and add quick-create, a power command palette, inline list editing, and visible data relations.

**Architecture:** Foundation-first. Rewrite design tokens and flatten the shared `bento.tsx` primitives in place so all ~50 pages flatten at once; add new flat primitives (`DataTable`, `Page`/`Section`, `Property`, `EntityChip`, `HoverCard`); replace `AppShell`'s sidebar with `TopNav` + `MegaMenu` driven by a single `NAV_GROUPS` config; layer in speed/relation features; then bespoke-polish the 4 highest-traffic pages and sweep the rest.

**Tech Stack:** React 18 + TypeScript, Vite 5, Tailwind 3.4 (`darkMode: 'class'`), react-router 6 (`basename="/w"`), TanStack Query v5, lucide-react, clsx. Shared data layer in `../frontend/src` via the `@` alias; web-only code in `frontend-web/src` via `@web`.

## Global Constraints

- **No test DB / single live site.** Per project convention, automated tests are deferred to a final phase. Each task verifies via `cd frontend-web && npm run build` (must exit 0) **plus** manual QA of the named routes in **both light and dark**. The TDD red/green cadence is replaced by build-green + QA. Minimal runnable logic checks appear only where the spec calls for them (Task 22).
- **Build/deploy:** `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build` (runs `vite build --base=/assets/vernon_project/frontend_web/` then `copy-html.mjs`). Output deploys live immediately — there is no staging. Build before claiming any task done.
- **Aliases:** `@/*` → `../frontend/src/*` (shared/mobile — read-only, never edit), `@web/*` → `frontend-web/src/*`. Importing a `@web`-only primitive from `@/` (or vice-versa) compiles-looking but fails at runtime.
- **Tailwind JIT:** class strings must be full literals (no dynamic construction) so JIT detects them — matches the existing `bento.tsx` convention.
- **No backend/API changes.** All reads/writes go through existing `@/hooks/useData` hooks and `@/lib/api`. Never call `api.*` directly from a cell/component when a `useData` mutation exists — cache invalidation lives in the hooks' `onSettled`.
- **No mobile (`frontend/`) changes.** The `@` alias is consumed read-only.
- **No `alert/confirm/prompt`.** Use existing dialog/confirm/drawer overlays ([[vernon-no-alert-use-dialog]]).
- **Buttons are content-width.** Full-width buttons are banned product-wide; only inputs/textareas keep `w-full`.
- **Git:** commit only files this plan creates/edits (user works in parallel — re-check `git status` before each commit, `git add` own paths only). End commit messages with the standard Co-Authored-By / Claude-Session trailer.

---

## File Structure

**New files (all under `frontend-web/src/`):**
- `lib/tokens.css` *(optional split; or inline into `index.css`)* — semantic CSS variables.
- `components/Page.tsx` — `Page`, `PageHeader`, `Section`.
- `components/Property.tsx` — `Property`, `PropertyRow`.
- `components/EntityChip.tsx` — `EntityChip`.
- `components/HoverCard.tsx` — `HoverCard`.
- `components/DataTable.tsx` — `DataTable` + column/cell types + editable cell renderers.
- `lib/nav.ts` — `NAV_GROUPS` config + `useNavGroups()` gate-resolver.
- `components/MegaMenu.tsx` — `MegaMenu`.
- `components/TopNav.tsx` — `TopNav` (+ mobile sheet).
- `components/QuickCreate.tsx` — `QuickCreate` provider + `+ New` menu + `c` shortcut.
- `components/RelationsRail.tsx` — `RelationsRail`.

**Modified files:**
- `tailwind.config.js`, `index.html`, `src/index.css` — tokens + font.
- `src/components/bento.tsx` — flatten in place.
- `src/components/AppShell.tsx` — swap sidebar → `TopNav` + breadcrumb bar; mount `QuickCreate`.
- `src/components/CommandPalette.tsx` — records + actions.
- `src/pages/Today.tsx`, `Projects.tsx`, `Project.tsx`, `ProjectDetail.tsx`, `ProjectItem.tsx` — bespoke flat layouts + inline edit + relations.
- `src/pages/{Users,Groups,ReportPage,Review,Leaderboard,WalletLog,MarketplaceAdmin,Stations,AttendanceReport,AttendanceProfiles}.tsx` — table → `DataTable` (P5).

---

# Phase 0 — Foundation

### Task 1: Flat Notion design tokens

**Files:**
- Modify: `frontend-web/tailwind.config.js`
- Modify: `frontend-web/src/index.css:1-30`

**Interfaces:**
- Produces: Tailwind color utilities `bg-canvas`, `bg-surface`, `text-ink`, `text-muted`, `border-line`, `bg-hover`; `shadow-pop`; radius unchanged. CSS vars `--canvas/--surface/--ink/--muted/--line/--hover` defined for light + `html.dark`.

- [ ] **Step 1: Add semantic colors to Tailwind config.** Replace the `theme.extend` block in `tailwind.config.js` with (keep `brand`, keep keyframes/animation, add `pop`):

```js
theme: {
  extend: {
    colors: {
      brand: {
        50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
        400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
        800: '#3730a3', 900: '#312e81',
      },
      canvas:  'rgb(var(--canvas) / <alpha-value>)',
      surface: 'rgb(var(--surface) / <alpha-value>)',
      ink:     'rgb(var(--ink) / <alpha-value>)',
      muted:   'rgb(var(--muted) / <alpha-value>)',
      line:    'rgb(var(--line) / <alpha-value>)',
      hover:   'rgb(var(--hover) / <alpha-value>)',
    },
    fontFamily: {
      sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
    },
    boxShadow: {
      pop: '0 4px 24px -6px rgb(15 15 15 / 0.12), 0 1px 3px 0 rgb(15 15 15 / 0.06)',
      card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
      nav: '0 -1px 12px 0 rgb(0 0 0 / 0.06)',
    },
    keyframes: {
      'slide-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
      'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
      pop: { '0%': { transform: 'scale(.96)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
    },
    animation: {
      'slide-up': 'slide-up 0.25s ease-out',
      'fade-in': 'fade-in 0.2s ease-out',
      pop: 'pop 0.15s ease-out',
    },
  },
},
```

Note: `card`/`nav` shadows are kept temporarily so unmigrated pages still compile; remove `card` in P5 after the sweep.

- [ ] **Step 2: Define CSS variables + flat body in `index.css`.** Replace lines 5–30 (`:root` through `html.dark body`) with:

```css
:root {
  color-scheme: light;
  --canvas: 255 255 255;
  --surface: 255 255 255;
  --ink: 55 53 47;
  --muted: 120 119 116;
  --line: 233 233 231;
  --hover: 0 0 0;        /* used at low alpha via bg-hover/5 */
}
html.dark {
  color-scheme: dark;
  --canvas: 25 25 25;
  --surface: 32 32 32;
  --ink: 233 233 231;
  --muted: 151 151 147;
  --line: 47 47 47;
  --hover: 255 255 255;
}
html, body, #root { height: 100%; }
body {
  margin: 0;
  background: rgb(var(--canvas));
  color: rgb(var(--ink));
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  overscroll-behavior-y: none;
}
```

- [ ] **Step 3: Build.** `cd frontend-web && npm run build` → exit 0.
- [ ] **Step 4: QA.** Load `/w` (any page). Body bg is now white (light) / near-black `#191919` (dark); text is warm near-black/off-white. Tiles still look bento (not flattened yet — that's Task 3). No console errors.
- [ ] **Step 5: Commit.**

```bash
git add frontend-web/tailwind.config.js frontend-web/src/index.css
git commit -m "feat(web): flat Notion design tokens (semantic CSS vars)"
```

---

### Task 2: Load the Inter font

**Files:** Modify: `frontend-web/index.html:3-8` (inside `<head>`)

**Interfaces:** Produces: `Inter` actually available (was declared in `font-sans` but never loaded → previously fell back to system-ui).

- [ ] **Step 1: Add the font links** after the `theme-color` meta (line 7), matching the mobile app's Google Fonts approach:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Build.** `cd frontend-web && npm run build` → exit 0.
- [ ] **Step 3: QA.** Reload `/w`; DevTools → Network shows `Inter` woff2 loaded; body text renders in Inter (rounder than system Segoe/Helvetica). 
- [ ] **Step 4: Commit.** `git add frontend-web/index.html && git commit -m "feat(web): load Inter font"`

---

### Task 3: Flatten the bento primitives in place

**Files:** Modify: `frontend-web/src/components/bento.tsx` (whole file)

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: same exports & prop API (`BentoGrid`, `BentoTile`, `BentoStat`, types `Accent`/`Tone`/`Span`) — only the rendered classes change. The `accent` prop is still accepted but now only faintly tints; `tone='solid'/'gradient'` desaturate. **No consuming page is edited.**

- [ ] **Step 1: Replace `ACCENTS` + `BentoTile` toneClass + base classes.** Keep `Accent`/`Tone`/`Span` types and `SPAN` map verbatim. Replace the `ACCENTS` map (lines 18–27) with a flat, faint accent set used only for `tint`:

```ts
// Flat mode: accent only faintly tints a `tint` tile; gradient/solid degrade to subtle.
const ACCENT_TINT: Record<Accent, string> = {
  brand:   'bg-brand-50 dark:bg-brand-500/10',
  amber:   'bg-amber-50 dark:bg-amber-500/10',
  violet:  'bg-violet-50 dark:bg-violet-500/10',
  sky:     'bg-sky-50 dark:bg-sky-500/10',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10',
  rose:    'bg-rose-50 dark:bg-rose-500/10',
  slate:   'bg-black/[0.03] dark:bg-white/[0.04]',
}
```

- [ ] **Step 2: Rewrite `BentoTile`'s toneClass + `cls`** (lines 55–68) to flat surfaces (border, no shadow, smaller radius):

```ts
  const toneClass =
    tone === 'plain' ? 'bg-surface border border-line'
    : tone === 'tint' ? `${ACCENT_TINT[accent]} border border-line`
    : tone === 'gradient' ? 'bg-black/[0.02] dark:bg-white/[0.03] border border-line'
    : 'bg-surface border border-line'   // 'solid' degrades to plain in flat mode
  const clickable = !!to
  const cls = clsx(
    SPAN[span], tall && 'row-span-2',
    'rounded-lg p-4 transition flex flex-col text-ink',
    toneClass,
    clickable && 'hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04] cursor-pointer',
    className,
  )
```

Remove the `tone === 'solid' && 'text-white'` line (no more solid fills). Header markup (lines 69–82) is unchanged except swap `opacity-70`/`opacity-80` subtitle/icon to `text-muted` for crispness:
- icon: `className="h-4 w-4 shrink-0 text-muted"`
- subtitle: `className="truncate text-xs text-muted"`

- [ ] **Step 3: Flatten `BentoStat`** (lines 89–99) — smaller, muted label:

```ts
export function BentoStat({ value, label, delta, className }: {
  value: ReactNode; label: ReactNode; delta?: ReactNode; className?: string
}) {
  return (
    <div className={clsx('flex h-full flex-col justify-end', className)}>
      <div className="text-3xl font-semibold leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted">{label}</div>
      {delta && <div className="mt-1 text-xs text-muted">{delta}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Reduce `BentoGrid` gap** (line 31): change `gap-4` → `gap-3`.
- [ ] **Step 5: Build.** `npm run build` → exit 0.
- [ ] **Step 6: QA — the big one.** Walk `/`, `/projects`, `/leaderboard`, `/wallet`, `/reports` in light + dark. Every tile is now a flat bordered card (no rounded-3xl, no shadow, no gradient/solid fills). Hero/points tiles that used `gradient`/`solid` now read as plain bordered cards. No layout breakage (spans still work). No console errors.
- [ ] **Step 7: Commit.** `git add frontend-web/src/components/bento.tsx && git commit -m "feat(web): flatten bento primitives to Notion surfaces"`

---

### Task 4: `Page` / `PageHeader` / `Section` primitives

**Files:** Create: `frontend-web/src/components/Page.tsx`

**Interfaces:**
- Produces:
  - `Page({ children, className })` — centered max-width document column.
  - `PageHeader({ icon?, emoji?, title, subtitle?, actions?, children? })`.
  - `Section({ title?, actions?, divider?, children, className })`.

- [ ] **Step 1: Write the file.**

```tsx
import type { ReactNode, ComponentType } from 'react'
import clsx from 'clsx'

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mx-auto w-full max-w-5xl', className)}>{children}</div>
}

export function PageHeader({
  icon: Icon, emoji, title, subtitle, actions, children,
}: {
  icon?: ComponentType<{ className?: string }>; emoji?: string
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode
}) {
  return (
    <header className="mb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {emoji && <span className="text-2xl leading-none">{emoji}</span>}
          {Icon && <Icon className="h-6 w-6 shrink-0 text-muted" />}
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      {children}
    </header>
  )
}

export function Section({
  title, actions, divider = true, children, className,
}: {
  title?: ReactNode; actions?: ReactNode; divider?: boolean; children: ReactNode; className?: string
}) {
  return (
    <section className={clsx('py-5', divider && 'border-t border-line', className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">{title}</h2>}
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
```

- [ ] **Step 2: Build** → exit 0. **Step 3: Commit.** `git add frontend-web/src/components/Page.tsx && git commit -m "feat(web): add Page/PageHeader/Section primitives"`

---

### Task 5: `Property` / `PropertyRow` primitives

**Files:** Create: `frontend-web/src/components/Property.tsx`

**Interfaces:**
- Produces:
  - `PropertyRow({ children })` — a definition grid.
  - `Property({ label, icon?, children })` — one label→value row (Notion property style).

- [ ] **Step 1: Write the file.**

```tsx
import type { ReactNode, ComponentType } from 'react'

export function PropertyRow({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[8rem,1fr] gap-x-3 gap-y-1.5 text-sm">{children}</dl>
}

export function Property({
  label, icon: Icon, children,
}: {
  label: ReactNode; icon?: ComponentType<{ className?: string }>; children: ReactNode
}) {
  return (
    <>
      <dt className="flex items-center gap-1.5 py-1 text-muted">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="flex min-w-0 items-center py-1 text-ink">{children}</dd>
    </>
  )
}
```

- [ ] **Step 2: Build** → exit 0. **Step 3: Commit.** `git add frontend-web/src/components/Property.tsx && git commit -m "feat(web): add Property/PropertyRow primitives"`

---

### Task 6: `EntityChip` + `HoverCard`

**Files:**
- Create: `frontend-web/src/components/HoverCard.tsx`
- Create: `frontend-web/src/components/EntityChip.tsx`

**Interfaces:**
- Produces:
  - `HoverCard({ content, children, className })` — wraps a trigger; shows `content` panel on hover (120ms open / 200ms close delay), fixed-positioned near the trigger.
  - `EntityChip({ to?, icon?, image?, name, label, preview?, className })` — a small inline linked-record chip (avatar/icon + label); if `preview` given, wrapped in `HoverCard`.

- [ ] **Step 1: Write `HoverCard.tsx`** (self-contained; uses a portal-free fixed panel measured from the trigger rect):

```tsx
import { useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'

export function HoverCard({
  content, children, className,
}: { content: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const ref = useRef<HTMLSpanElement>(null)
  const enterT = useRef<number>()
  const leaveT = useRef<number>()

  const show = () => {
    window.clearTimeout(leaveT.current)
    enterT.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 320) })
      setOpen(true)
    }, 120)
  }
  const hide = () => {
    window.clearTimeout(enterT.current)
    leaveT.current = window.setTimeout(() => setOpen(false), 200)
  }

  return (
    <span ref={ref} className={clsx('inline-flex', className)} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {open && (
        <div
          onMouseEnter={show}
          onMouseLeave={hide}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-72 rounded-lg border border-line bg-surface p-3 text-sm shadow-pop animate-fade-in"
        >
          {content}
        </div>
      )}
    </span>
  )
}
```

- [ ] **Step 2: Write `EntityChip.tsx`** (uses shared `Avatar` for people, lucide icon otherwise):

```tsx
import type { ReactNode, ComponentType } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Avatar } from '@/components/ui'
import { HoverCard } from '@web/components/HoverCard'

export function EntityChip({
  to, icon: Icon, image, avatarName, label, preview, className,
}: {
  to?: string
  icon?: ComponentType<{ className?: string }>
  image?: string            // person avatar image url
  avatarName?: string       // person name → triggers Avatar render
  label: ReactNode
  preview?: ReactNode       // HoverCard content
  className?: string
}) {
  const inner = (
    <span className={clsx(
      'inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm text-ink',
      to && 'hover:bg-hover/[0.04]',
      className,
    )}>
      {avatarName != null
        ? <Avatar name={avatarName} image={image} size={18} />
        : Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />}
      <span className="truncate">{label}</span>
    </span>
  )
  const node = to ? <Link to={to}>{inner}</Link> : inner
  return preview ? <HoverCard content={preview}>{node}</HoverCard> : node
}
```

- [ ] **Step 3: Build** → exit 0. **Step 4: QA** — temporarily drop an `<EntityChip avatarName="Test" label="Test" />` into `BentoDemo.tsx`, confirm it renders, then remove. (Optional.)
- [ ] **Step 5: Commit.** `git add frontend-web/src/components/HoverCard.tsx frontend-web/src/components/EntityChip.tsx && git commit -m "feat(web): add EntityChip + HoverCard"`

---

### Task 7: `DataTable` with editable cells

**Files:** Create: `frontend-web/src/components/DataTable.tsx`

**Interfaces:**
- Consumes: `EntityChip` (Task 6), `STATUS`/`StatusKey` from `@/lib/status`, shared `EmptyState` from `@/components/ui`.
- Produces:
  - `type Column<T> = { key: string; header: ReactNode; width?: string; align?: 'left'|'right'; render: (row: T) => ReactNode; sortValue?: (row: T) => string | number }`
  - `DataTable<T>({ rows, columns, getKey, empty?, onRowClick?, activeKey? })` — flat sortable table (click header to sort), sticky header, hairline rows, hover, optional row selection highlight (`activeKey`).
  - Editable cell helpers (used inside a column's `render`): `EditableDateCell`, `EditableAssigneeCell`, `StatusCell` — defined in Task 13's consumer wiring, but the table itself stays presentation-only.

This task builds the **presentation table only**. Inline-edit cells come in Task 13 (they live where the mutation hooks are in scope).

- [ ] **Step 1: Write `DataTable.tsx`.**

```tsx
import { useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { EmptyState } from '@/components/ui'

export type Column<T> = {
  key: string
  header: ReactNode
  width?: string                 // e.g. 'w-40'
  align?: 'left' | 'right'
  render: (row: T) => ReactNode
  sortValue?: (row: T) => string | number
}

export function DataTable<T>({
  rows, columns, getKey, empty, onRowClick, activeKey,
}: {
  rows: T[]
  columns: Column<T>[]
  getKey: (row: T) => string
  empty?: ReactNode
  onRowClick?: (row: T) => void
  activeKey?: string
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a), bv = col.sortValue!(b)
      return av < bv ? -sort.dir : av > bv ? sort.dir : 0
    })
  }, [rows, sort, columns])

  if (rows.length === 0) {
    return <div className="py-10">{empty ?? <EmptyState title="Nothing here yet" />}</div>
  }

  const toggleSort = (c: Column<T>) => {
    if (!c.sortValue) return
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            {columns.map((c) => (
              <th
                key={c.key}
                className={clsx('px-3 py-2 font-medium', c.width, c.align === 'right' && 'text-right',
                  c.sortValue && 'cursor-pointer select-none')}
                onClick={() => toggleSort(c)}
              >
                <span className="inline-flex items-center gap-1">
                  {c.header}
                  {sort?.key === c.key && (sort.dir === 1
                    ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const k = getKey(row)
            return (
              <tr
                key={k}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  'border-b border-line/70 last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04]',
                  activeKey === k && 'bg-brand-50 dark:bg-brand-500/10',
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={clsx('px-3 py-2 align-middle', c.align === 'right' && 'text-right')}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Build** → exit 0.
- [ ] **Step 3: QA** — in `BentoDemo.tsx` temporarily render a `DataTable` over a 3-row array with a `sortValue` column; confirm sort toggles + empty state; remove the demo.
- [ ] **Step 4: Commit.** `git add frontend-web/src/components/DataTable.tsx && git commit -m "feat(web): add flat DataTable (sortable, presentation-only)"`

---

# Phase 1 — Shell (top navbar + mega menu)

### Task 8: `NAV_GROUPS` config + gate resolver

**Files:** Create: `frontend-web/src/lib/nav.ts`

**Interfaces:**
- Consumes: lucide icons; permission helpers `canManageUsers/canManageGroups/canManageBrands/canManageBadges/canManageMarketplace/canGrantPoints/canManageAttendance` from `@/hooks/useData`; `Boot` type (the `useBoot().data`).
- Produces:
  - `type NavLeaf = { to: string; label: string; sub: string; icon: LucideIcon; end?: boolean; badge?: 'review' }`
  - `type NavGroup = { id: string; label: string; to?: string; leaves: NavLeaf[] }` (`to` set ⇒ render as a plain link, no dropdown)
  - `function buildNavGroups(b: Boot | undefined): NavGroup[]` — returns Work, Rewards, Reports, and (gated) Admin, Attendance with exactly the current gate logic.

- [ ] **Step 1: Write the file.** Mirror the exact gates from `AppShell.tsx:154-171`. Each leaf gains a one-line `sub` for the mega menu.

```ts
import {
  Home, CalendarDays, FolderKanban, CheckCircle2, Video, StickyNote, MessageSquarePlus,
  Trophy, UsersRound, ShoppingBag, Wallet, Gift, BarChart3,
  Users as UsersIcon, Inbox, Layers, ShieldAlert, Settings as SettingsIcon, Tag,
  Zap, Store, Coins, QrCode, Monitor, UserCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  canManageGroups, canManageBrands, canManageUsers, canManageBadges,
  canManageMarketplace, canGrantPoints, canManageAttendance,
} from '@/hooks/useData'

export type NavLeaf = { to: string; label: string; sub: string; icon: LucideIcon; end?: boolean; badge?: 'review' }
export type NavGroup = { id: string; label: string; to?: string; leaves: NavLeaf[] }

const WORK: NavLeaf[] = [
  { to: '/', label: 'Today', sub: "Today's work & progress", icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', sub: 'Month & deadlines', icon: CalendarDays },
  { to: '/projects', label: 'Projects', sub: 'All projects & details', icon: FolderKanban },
  { to: '/review', label: 'Review', sub: 'Approve completed work', icon: CheckCircle2, badge: 'review' },
  { to: '/meetings', label: 'Meetings', sub: 'Schedule & notes', icon: Video },
  { to: '/notes', label: 'Notes', sub: 'Personal docs', icon: StickyNote },
  { to: '/feedback', label: 'Send feedback', sub: 'Tell us anything', icon: MessageSquarePlus },
]

const REWARDS: NavLeaf[] = [
  { to: '/leaderboard', label: 'Leaderboard', sub: 'Rankings & dimensions', icon: Trophy },
  { to: '/team-wall', label: 'Team Wall', sub: 'Recognition feed', icon: UsersRound },
  { to: '/marketplace', label: 'Marketplace', sub: 'Redeem rewards', icon: ShoppingBag },
  { to: '/wallet', label: 'Wallet', sub: 'Points balance & log', icon: Wallet },
  { to: '/gift-points', label: 'Gift Points', sub: 'Send points to peers', icon: Gift },
]

export function buildNavGroups(b: Parameters<typeof canManageUsers>[0]): NavGroup[] {
  const groups: NavGroup[] = [
    { id: 'work', label: 'Work', leaves: WORK },
    { id: 'rewards', label: 'Rewards', leaves: REWARDS },
    { id: 'reports', label: 'Reports', to: '/reports', leaves: [] },
  ]

  const admin: NavLeaf[] = [
    ...(canManageUsers(b) ? [{ to: '/users', label: 'Users', sub: 'People & roles', icon: UsersIcon }] : []),
    ...(canManageUsers(b) ? [{ to: '/feedback-inbox', label: 'Feedback', sub: 'Inbound feedback', icon: Inbox }] : []),
    ...(canManageGroups(b) ? [{ to: '/groups', label: 'Groups', sub: 'Work-type taxonomy', icon: Layers }] : []),
    ...(canManageGroups(b) ? [{ to: '/data-health', label: 'Data Health', sub: 'Integrity checks', icon: ShieldAlert }] : []),
    ...(canManageGroups(b) ? [{ to: '/settings', label: 'Settings', sub: 'System settings', icon: SettingsIcon }] : []),
    ...(canManageBrands(b) ? [{ to: '/brands', label: 'Brands', sub: 'Brand registry', icon: Tag }] : []),
    ...(canManageBadges(b) ? [{ to: '/gamification-settings', label: 'Gamification', sub: 'Badges & tiers', icon: Zap }] : []),
    ...(canManageMarketplace(b) ? [{ to: '/marketplace-admin', label: 'Marketplace Admin', sub: 'Manage rewards', icon: Store }] : []),
    ...(canGrantPoints(b) ? [{ to: '/grant-points', label: 'Grant Points', sub: 'Award points', icon: Coins }] : []),
  ] as NavLeaf[]
  if (admin.length) groups.push({ id: 'admin', label: 'Admin', leaves: admin })

  const att: NavLeaf[] = canManageAttendance(b) ? ([
    { to: '/attendance-report', label: 'Attendance', sub: 'Daily report', icon: QrCode },
    { to: '/attendance/schedules', label: 'Schedules', sub: 'Shift schedules', icon: CalendarDays },
    { to: '/attendance/stations', label: 'Stations', sub: 'Scan kiosks', icon: Monitor },
    { to: '/attendance/exceptions', label: 'Leave/WFH', sub: 'Exceptions', icon: Inbox },
    { to: '/attendance/holidays', label: 'Holidays', sub: 'Holiday lists', icon: CalendarDays },
    { to: '/attendance/profiles', label: 'Enrolled', sub: 'Enrolled members', icon: UserCheck },
  ] as NavLeaf[]) : []
  if (att.length) groups.push({ id: 'attendance', label: 'Attendance', leaves: att })

  return groups
}
```

- [ ] **Step 2: Build** → exit 0. **Step 3: Commit.** `git add frontend-web/src/lib/nav.ts && git commit -m "feat(web): NAV_GROUPS config + permission gate resolver"`

---

### Task 9: `MegaMenu` component

**Files:** Create: `frontend-web/src/components/MegaMenu.tsx`

**Interfaces:**
- Consumes: `NavGroup`/`NavLeaf` from `@web/lib/nav`; react-router `NavLink`/`useLocation`.
- Produces: `MegaMenu({ group, reviewCount, onNavigate })` — a top-level trigger button that opens a multi-column panel of its leaves on hover-intent + click; closes on route change, outside-click, Esc. If `group.to` is set, renders a plain `NavLink` (no panel).

- [ ] **Step 1: Write the file.**

```tsx
import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import type { NavGroup } from '@web/lib/nav'

export function MegaMenu({
  group, reviewCount, onNavigate,
}: { group: NavGroup; reviewCount: number; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const closeT = useRef<number>()
  const { pathname } = useLocation()

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  // Plain-link group (e.g. Reports): no dropdown.
  if (group.to) {
    return (
      <NavLink
        to={group.to}
        onClick={onNavigate}
        className={({ isActive }) => clsx(
          'rounded-md px-3 py-1.5 text-sm font-medium',
          isActive ? 'text-ink' : 'text-muted hover:text-ink hover:bg-hover/[0.04]',
        )}
      >
        {group.label}
      </NavLink>
    )
  }

  const groupActive = group.leaves.some((l) => l.end ? pathname === l.to : pathname.startsWith(l.to))
  const open$ = () => { window.clearTimeout(closeT.current); setOpen(true) }
  const close$ = () => { closeT.current = window.setTimeout(() => setOpen(false), 150) }

  return (
    <div ref={wrapRef} className="relative" onMouseEnter={open$} onMouseLeave={close$}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={clsx(
          'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium',
          groupActive ? 'text-ink' : 'text-muted hover:text-ink hover:bg-hover/[0.04]',
        )}
      >
        {group.label}
        <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[34rem] rounded-lg border border-line bg-surface p-2 shadow-pop animate-fade-in">
          <div className="grid grid-cols-2 gap-1">
            {group.leaves.map((l) => {
              const Icon = l.icon
              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  onClick={() => { setOpen(false); onNavigate?.() }}
                  className={({ isActive }) => clsx(
                    'flex items-start gap-2.5 rounded-md p-2.5',
                    isActive ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-hover/[0.04]',
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      {l.label}
                      {l.badge === 'review' && reviewCount > 0 && (
                        <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">{reviewCount}</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">{l.sub}</span>
                  </span>
                </NavLink>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build** → exit 0. **Step 3: Commit.** `git add frontend-web/src/components/MegaMenu.tsx && git commit -m "feat(web): MegaMenu dropdown"`

---

### Task 10: `TopNav` component (desktop bar + mobile sheet)

**Files:** Create: `frontend-web/src/components/TopNav.tsx`

**Interfaces:**
- Consumes: `buildNavGroups` (Task 8), `MegaMenu` (Task 9), `NotificationBell`, `Avatar`, `useBoot/useDashboard/useWallet`, `getStoredTheme/setTheme`, `logout`, `formatNumber`, `useModalA11y`, `OverflowMenu` from `@web/components/ui` for the avatar menu, `Plus`/`Search`/`Coins`/`Menu`/`X` icons.
- Produces: `TopNav({ onOpenPalette, onQuickCreate })` — the full sticky top bar; manages its own mobile sheet state.

- [ ] **Step 1: Write the file.** (Relocates logo, theme toggle, logout, profile from the old sidebar footer into a right-side avatar `OverflowMenu`.)

```tsx
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { FolderKanban, Search, Plus, Coins, Menu, X, Sun, Moon, Monitor, LogOut, User } from 'lucide-react'
import { useBoot, useDashboard, useWallet } from '@/hooks/useData'
import { Avatar } from '@/components/ui'
import { logout } from '@/lib/api'
import { getStoredTheme, setTheme, type Theme } from '@/lib/theme'
import { formatNumber } from '@/lib/format'
import { useModalA11y } from '@web/lib/useModalA11y'
import { NotificationBell } from '@web/components/NotificationBell'
import { MegaMenu } from '@web/components/MegaMenu'
import { buildNavGroups } from '@web/lib/nav'

const THEMES: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
]

export function TopNav({ onOpenPalette, onQuickCreate }: { onOpenPalette: () => void; onQuickCreate: () => void }) {
  const boot = useBoot()
  const dash = useDashboard()
  const wallet = useWallet()
  const reviewCount = dash.data?.counts.review ?? 0
  const [theme, setThemeState] = useState<Theme>(getStoredTheme())
  const [sheet, setSheet] = useState(false)
  const sheetRef = useModalA11y(sheet, () => setSheet(false))
  const { pathname } = useLocation()
  const b = boot.data
  const groups = buildNavGroups(b)
  const pickTheme = (t: Theme) => { setTheme(t); setThemeState(t) }
  const doLogout = async () => { await logout(); window.location.href = '/w' }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4 lg:px-6">
        {/* mobile hamburger */}
        <button className="lg:hidden -ml-1 p-1.5 text-muted" aria-label="Menu" aria-expanded={sheet}
          onClick={() => setSheet(true)}><Menu className="h-5 w-5" /></button>

        <NavLink to="/" className="flex items-center gap-2 font-semibold text-ink">
          <FolderKanban className="h-5 w-5 text-brand-600" /> <span className="hidden sm:inline">Vernon</span>
        </NavLink>

        {/* desktop mega menus */}
        <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
          {groups.map((g) => <MegaMenu key={g.id} group={g} reviewCount={reviewCount} />)}
        </nav>

        <div className="flex-1" />

        <button onClick={onOpenPalette}
          className="hidden items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:bg-hover/[0.04] sm:flex">
          <Search className="h-4 w-4" />
          <span className="hidden xl:inline">Search…</span>
          <kbd className="hidden xl:inline-flex rounded border border-line px-1.5 text-[10px]">⌘K</kbd>
        </button>
        <button onClick={onQuickCreate}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New</span>
        </button>
        <NotificationBell />
        <NavLink to="/wallet"
          className="hidden items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-sm font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 sm:flex">
          <Coins className="h-4 w-4" /> {wallet.data ? formatNumber(wallet.data.balance) : '—'}
        </NavLink>

        {/* avatar menu */}
        <AvatarMenu name={b?.full_name ?? '?'} image={b?.image ?? undefined} config={b?.avatar_config}
          theme={theme} pickTheme={pickTheme} onLogout={doLogout} />
      </div>

      {/* mobile full-screen sheet */}
      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSheet(false)} />
          <div ref={sheetRef} role="dialog" aria-modal="true" aria-label="Navigation" tabIndex={-1}
            className="absolute inset-y-0 left-0 w-[min(86vw,20rem)] overflow-y-auto bg-canvas p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold text-ink"><FolderKanban className="h-5 w-5 text-brand-600" /> Vernon</span>
              <button onClick={() => setSheet(false)} className="p-1.5 text-muted"><X className="h-5 w-5" /></button>
            </div>
            {groups.map((g) => (
              <div key={g.id} className="mb-3">
                <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.label}</div>
                {(g.to ? [{ to: g.to, label: g.label, sub: '', icon: FolderKanban }] : g.leaves).map((l) => {
                  const Icon = l.icon
                  return (
                    <NavLink key={l.to} to={l.to} end={(l as any).end} onClick={() => setSheet(false)}
                      className={({ isActive }) => `flex items-center gap-3 rounded-md px-2 py-2 text-sm ${isActive ? 'bg-brand-50 dark:bg-brand-500/10 text-ink' : 'text-muted hover:bg-hover/[0.04]'}`}>
                      <Icon className="h-4 w-4" /> {l.label}
                    </NavLink>
                  )
                })}
              </div>
            ))}
            <div className="mt-4 flex items-center gap-1 border-t border-line pt-3">
              {THEMES.map(({ value, icon: Icon, label }) => (
                <button key={value} onClick={() => pickTheme(value)} title={label} aria-pressed={theme === value}
                  className={`flex-1 rounded-md py-1.5 ${theme === value ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/15' : 'text-muted hover:bg-hover/[0.04]'}`}>
                  <Icon className="mx-auto h-4 w-4" />
                </button>
              ))}
            </div>
            <button onClick={doLogout} className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted hover:bg-hover/[0.04]">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        </div>
      )}
    </header>
  )
}

function AvatarMenu({
  name, image, config, theme, pickTheme, onLogout,
}: { name: string; image?: string; config?: unknown; theme: Theme; pickTheme: (t: Theme) => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useModalA11y(open, () => setOpen(false))
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Account" className="rounded-full">
        <Avatar name={name} image={image} config={config as any} size={30} />
      </button>
      {open && (
        <div ref={ref} role="menu" tabIndex={-1}
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-line bg-surface p-1.5 shadow-pop animate-fade-in">
          <div className="px-2 py-1.5 text-sm font-medium text-ink truncate">{name}</div>
          <NavLink to="/me" onClick={() => setOpen(false)} role="menuitem"
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted hover:bg-hover/[0.04]">
            <User className="h-4 w-4" /> My profile
          </NavLink>
          <div className="my-1.5 flex items-center gap-1 border-t border-line pt-1.5">
            {THEMES.map(({ value, icon: Icon, label }) => (
              <button key={value} onClick={() => pickTheme(value)} title={label} aria-pressed={theme === value}
                className={`flex-1 rounded-md py-1.5 ${theme === value ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/15' : 'text-muted hover:bg-hover/[0.04]'}`}>
                <Icon className="mx-auto h-4 w-4" />
              </button>
            ))}
          </div>
          <button onClick={onLogout} role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted hover:bg-hover/[0.04]">
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build** → exit 0 (TopNav not yet mounted; this just type-checks). **Step 3: Commit.** `git add frontend-web/src/components/TopNav.tsx && git commit -m "feat(web): TopNav bar + mobile sheet + avatar menu"`

---

### Task 11: Rewire `AppShell` → TopNav + breadcrumb bar, delete sidebar

**Files:** Modify: `frontend-web/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `TopNav` (Task 10), existing `CommandPalette`, `useCrumbs`/`buildCrumbs`, `QuickCreate` trigger (Task 13 wires the actual create; here pass a temporary no-op or local state opener).
- Produces: shell with no sidebar; `<Outlet/>` inside `Page`-width main.

- [ ] **Step 1: Strip the sidebar + dual headers; render TopNav + breadcrumb bar.** Replace the component body's return (AppShell.tsx:257-328) with:

```tsx
  return (
    <div className="min-h-screen bg-canvas text-ink font-sans">
      <TopNav onOpenPalette={() => setPaletteOpen(true)} onQuickCreate={() => setQuickOpen(true)} />
      {/* breadcrumb context bar */}
      <div className="sticky top-14 z-20 border-b border-line bg-canvas/85 px-4 lg:px-6 backdrop-blur">
        <nav aria-label="Breadcrumb" className="mx-auto flex h-9 max-w-5xl items-center gap-1.5 text-sm">
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-line" />}
              {c.to
                ? <NavLink to={c.to} className="truncate text-muted hover:text-ink">{c.label}</NavLink>
                : <span className="truncate font-medium text-ink">{c.label}</span>}
            </span>
          ))}
        </nav>
      </div>
      <main className="px-4 py-6 lg:px-6">
        <Outlet />
      </main>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} navCommands={navCommands} />}
      {/* QuickCreate mounted here in Task 13 */}
    </div>
  )
```

- [ ] **Step 2: Delete the now-dead code:** the `sidebar` JSX (208-255), `renderItem` (179-199), `sectionLabel` (201-205), `MAIN`/`REWARDS` consts (57-74) **if** no longer referenced, the `accentFor`/`ACTIVE_PILL`/`Accent` import (26-47, 21), `drawerOpen`/`drawerRef`/`THEMES`/`THEME_LABEL`/`pickTheme`/`doLogout`/`theme` state, and the now-unused lucide/`Avatar`/`logout`/`theme`/`formatNumber` imports. **Keep:** `useBoot`, the `admin`-gate imports are now used by `nav.ts` not here (remove from AppShell), `useDashboard` (still used? only for reviewCount which moved to TopNav — remove if unused), `useCrumbs`, `buildCrumbs`/`SECTION`, `navCommands` build (still feeds palette — but it referenced `MAIN`/`REWARDS`/`admin`; rebuild it from `buildNavGroups(b)` instead, see Step 3), `CommandPalette`, `paletteOpen`, the ⌘K effect.

- [ ] **Step 3: Rebuild `navCommands` from nav groups** (replace AppShell.tsx:173-177). Since the palette still wants flat page commands:

```tsx
import { buildNavGroups } from '@web/lib/nav'
// ...inside component, after `const b = boot.data`:
const navCommands: Command[] = buildNavGroups(b).flatMap((g) =>
  (g.to ? [{ id: g.to, label: g.label, group: g.label, icon: FolderKanban, to: g.to }]
        : g.leaves.map((l) => ({ id: l.to, label: l.label, group: g.label, icon: l.icon, to: l.to }))),
)
```

(Keep a single `FolderKanban` import for the Reports fallback icon; or use the group's own.) Add `const [quickOpen, setQuickOpen] = useState(false)` (consumed in Task 13; until then the QuickCreate mount is absent so `quickOpen` is set-only — acceptable for this task, or temporarily pass `onQuickCreate={onOpenPalette}` and add `quickOpen` in Task 13).

- [ ] **Step 4: Build** → exit 0. Resolve any unused-import TS errors by deleting them.
- [ ] **Step 5: QA — primary.** Load `/w` desktop: top navbar with **Work▾ Rewards▾ Reports** (+ Admin▾/Attendance▾ if your role has them); hover/click opens mega panels with icon+sublabel; active route's top item is inked. Breadcrumb bar sits under the navbar. ⌘K still opens palette. Avatar menu (top-right) → profile/theme/logout work. Resize <1024px: hamburger opens the full-screen sheet with all groups; closes on nav. **+ New** button visible (no-op until Task 13). Light + dark. No sidebar remains. No console errors.
- [ ] **Step 6: Commit.** `git add frontend-web/src/components/AppShell.tsx && git commit -m "feat(web): replace sidebar with TopNav + breadcrumb bar"`

---

# Phase 2 — Speed

### Task 12: Power command palette (records + actions)

**Files:** Modify: `frontend-web/src/components/CommandPalette.tsx`

**Interfaces:**
- Consumes: `useCalendar()` → `{ todos: ProjectItem[] }`, `useProjects()` → `ProjectCard[]`, `useFormOptions()` → `{ users: {value,label}[] }` (permission-safe), all from `@/hooks/useData`. Optional `actions: Command[]` prop (advance/quick-create injected by AppShell later).
- Produces: palette that indexes Pages (navCommands) + Projects + Todos + People, grouped, still fuzzy + arrow-nav.

- [ ] **Step 1: Extend the data sources.** Add hooks + build commands. Replace the `commands` useMemo (CommandPalette.tsx:36-45):

```tsx
import { useProjects, useCalendar, useFormOptions } from '@/hooks/useData'
import { FolderKanban, CheckSquare, User } from 'lucide-react'
// ...
  const projects = useProjects()
  const calendar = useCalendar()
  const formOpts = useFormOptions()

  const commands = useMemo<Command[]>(() => {
    const proj: Command[] = (projects.data ?? []).map((p) => ({
      id: `project:${p.name}`, label: p.project_name || p.name, group: 'Projects', icon: FolderKanban, to: `/project/${p.name}`,
    }))
    const todos: Command[] = (calendar.data?.todos ?? []).map((t) => ({
      id: `todo:${t.name}`, label: t.to_do, group: 'Todos', icon: CheckSquare,
      to: `/project-item/${t.name}`,
    }))
    const people: Command[] = (formOpts.data?.users ?? []).map((u) => ({
      id: `user:${u.value}`, label: u.label, group: 'People', icon: User, to: `/users/${u.value}`,
    }))
    return [...navCommands, ...proj, ...todos, ...people]
  }, [navCommands, projects.data, calendar.data, formOpts.data])
```

- [ ] **Step 2: Update placeholder + dedupe key.** Change the input placeholder (line 99) to `"Search pages, projects, todos, people…"`. The `id` prefixes above keep keys unique across groups.
- [ ] **Step 3: Build** → exit 0.
- [ ] **Step 4: QA.** ⌘K → type a todo title → it appears under "Todos", Enter opens `/project-item/<name>`. Type a teammate name → "People" → opens their user page (if permitted; non-admins land on `/users/:name` which may 403-guard — acceptable, person jump is primarily an admin affordance). Project + page jumps still work. Arrow keys + Enter intact.
- [ ] **Step 5: Commit.** `git add frontend-web/src/components/CommandPalette.tsx && git commit -m "feat(web): power command palette — todos + people + projects"`

---

### Task 13: Global quick-create + inline-edit cells

**Files:**
- Create: `frontend-web/src/components/QuickCreate.tsx`
- Modify: `frontend-web/src/components/AppShell.tsx` (mount QuickCreate; `c` shortcut)
- Create: editable-cell exports appended to `frontend-web/src/components/DataTable.tsx`

**Interfaces:**
- Consumes (QuickCreate): existing create drawers — `CreateProjectItemDialog`/`ProjectFormDialog` (paths per [[vernon-web-ui-primitives]]) and `/notes/new` route navigation; `useParams`/`useNavigate` for context.
- Consumes (cells): `useAdvance()` from `@/components/AdvanceProvider` (call `advance(todo.name, label, todo.to_do)`), `useUpdateTodo(todoId)` from `@/hooks/useData` (`.mutate({ assigned_to })`, `.mutate({ deadline })`), `STATUS` from `@/lib/status`, `SearchableSelect` from `@/components/SearchableSelect`, `useFormOptions` for the assignee list.
- Produces:
  - `QuickCreate({ open, onClose })` — small menu (Task / Note / Project) → opens the matching drawer/route, prefilled with the active project (`useParams().name`) and today's date.
  - `StatusCell({ todo })`, `EditableAssigneeCell({ todo })`, `EditableDateCell({ todo, field })` — drop-in cell renderers for `DataTable` columns.

- [ ] **Step 1: Write `QuickCreate.tsx`.** Reuse existing drawers; do not author new forms.

```tsx
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckSquare, StickyNote, FolderKanban } from 'lucide-react'
import { CreateProjectItemDialog } from '@web/pages/ProjectDetail' // export if not already; else use the project page's drawer
import { ProjectFormDialog } from '@web/pages/Projects'

export function QuickCreate({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const { name } = useParams()           // active project/detail context, if any
  const [task, setTask] = useState(false)
  const [project, setProject] = useState(false)

  if (!open && !task && !project) return null

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50" onClick={onClose}>
          <div className="absolute right-4 top-16 w-56 rounded-lg border border-line bg-surface p-1.5 shadow-pop animate-pop"
            onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { onClose(); setTask(true) }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-hover/[0.04]">
              <CheckSquare className="h-4 w-4 text-brand-600" /> New task
            </button>
            <button onClick={() => { onClose(); nav('/notes/new') }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-hover/[0.04]">
              <StickyNote className="h-4 w-4 text-brand-600" /> New note
            </button>
            <button onClick={() => { onClose(); setProject(true) }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-hover/[0.04]">
              <FolderKanban className="h-4 w-4 text-brand-600" /> New project
            </button>
          </div>
        </div>
      )}
      {task && <CreateProjectItemDialog projectDetail={name} onClose={() => setTask(false)} />}
      {project && <ProjectFormDialog onClose={() => setProject(false)} />}
    </>
  )
}
```

*Implementer note:* confirm the exact create-drawer component names + required props in `ProjectDetail.tsx`/`Projects.tsx`; export them if not already exported. If a drawer requires a project context that's absent (creating a task from a non-project page), open it with an empty project picker (the drawer already contains a project `SearchableSelect`).

- [ ] **Step 2: Mount in AppShell + `c` shortcut.** In `AppShell.tsx`: add `const [quickOpen, setQuickOpen] = useState(false)`, render `<QuickCreate open={quickOpen} onClose={() => setQuickOpen(false)} />` before `</div>`, and extend the keydown effect (don't fire while typing in an input):

```tsx
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !/^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName) && !(e.target as HTMLElement)?.isContentEditable) {
        e.preventDefault(); setQuickOpen(true)
      }
```

Wire `TopNav onQuickCreate={() => setQuickOpen(true)}`.

- [ ] **Step 3: Append editable cells to `DataTable.tsx`.**

```tsx
import { useAdvance } from '@/components/AdvanceProvider'
import { useUpdateTodo, useFormOptions } from '@/hooks/useData'
import { STATUS } from '@/lib/status'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Avatar } from '@/components/ui'
import type { ProjectItem } from '@/lib/types'

export function StatusCell({ todo }: { todo: ProjectItem }) {
  const advance = useAdvance()
  const meta = STATUS[todo.status_key]
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`rounded px-1.5 py-0.5 text-xs ${meta.pill}`}>{meta.emoji} {meta.label}</span>
      {todo.can_advance && todo.next_status_label && (
        <button onClick={(e) => { e.stopPropagation(); advance(todo.name, todo.next_status_label!, todo.to_do) }}
          className="rounded border border-line px-1.5 py-0.5 text-xs text-muted hover:bg-hover/[0.04]">
          {todo.next_status_label}
        </button>
      )}
    </span>
  )
}

export function EditableAssigneeCell({ todo }: { todo: ProjectItem }) {
  const update = useUpdateTodo(todo.name)
  const opts = useFormOptions()
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <SearchableSelect
        value={todo.assigned_to ?? ''}
        options={(opts.data?.users ?? [])}
        onChange={(v) => update.mutate({ assigned_to: v })}
        renderTrigger={() => (
          <span className="inline-flex items-center gap-1.5">
            <Avatar name={todo.assigned_to_name ?? '—'} image={todo.assigned_to_image} size={18} />
            <span className="truncate">{todo.assigned_to_name ?? 'Unassigned'}</span>
          </span>
        )}
      />
    </span>
  )
}

export function EditableDateCell({ todo, field = 'deadline' }: { todo: ProjectItem; field?: 'deadline' | 'start_date' }) {
  const update = useUpdateTodo(todo.name)
  return (
    <input type="date" defaultValue={(todo as any)[field] ?? ''} onClick={(e) => e.stopPropagation()}
      onChange={(e) => update.mutate({ [field]: e.target.value })}
      className="rounded border border-line bg-transparent px-1.5 py-0.5 text-sm" />
  )
}
```

*Implementer note:* `SearchableSelect`'s exact prop names (`renderTrigger`/`value`/`options`/`onChange`) must be verified against `@/components/SearchableSelect` — adapt the call to its real signature (it handles Enter-to-pick inside forms per [[vernon-web-ui-primitives]]). All writes go through `useUpdateTodo`/`useAdvance` so invalidation is automatic — never call `api` directly here.

- [ ] **Step 4: Build** → exit 0.
- [ ] **Step 5: QA.** `+ New` (and `c`) opens the menu → New task opens the create drawer prefilled with the current project; New note → `/notes/new`; New project → project drawer. (Cells QA happens in Task 16 once mounted in a real table.) No `c` firing while typing in a field.
- [ ] **Step 6: Commit.** `git add frontend-web/src/components/QuickCreate.tsx frontend-web/src/components/AppShell.tsx frontend-web/src/components/DataTable.tsx && git commit -m "feat(web): global quick-create + inline-edit cells"`

---

# Phase 3 — Relations

### Task 14: `RelationsRail` + EntityChip rollout helpers

**Files:**
- Create: `frontend-web/src/components/RelationsRail.tsx`
- (EntityChip from Task 6 is reused; this task adds the rail + a todo→chips helper.)

**Interfaces:**
- Consumes: `EntityChip` (Task 6), `Section` (Task 4), `ProjectItem`/`ProjectDetail` types.
- Produces:
  - `RelationsRail({ groups })` where `groups: { title: string; chips: ReactNode[] }[]` — a right-column stack of `Section`s of `EntityChip`s.
  - `todoRelationChips(todo: ProjectItem): ReactNode` — convenience: project + assignee + brand chips for a todo row.

- [ ] **Step 1: Write the file.**

```tsx
import type { ReactNode } from 'react'
import { FolderKanban, Tag } from 'lucide-react'
import { Section } from '@web/components/Page'
import { EntityChip } from '@web/components/EntityChip'
import type { ProjectItem } from '@/lib/types'

export function RelationsRail({ groups }: { groups: { title: string; chips: ReactNode[] }[] }) {
  return (
    <aside className="space-y-0">
      {groups.filter((g) => g.chips.length).map((g) => (
        <Section key={g.title} title={g.title}>
          <div className="flex flex-wrap gap-1.5">{g.chips}</div>
        </Section>
      ))}
    </aside>
  )
}

export function todoRelationChips(t: ProjectItem): ReactNode[] {
  const chips: ReactNode[] = []
  if (t.project) chips.push(
    <EntityChip key="p" to={`/project/${t.project}`} icon={FolderKanban} label={t.project_name || t.project}
      preview={<div className="space-y-1"><div className="font-medium">{t.project_name}</div>
        {t.project_owner_name && <div className="text-xs text-muted">Owner: {t.project_owner_name}</div>}
        {t.project_leader_name && <div className="text-xs text-muted">Leader: {t.project_leader_name}</div>}</div>} />)
  if (t.assigned_to) chips.push(
    <EntityChip key="a" avatarName={t.assigned_to_name ?? '—'} image={t.assigned_to_image} label={t.assigned_to_name ?? 'Unassigned'} />)
  if (t.brand) chips.push(<EntityChip key="b" icon={Tag} label={t.brand} />)
  return chips
}
```

- [ ] **Step 2: Build** → exit 0. **Step 3: Commit.** `git add frontend-web/src/components/RelationsRail.tsx && git commit -m "feat(web): RelationsRail + todo relation chips"`

(EntityChips get placed into the real pages in Phase 4, where the page layouts are rewritten.)

---

# Phase 4 — Bespoke Notion document layouts

> These 4 tasks rewrite page layouts using the Phase 0–3 primitives. Each replaces the page's `BentoGrid` body with a `Page` document layout. **Preserve all existing data hooks, filters, lens state, localStorage keys, and the master-detail `<Outlet/>`** — change presentation only. Keep `useSetCrumbs` calls.

### Task 15: `Today` flat dashboard

**Files:** Modify: `frontend-web/src/pages/Today.tsx`

- [ ] **Step 1.** Replace the `BentoGrid` return with a `Page` layout: `PageHeader` (greeting + date), a compact stat strip (Due/Overdue/Upcoming/To-review as plain `text-2xl tabular-nums` numbers in a `flex gap-6`, not tiles), keep the `Segmented` lens + `FilterButton`/`Popover` verbatim, then render the `mine` lens as three `Section`s ("Overdue"/"Today"/"Upcoming") of flat `TodoCard` rows (or plain rows) using `todoRelationChips(t)` for the project/assignee/brand links. Other lenses keep the `ProjectCard` grid but inside `Section`s. Drop the gradient `Ring` hero (or render a small mono ring).
- [ ] **Step 2.** Build → exit 0. **Step 3.** QA `/` light+dark: greeting, stat strip, lens switch, filters, task lists with relation chips; clicking a todo/project navigates. **Step 4.** Commit `feat(web): flat Notion Today dashboard`.

### Task 16: `Project` + `ProjectDetail` document layout + inline table

**Files:** Modify: `frontend-web/src/pages/Project.tsx`, `frontend-web/src/pages/ProjectDetail.tsx`

- [ ] **Step 1 (ProjectDetail).** Replace its bento body with: `Page` → `PageHeader` (title + edit/delete actions via existing `OverflowMenu`) → `PropertyRow` of `Property` items (Status via `StatusCell`-style pill, Owner/Leader as `EntityChip` people, Deadline, Brand chip, est. summary) → flat rich-HTML meta `Section`s (keep `sanitizeHtml` + `dangerouslySetInnerHTML`) → a `DataTable` of `project_items` with columns: Task (`to_do`, click selects → existing Outlet selection), Status (`StatusCell`), Assignee (`EditableAssigneeCell`), Deadline (`EditableDateCell`), grouped Open/Completed/Cancelled as today. Keep the `xl:grid-cols-[…]` master-detail with the `<Outlet/>` pane on the right, plus a `RelationsRail` section (Team, Brand, Comments links) above or below the Outlet. Preserve `useSetCrumbs`, `useAdvance`, selection ring.
- [ ] **Step 2 (Project).** Same treatment: `PageHeader` + `PropertyRow` (owner/leader/dates/progress) + Team workload as `EntityChip` people row + Details `DataTable` (List/Gantt toggle preserved) + Outlet/`CommentThread` pane. Keep blocked-by / Goal banners as flat `Section`s.
- [ ] **Step 3.** Build → exit 0. **Step 4.** QA both pages light+dark: properties render with chips; **inline edit works** — change a todo's assignee (SearchableSelect writes via `useUpdateTodo`, row refreshes), change a deadline (date input writes), advance status (confirm dialog via `useAdvance`); selecting a row opens it in the Outlet; relation chips hover-preview and navigate; Gantt toggle intact. **Step 5.** Commit `feat(web): Notion document layout + inline edit for Project/ProjectDetail`.

### Task 17: `Projects` flat list

**Files:** Modify: `frontend-web/src/pages/Projects.tsx`

- [ ] **Step 1.** Replace bento body with `Page` → `PageHeader` (title + "New project" via QuickCreate/existing drawer) → keep search input + `Segmented` status + filter `Popover` verbatim → per-brand collapsible `Section`s (preserve `localStorage` collapse state + `byBrand` grouping) each rendering a `DataTable` of `ProjectCard`s: columns Name (link), Progress (`ProgressBar` + `item_done`/`item_total`), Owner (`EntityChip` `owner_name`), Status, Overdue/Review counts. 
- [ ] **Step 2.** Build → exit 0. **Step 3.** QA `/projects` light+dark: grouping, collapse persistence, search/filter, row → `/project/:name`. **Step 4.** Commit `feat(web): flat Projects list with DataTable`.

---

# Phase 5 — Sweep the rest

### Task 18: Migrate hand-written tables → `DataTable`

**Files:** Modify (one commit per page or small batches): `frontend-web/src/pages/{Users,Groups,ReportPage,Review,Leaderboard,WalletLog,MarketplaceAdmin,Stations,AttendanceReport,AttendanceProfiles}.tsx`

- [ ] For each page: replace its hand-rolled `<table>…</table>` with `<DataTable rows={…} columns={…} getKey={…} />`, mapping existing columns to `Column<T>` defs (use `EntityChip` for any user/project/brand reference, `sortValue` for sortable numeric/date columns). Keep the page's data hook, filters, and actions. Wrap the page in `Page` + `PageHeader` for consistency. Build + QA each page (light+dark) before committing. Commit per page: `refactor(web): <Page> → DataTable`.

*Note: this is mechanical application of Task 7's `DataTable` + Task 6's `EntityChip`; no new APIs. Pages not listed already flattened in Task 3 and need no table work.*

### Task 19: Per-route flat QA sweep

**Files:** none (or small fixes as found)

- [ ] Walk **every** route from the route table (`App.tsx`) in light + dark. For any page that reads awkwardly flat (leftover reliance on removed `tone='solid'`/gradient emphasis, cramped spacing, color-coded tiles that lost meaning), apply a targeted fix: swap to `Section`/`PropertyRow`, add a status pill, or adjust spans. One commit per fix or a single `fix(web): flat-layout polish sweep` commit. Remove the temporary `shadow-card` token from `tailwind.config.js` if no page still uses `shadow-card` (grep first).

### Task 20: Minimal logic self-checks + final verification

**Files:** Create: `frontend-web/src/lib/__checks__/palette.test-lite.ts` (or a tiny assert-based `demo()` run via `node`/vitest if available — else an inline `console.assert` module imported in dev only).

- [ ] **Step 1.** Add a runnable check for the two non-trivial logic bits the spec named:
  - **Palette fuzzy filter:** given commands `[{label:'Fix login',group:'Todos'},{label:'Projects',group:'Pages'}]` and query `"log"`, the filter (extract the predicate from `CommandPalette` into a pure `matchCommand(c, q)` helper and import it) returns only "Fix login". Assert it.
  - **Inline-edit field mapping:** assert `updateTodoFields` builds `{ assigned_to }` / `{ deadline }` correctly (extract the field key into a tiny pure mapper if helpful) — i.e. the cell calls `update.mutate` with the documented server field names (`assigned_to`, `deadline`, `start_date`).
- [ ] **Step 2.** Run the check (whatever runner the repo has; if none, a `node --import tsx`/`vitest run` one-off). Both assertions pass.
- [ ] **Step 3.** Full final build `cd frontend-web && npm run build` → exit 0. Final QA pass of the 4 bespoke pages + nav + palette + quick-create in light + dark.
- [ ] **Step 4.** Commit `test(web): palette fuzzy + inline-edit field-map checks`.

---

## Self-Review

**Spec coverage:**
- §A1 tokens → Task 1. §A2 font → Task 2. §A3 flatten bento → Task 3. §A4 primitives: Page/Section → Task 4, Property → Task 5, EntityChip/HoverCard → Task 6, DataTable → Task 7. ✓
- §B top-nav/mega/grouping/breadcrumb/mobile/active-state → Tasks 8–11. ✓
- §C1 quick-create → Task 13; §C2 power palette → Task 12; §C3 inline edit → Task 13 cells + applied Task 16. ✓
- §D relations (EntityChip rollout, hover, rail) → Task 14 + applied Tasks 15–17. ✓
- §E bespoke pages → Today (15), Project/ProjectDetail (16), Projects (17). ✓
- §F sweep → Tasks 18–19. ✓
- Testing → Task 20. ✓

**Placeholder scan:** Two "implementer note" blocks (Tasks 13) flag real signatures to confirm at the call site (`SearchableSelect` props, create-drawer export names) rather than fabricate them — these are bounded verification steps against named files, not open TODOs. All new files have complete code.

**Type consistency:** Todo fields use the verified `ProjectItem` names throughout (`to_do`, `status_key`, `next_status_label`, `can_advance`, `assigned_to`/`assigned_to_name`/`assigned_to_image`, `deadline`, `project`/`project_name`, `brand`, `project_owner_name`/`project_leader_name`). Advance is `useAdvance()` → `advance(name, label, to_do)`; field writes are `useUpdateTodo(name).mutate({...})`. Project cards use `ProjectCard` names (`owner_name`, `progress`, `item_done`/`item_total`). `Column<T>`/`DataTable` signatures match between Task 7 and Tasks 16–18.

## Execution Handoff

(filled in after save)
