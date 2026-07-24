# Keyboard Shortcuts (/w) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add discoverable keyboard shortcuts to the web app (`/w`): a `?` cheat-sheet, global navigation/creation keys, and contextual keys for an open task.

**Architecture:** Pure key-resolution logic + a display list live in one dependency-free module (`lib/shortcuts.ts`, unit-tested). A `useShortcuts` hook + `ShortcutsHelp` overlay (`components/ShortcutsHelp.tsx`) register the global listener and render the cheat-sheet from that list. Contextual todo keys are wired *inside* `ProjectItem.tsx` (the sole component rendered for an open todo, in both the drawer and the full page), so they auto-scope to "a todo is open" with no global registry.

**Tech Stack:** React + TypeScript + Vite, react-router-dom, existing `useModalA11y`, `useFocusTimer`, `useUpdateTodo`. Tests run via the repo's `*.selfcheck.ts` convention, executed with the already-installed esbuild (no new deps).

## Global Constraints

- **Web only.** `frontend-web/` (`/w`). `/m` is a touch PWA — no keyboard, no mobile counterpart. (Explicit one-platform change per the two-frontend rule.)
- **No new dependencies.** Reuse installed libs only.
- **One display source of truth:** the `SHORTCUTS` list in `lib/shortcuts.ts` is the only place the cheat-sheet's rows are defined.
- **Editable-field guard:** single-letter shortcuts never fire when focus is in `INPUT`/`TEXTAREA`/`SELECT`/`contentEditable`. `⌘K` and `⌘S` deliberately fire even in fields.
- **Selfcheck runner:** `cd frontend-web && node_modules/.bin/esbuild <file>.selfcheck.ts --bundle --platform=node --format=esm | node --input-type=module`
- **Ship tail (after code):** rebuild `/w` bundle; add an `App Release` row (Bahasa, `platform: Web`, `published: 1`); run the `gen_docs.py` staleness check (expected: no diff — no DocType/endpoint change).

---

### Task 1: Pure shortcut logic + selfcheck

**Files:**
- Create: `frontend-web/src/lib/shortcuts.ts`
- Test: `frontend-web/src/lib/shortcuts.selfcheck.ts`

**Interfaces:**
- Produces:
  - `type GlobalAction = { kind: 'help' } | { kind: 'palette' } | { kind: 'quick' } | { kind: 'task' } | { kind: 'nav'; to: string } | { kind: 'startG' }`
  - `resolveGlobalKey(pendingG: boolean, key: string): GlobalAction | null`
  - `isEditableTarget(el: EventTarget | null): boolean`
  - `type ShortcutGroup = { title: string; rows: { keys: string; label: string }[] }`
  - `SHORTCUTS: ShortcutGroup[]`

- [ ] **Step 1: Write the failing test**

Create `frontend-web/src/lib/shortcuts.selfcheck.ts`:

```ts
import assert from 'node:assert/strict'
import { resolveGlobalKey, isEditableTarget, SHORTCUTS } from './shortcuts'

// bare keys
assert.deepEqual(resolveGlobalKey(false, '?'), { kind: 'help' })
assert.deepEqual(resolveGlobalKey(false, '/'), { kind: 'palette' })
assert.deepEqual(resolveGlobalKey(false, 'c'), { kind: 'quick' })
assert.deepEqual(resolveGlobalKey(false, 'n'), { kind: 'task' })
assert.deepEqual(resolveGlobalKey(false, 'g'), { kind: 'startG' })
assert.equal(resolveGlobalKey(false, 'x'), null)

// g-prefix sequences
assert.deepEqual(resolveGlobalKey(true, 'h'), { kind: 'nav', to: '/' })
assert.deepEqual(resolveGlobalKey(true, 'p'), { kind: 'nav', to: '/projects' })
assert.deepEqual(resolveGlobalKey(true, 'r'), { kind: 'nav', to: '/review' })
assert.deepEqual(resolveGlobalKey(true, 'n'), { kind: 'nav', to: '/notes' })   // g n = notes, not new-task
assert.deepEqual(resolveGlobalKey(true, 'c'), { kind: 'nav', to: '/calendar' })// g c = calendar, not quick-create
assert.equal(resolveGlobalKey(true, 'z'), null)                                 // unknown second key

// editable guard
assert.equal(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget), true)
assert.equal(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget), true)
assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget), true)
assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: false } as unknown as EventTarget), false)
assert.equal(isEditableTarget(null), false)

// display list is non-empty and every row has keys + label
assert.ok(SHORTCUTS.length >= 2)
for (const g of SHORTCUTS) for (const r of g.rows) { assert.ok(r.keys); assert.ok(r.label) }

console.log('shortcuts.selfcheck: all assertions passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend-web && node_modules/.bin/esbuild src/lib/shortcuts.selfcheck.ts --bundle --platform=node --format=esm | node --input-type=module`
Expected: FAIL — esbuild error `Could not resolve "./shortcuts"` (module not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `frontend-web/src/lib/shortcuts.ts`:

```ts
// Keyboard-shortcut logic for /w. Pure + dependency-free so it unit-tests in
// node (via esbuild). The React hook + overlay live in components/ShortcutsHelp.

export type GlobalAction =
  | { kind: 'help' }
  | { kind: 'palette' }
  | { kind: 'quick' }
  | { kind: 'task' }
  | { kind: 'nav'; to: string }
  | { kind: 'startG' }

// `g` prefix targets (gmail-style go-to nav).
const G_NAV: Record<string, string> = {
  h: '/',
  p: '/projects',
  r: '/review',
  n: '/notes',
  c: '/calendar',
}

/**
 * Resolve a keypress to an action. `pendingG` is true when the previous key was
 * `g` and we're inside the sequence window. Returns null for "ignore". Timing
 * lives in the hook; this is the pure state map (so it's testable in node).
 */
export function resolveGlobalKey(pendingG: boolean, key: string): GlobalAction | null {
  if (pendingG) {
    const to = G_NAV[key]
    return to ? { kind: 'nav', to } : null
  }
  switch (key) {
    case '?': return { kind: 'help' }
    case '/': return { kind: 'palette' }
    case 'c': return { kind: 'quick' }
    case 'n': return { kind: 'task' }
    case 'g': return { kind: 'startG' }
    default: return null
  }
}

/** True when the event target is a text-entry field — shortcuts must not hijack typing. */
export function isEditableTarget(el: EventTarget | null): boolean {
  const t = el as (HTMLElement & { tagName?: string }) | null
  if (!t || !t.tagName) return false
  return /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable === true
}

export type ShortcutGroup = { title: string; rows: { keys: string; label: string }[] }

// Single display source of truth for the `?` cheat-sheet.
export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Anywhere',
    rows: [
      { keys: '?', label: 'Show keyboard shortcuts' },
      { keys: '⌘K / Ctrl K', label: 'Command palette' },
      { keys: '/', label: 'Search (command palette)' },
      { keys: 'c', label: 'Quick create' },
      { keys: 'n', label: 'New task' },
      { keys: 'g then h', label: 'Go to Home' },
      { keys: 'g then p', label: 'Go to Projects' },
      { keys: 'g then r', label: 'Go to Review' },
      { keys: 'g then n', label: 'Go to Notes' },
      { keys: 'g then c', label: 'Go to Calendar' },
      { keys: 'Esc', label: 'Close dialog / drawer' },
    ],
  },
  {
    title: 'When a task is open',
    rows: [
      { keys: 'e', label: 'Edit task' },
      { keys: 'f', label: 'Start / stop focus' },
      { keys: 't', label: 'Set deadline to today' },
      { keys: '⌘S / Ctrl S', label: 'Save (while editing)' },
    ],
  },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend-web && node_modules/.bin/esbuild src/lib/shortcuts.selfcheck.ts --bundle --platform=node --format=esm | node --input-type=module`
Expected: PASS — prints `shortcuts.selfcheck: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/lib/shortcuts.ts frontend-web/src/lib/shortcuts.selfcheck.ts
git commit -m "feat(web): keyboard-shortcut resolver + cheat-sheet data (+selfcheck)"
```

---

### Task 2: `useShortcuts` hook + `ShortcutsHelp` overlay

**Files:**
- Create: `frontend-web/src/components/ShortcutsHelp.tsx`

**Interfaces:**
- Consumes: `resolveGlobalKey`, `isEditableTarget`, `SHORTCUTS` from `@web/lib/shortcuts`; `useModalA11y` from `@web/lib/useModalA11y`.
- Produces:
  - `useShortcuts(h: { openPalette: () => void; openQuick: () => void; openTask: () => void }): { helpOpen: boolean; setHelpOpen: (v: boolean) => void }`
  - `ShortcutsHelp({ onClose }: { onClose: () => void }): JSX.Element`

- [ ] **Step 1: Create the file**

Create `frontend-web/src/components/ShortcutsHelp.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { resolveGlobalKey, isEditableTarget, SHORTCUTS } from '@web/lib/shortcuts'
import { useModalA11y } from '@web/lib/useModalA11y'

type Handlers = { openPalette: () => void; openQuick: () => void; openTask: () => void }

/**
 * Registers the single global keydown listener for /w. Handlers are read through
 * a ref so the listener registers once. Owns the `g`-prefix window and the
 * cheat-sheet open state; returns the state so AppShell renders <ShortcutsHelp>.
 */
export function useShortcuts({ openPalette, openQuick, openTask }: Handlers) {
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)
  const ref = useRef({ navigate, openPalette, openQuick, openTask })
  ref.current = { navigate, openPalette, openQuick, openTask }

  useEffect(() => {
    let pendingG = false
    let gTimer: ReturnType<typeof setTimeout> | undefined
    const clearG = () => { pendingG = false; if (gTimer) clearTimeout(gTimer) }

    const onKey = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K opens the palette from anywhere, including inputs.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); ref.current.openPalette(); return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditableTarget(e.target)) return

      const action = resolveGlobalKey(pendingG, e.key)
      if (pendingG) clearG()          // any key ends the g-sequence
      if (!action) return
      e.preventDefault()
      switch (action.kind) {
        case 'startG':
          pendingG = true
          gTimer = setTimeout(() => { pendingG = false }, 1000)
          break
        case 'help': setHelpOpen((o) => !o); break
        case 'palette': ref.current.openPalette(); break
        case 'quick': ref.current.openQuick(); break
        case 'task': ref.current.openTask(); break
        case 'nav': ref.current.navigate(action.to); break
      }
    }

    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); if (gTimer) clearTimeout(gTimer) }
  }, [])

  return { helpOpen, setHelpOpen }
}

/** The `?` cheat-sheet. Esc-closes via useModalA11y like every other overlay. */
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const ref = useModalA11y(true, onClose)
  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={ref}
        role="dialog"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1/2 top-1/2 w-[min(30rem,92vw)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-pop animate-pop"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Keyboard shortcuts</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-hover/[0.06]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">
          {SHORTCUTS.map((g) => (
            <div key={g.title}>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</div>
              <div className="space-y-1">
                {g.rows.map((r) => (
                  <div key={r.keys} className="flex items-center justify-between gap-4 rounded-md px-1 py-1 text-sm">
                    <span className="text-ink">{r.label}</span>
                    <kbd className="shrink-0 rounded-md border border-line bg-hover/[0.04] px-2 py-0.5 font-mono text-xs text-muted">{r.keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend-web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "ShortcutsHelp|shortcuts" || echo "no type errors in new files"`
Expected: `no type errors in new files` (or empty — no errors referencing these files).

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/components/ShortcutsHelp.tsx
git commit -m "feat(web): useShortcuts hook + ? cheat-sheet overlay"
```

---

### Task 3: Wire global shortcuts into AppShell

**Files:**
- Modify: `frontend-web/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `useShortcuts`, `ShortcutsHelp` from `@web/components/ShortcutsHelp`; `CreateProjectItemDialog` from `@web/components/CreateProjectItemDialog`.

- [ ] **Step 1: Add imports**

In `frontend-web/src/components/AppShell.tsx`, after the existing `QuickCreate` import (line ~11) add:

```tsx
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'
import { useShortcuts, ShortcutsHelp } from '@web/components/ShortcutsHelp'
```

- [ ] **Step 2: Replace the inline keydown effect with the hook**

Replace this block (currently lines ~23-39):

```tsx
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
```

with:

```tsx
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => { setMoreOpen(false) }, [pathname])

  const { helpOpen, setHelpOpen } = useShortcuts({
    openPalette: () => setPaletteOpen(true),
    openQuick: () => setQuickOpen(true),
    openTask: () => setTaskOpen(true),
  })
```

- [ ] **Step 3: Render the help overlay and the new-task dialog**

In the returned JSX, after the existing `<QuickCreate ... />` line (~61) add:

```tsx
      {taskOpen && <CreateProjectItemDialog open={taskOpen} onClose={() => setTaskOpen(false)} />}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
```

- [ ] **Step 4: Verify it builds and `useEffect` is still imported**

Run: `cd frontend-web && npm run build 2>&1 | tail -20`
Expected: build succeeds (`✓ built in …`), no TS errors. (`useEffect`/`useState` remain used by the `setMoreOpen` effect, so the `react` import is unchanged.)

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/components/AppShell.tsx
git commit -m "feat(web): wire global shortcuts (?, /, n, g-nav) into AppShell"
```

---

### Task 4: Contextual todo keys in ProjectItem

**Files:**
- Modify: `frontend-web/src/pages/ProjectItem.tsx`

**Interfaces:**
- Consumes: `isEditableTarget` from `@web/lib/shortcuts`; existing in-file `setEditing`, `openFocus`, `focus.stop`, `focusActive`, `onDeadlineToday`, `canSetDeadlineToday`, `data.can_edit`, and `EditForm`'s `save`.

- [ ] **Step 1: Add the `isEditableTarget` import**

Near the other `@web/lib` / `@/lib` imports at the top of `frontend-web/src/pages/ProjectItem.tsx` add:

```tsx
import { isEditableTarget } from '@web/lib/shortcuts'
```

(Confirm `useEffect` and `useRef` are already imported from `react` at the top — this file uses both. If `useRef` is missing from the import, add it.)

- [ ] **Step 2: Add the `TodoShortcuts` child component**

Add this component near the top of the file, just above `function EditForm(` (line ~627):

```tsx
// Keyboard shortcuts for an open todo. A child component so its effect obeys the
// rules of hooks (ProjectItem early-returns before data loads); it mounts only
// when a todo is on screen, so `e`/`f`/`t` auto-scope to "a task is open".
function TodoShortcuts(props: {
  canEdit: boolean
  editing: boolean
  focusActive: boolean
  canDeadlineToday: boolean
  onEdit: () => void
  onFocusToggle: () => void
  onDeadlineToday: () => void
}) {
  const ref = useRef(props)
  ref.current = props
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditableTarget(e.target)) return
      const s = ref.current
      if (s.editing) return
      if (e.key === 'e' && s.canEdit) { e.preventDefault(); s.onEdit() }
      else if (e.key === 'f') { e.preventDefault(); s.onFocusToggle() }
      else if (e.key === 't' && s.canDeadlineToday) { e.preventDefault(); s.onDeadlineToday() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return null
}
```

- [ ] **Step 3: Render `TodoShortcuts` in the ProjectItem return**

Find the main component's return (the `return (` whose first child is `<div className="space-y-6">`, ~line 1196). Insert `TodoShortcuts` as the first child of that div:

```tsx
  return (
    <div className="space-y-6">
      <TodoShortcuts
        canEdit={data.can_edit}
        editing={editing}
        focusActive={focusActive}
        canDeadlineToday={canSetDeadlineToday}
        onEdit={() => setEditing(true)}
        onFocusToggle={() => (focusActive ? focus.stop() : openFocus())}
        onDeadlineToday={onDeadlineToday}
      />
```

- [ ] **Step 4: Add ⌘S save inside `EditForm`**

Inside `function EditForm({ data, onClose })`, immediately after the `const save = () => { … }` definition ends (the closing `}` of `save`, ~line 745), add:

```tsx
  // ⌘S / Ctrl+S saves the open edit form (fires even while typing in a field).
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
```

- [ ] **Step 5: Build to verify types + no unused-var errors**

Run: `cd frontend-web && npm run build 2>&1 | tail -20`
Expected: build succeeds. If it errors `'useRef' is not defined`, add `useRef` to the `react` import at the top of the file and rebuild.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/ProjectItem.tsx
git commit -m "feat(web): contextual todo keys — e edit, f focus, t deadline-today, ⌘S save"
```

---

### Task 5: Manual E2E verification + ship

**Files:** none (deploy + data).

- [ ] **Step 1: Confirm the built bundle contains the feature**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project
BUNDLE=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' vernon_project/public/frontend_web/index.html | head -1)
echo "bundle: $BUNDLE"
grep -c "Keyboard shortcuts" "vernon_project/public/frontend_web/$BUNDLE"
```
Expected: `bundle:` names a non-empty hashed file and the grep count is `≥ 1` (the cheat-sheet string shipped). If the file is 0 bytes, the build was poisoned — rebuild.

- [ ] **Step 2: Drive the real app (per the two-frontend rule, /w only)**

On `https://project.vernon.id/w`:
- Press `?` → cheat-sheet opens; `Esc` closes it.
- Press `g` then `p` → navigates to Projects.
- Press `/` → command palette opens.
- Press `n` → new-task dialog opens.
- Open any todo (drawer or detail): press `f` (focus starts), `t` (toast "Deadline set to today"), `e` (edit form opens), then `⌘S` (saves).
- In a text field, confirm typing `e`/`t`/`n` does NOT trigger shortcuts.

- [ ] **Step 3: Docs staleness check (no shape change expected)**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py && git diff --exit-code docs/assets/data.js && echo "docs unchanged (expected)"`
Expected: `docs unchanged (expected)` — no DocType/endpoint/hook changed.

- [ ] **Step 4: Add the What's New entry**

Find the newest existing version, bump the minor (this is a feature), then insert. Write `/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/9a2678d4-1b8c-4db8-81ff-dc2af84d67e9/scratchpad/releases.json`:

```json
[{"version":"<BUMP>","release_date":"2026-07-24","title":"Pintasan keyboard di web","notes":"Tekan ? untuk melihat semua pintasan keyboard (/w)\nTekan / untuk cari cepat, c untuk buat cepat, n untuk tugas baru\nTekan g lalu h/p/r/n/c untuk lompat ke Beranda/Proyek/Review/Catatan/Kalender\nSaat sebuah tugas terbuka: e untuk edit, f untuk fokus, t untuk tenggat hari ini, ⌘S untuk simpan","platform":"Web","published":1}]
```

Then insert (single line — per the loop-free rule):

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/9a2678d4-1b8c-4db8-81ff-dc2af84d67e9/scratchpad/releases.json"))])
frappe.db.commit()
EOF
```

Verify through the endpoint:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Web")[0])
EOF
```
Expected: the new row is first.

- [ ] **Step 5: Commit the built bundle**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/public/frontend_web frontend-web
git commit -m "build(web): ship keyboard shortcuts bundle + cheat-sheet"
```

Note: frontend-only change — **no `bench restart` needed** (static assets). If the live app serves a stale/blank bundle, purge Cloudflare `/assets` and bump the service-worker asset cache (see the Cloudflare-asset-cache memory).

---

## Self-Review

**Spec coverage:**
- `?` cheat-sheet → Task 1 (`SHORTCUTS`) + Task 2 (`ShortcutsHelp`) + Task 3 (render). ✓
- `⌘K`/`/` palette, `c`, `n`, `g`-nav → Task 1 (`resolveGlobalKey`) + Task 2 (hook) + Task 3 (wire). ✓
- Contextual `e`/`f`/`t`/`⌘S` → Task 4. ✓
- Editable-field guard → Task 1 (`isEditableTarget`), used in Tasks 2 & 4. ✓
- Esc closes cheat-sheet → Task 2 (`useModalA11y`). ✓
- One display source of truth → `SHORTCUTS` in Task 1, consumed only by Task 2. ✓
- Web-only, no new deps → Global Constraints; esbuild runner is pre-installed. ✓
- Runnable test for branchy logic → Task 1 selfcheck. ✓
- Ship tail (bundle, What's New, gen_docs) → Task 5. ✓

**Deviation from spec (intentional, simpler):** `n` opens `CreateProjectItemDialog` directly from AppShell (Task 3) instead of adding an `initialTask` prop to `QuickCreate` — same component QuickCreate already uses for its "New task", zero changes to QuickCreate. `t` reuses the existing `onDeadlineToday`/`canSetDeadlineToday` already in `ProjectItem` rather than a new mutation.

**Placeholder scan:** none — all steps carry real code/commands.

**Type consistency:** `resolveGlobalKey`/`isEditableTarget`/`SHORTCUTS` signatures identical across Tasks 1→2; `useShortcuts` handler shape (`openPalette`/`openQuick`/`openTask`) identical across Tasks 2→3; `TodoShortcuts` prop names identical between definition and render in Task 4.
