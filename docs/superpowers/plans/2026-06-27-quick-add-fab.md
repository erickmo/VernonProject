# Quick-add FAB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating action button on the Today and Projects tabs that taps to create a full Project Todo (project-first → existing `CreateProjectItemSheet`) and long-presses to quick-capture a Personal Note.

**Architecture:** Two new presentational components — `Fab` (fixed button with pointer-based tap/long-press discrimination + first-run tooltip) and `QuickAddSheet` (a bottom-sheet state machine: note mode = single-field Personal Note capture via the existing `mobileApi.createPersonalNote`; task mode = pick project → pick work item → hand off to the existing `CreateProjectItemSheet`). No backend, no new doctype, no new API method — every create path reuses an existing one. Both are mounted in `Today.tsx` and `Projects.tsx`, which own a single `quickAdd: 'task' | 'note' | null` state.

**Tech Stack:** React 18, TypeScript, Tailwind 3, @tanstack/react-query, react-router-dom; Frappe (Python) backend.

## Global Constraints
- Aesthetic = Soft-Pop paper system. Tokens ONLY: bg-paper / bg-paper-card / bg-paper-line / border-paper-edge, brand-* (indigo), shadow-card, font-display (Familjen Grotesk), body Figtree. Muted text = text-stone-*. Keep all dark: variants. Keep semantic status colors (rose/amber/emerald/sky/violet/orange).
- Icons = lucide-react ONLY. NEVER emoji. Playful motion = animate-float / animate-wiggle / animate-pop (already defined; a prefers-reduced-motion guard already disables them).
- App column is pinned to max-w-[448px]; root font-size is 14px (do not reintroduce max-w-md or rem-based page widths). Inputs must stay text-[16px] (iOS no-zoom).
- Frontend API: src/lib/api.ts exposes `api.get/post(dotted, params)` and `mobileApi.*`; the request() helper injects window.csrf_token and throws ApiError. Data hooks live in src/hooks/useData.ts (react-query; mutations invalidate keys via useQueryClient in onSettled). Feedback via useToast() from components/Toast.tsx. Routes declared in src/App.tsx. NEVER use native alert/confirm/prompt — use a dialog/sheet.
- Backend: Frappe. Whitelisted methods go in vernon_project/api/mobile.py with @frappe.whitelist(). Notifications via _notify(recipient, type, title, body, reference_doctype=None, reference_name=None, actor=None) at mobile.py:171. New doctypes under vernon_project/vernon_project/doctype/<snake_name>/ (JSON + .py).
- Deploy steps (LIVE site project.vernon.id, NO test DB): schema change -> `bench --site project.vernon.id migrate`; Python change -> `bench restart`; frontend change -> `cd frontend && npm run build` (emits /m bundle + www/m.html).
- TESTING OVERRIDE (project convention, overrides skill TDD): there is NO test DB, so do NOT write per-task pytest/jest. Instead END EACH TASK with (a) a concrete MANUAL SMOKE CHECK — exact steps to click in /m + expected result — and (b) a commit. Automated tests are deferred to a final optional task per plan.
- Git: user edits in parallel. `git add` ONLY the files this plan's task touches; never `git checkout` other branches. End every commit message body with:
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na

---

## File Structure

| File | Create/Modify | Single responsibility |
|------|---------------|-----------------------|
| `frontend/src/components/Fab.tsx` | Create | Fixed bottom-right brand FAB. Pointer-events tap vs ~450ms long-press discrimination; first-run "Hold for a quick note" tooltip persisted in localStorage. Pure callbacks (`onTap`, `onLongPress`) — owns no sheet state. |
| `frontend/src/components/QuickAddSheet.tsx` | Create | Bottom-sheet state machine. `mode='note'` → single textarea → `mobileApi.createPersonalNote`. `mode='task'` → pick project (`useProjects`) → pick work item (`useProject`) → render existing `CreateProjectItemSheet` (`useProjectDetail` supplies team/group/siblings). No create logic duplicated. |
| `frontend/src/pages/Today.tsx` | Modify (imports ~26-33; state ~115-119; render before `</TabScreen>` ~499-507) | Mount `<Fab>` + `<QuickAddSheet>`; own `quickAdd` state. |
| `frontend/src/pages/Projects.tsx` | Modify (imports ~1-10; state ~17-21; render before `</TabScreen>` ~194-204) | Mount `<Fab>` + `<QuickAddSheet>`; own `quickAdd` state. |

**Reused as-is (read, do not modify):**
- `components/CreateProjectItemSheet.tsx` — props `{ open, onClose, projectDetail: string, team: {user;name}[], defaultGroup?: string|null, siblings?: {name;to_do}[] }`. Renders its own `fixed inset-0 z-50` overlay; calls `onClose` after a successful create.
- `hooks/useData.ts` — `useProjects(): ProjectCard[]`, `useProject(name): ProjectFull` (has `project_details: ProjectDetailSummary[]`), `useProjectDetail(name): ProjectDetail` (has `team: {user;name;image}[]`, `default_group?: string|null`, `project_items: ProjectItem[]`), `keys.personalNotes`.
- `lib/api.ts` — `mobileApi.createPersonalNote(title: string, body: string, items: PersonalNoteItem[]) => Promise<{ status: string; message?: string; name?: string }>` (whitelisted; sets `user` server-side with `ignore_permissions`, so it works for any logged-in user — a raw `frappe.client.insert` of `Personal Note` would 403 since the doctype only grants System Manager create).
- `components/Toast.tsx` — `useToast(): (type, message) => void`.

---

### Task 1: Create `Fab.tsx`

**Files:**
- Create `frontend/src/components/Fab.tsx`

**Interfaces:**
- Produces: `export function Fab({ onTap, onLongPress }: { onTap: () => void; onLongPress: () => void }): JSX.Element`
- Consumes: nothing (pure UI). localStorage key `vernon.fabTipDismissed`.

- [ ] Create `frontend/src/components/Fab.tsx` with this complete content:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'

// One-time hint persists across sessions once dismissed (or after first use).
const TIP_KEY = 'vernon.fabTipDismissed'
// Long-press threshold. A press held this long fires onLongPress and cancels the tap.
const LONG_MS = 450

export function Fab({ onTap, onLongPress }: { onTap: () => void; onLongPress: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFired = useRef(false)
  const armed = useRef(false) // true only between pointerdown and its resolution
  const [showTip, setShowTip] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(TIP_KEY)) setShowTip(true)
    } catch {
      /* private mode / disabled storage — just skip the tip */
    }
  }, [])

  const dismissTip = () => {
    setShowTip(false)
    try {
      localStorage.setItem(TIP_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  const onPointerDown = () => {
    longFired.current = false
    armed.current = true
    clear()
    timer.current = setTimeout(() => {
      longFired.current = true
      armed.current = false
      if (showTip) dismissTip()
      onLongPress()
    }, LONG_MS)
  }

  const onPointerUp = () => {
    clear()
    if (armed.current && !longFired.current) {
      armed.current = false
      if (showTip) dismissTip()
      onTap()
    }
  }

  // Finger dragged off the button, or the gesture was cancelled by the OS:
  // disarm so the trailing pointerup does not fire a stray tap.
  const onCancel = () => {
    armed.current = false
    clear()
  }

  return (
    <>
      {showTip && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+9rem)] right-4 z-30 flex max-w-[240px] items-center gap-2 rounded-2xl border border-paper-edge bg-paper-card px-3 py-2 text-xs font-medium text-stone-600 shadow-card dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Hold for a quick note
          <button
            onClick={dismissTip}
            aria-label="Dismiss tip"
            className="text-stone-400 active:scale-90 dark:text-slate-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <button
        aria-label="Quick add"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onCancel}
        onPointerCancel={onCancel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: 'manipulation' }}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-30 flex h-14 w-14 select-none items-center justify-center rounded-full bg-brand-600 text-white shadow-card animate-float transition active:scale-90"
      >
        <Plus className="h-7 w-7" strokeWidth={2.4} />
      </button>
    </>
  )
}
```

- [ ] MANUAL SMOKE CHECK (compile-only — no mount yet): run `cd frontend && npm run build`. Expected: build completes with no TypeScript errors and emits the `/m` bundle. (Full click-through smoke happens in Task 3 once the FAB is mounted.)
- [ ] Commit:
```
git add frontend/src/components/Fab.tsx
git commit -m "$(cat <<'EOF'
feat(fab): quick-add FAB with tap/long-press + first-run tooltip

Pointer-events button: tap vs ~450ms long-press, disarms on drag-off so a
trailing pointerup never fires a stray tap. One-time "hold for a quick note"
hint persisted in localStorage.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
EOF
)"
```

---

### Task 2: Create `QuickAddSheet.tsx`

**Files:**
- Create `frontend/src/components/QuickAddSheet.tsx`

**Interfaces:**
- Produces:
  - `export type QuickAddMode = 'task' | 'note'`
  - `export function QuickAddSheet({ open, mode, onClose }: { open: boolean; mode: QuickAddMode; onClose: () => void }): JSX.Element | null`
- Consumes: `useProjects()`, `useProject(name)`, `useProjectDetail(name)`, `keys.personalNotes` from `@/hooks/useData`; `mobileApi.createPersonalNote(title, body, items)` from `@/lib/api`; `useToast()`; `CreateProjectItemSheet` (props above); `EmptyState`, `Spinner` from `@/components/ui`.

- [ ] Create `frontend/src/components/QuickAddSheet.tsx` with this complete content:

```tsx
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, FolderKanban, ListChecks, Send, X } from 'lucide-react'
import { CreateProjectItemSheet } from '@/components/CreateProjectItemSheet'
import { EmptyState, Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { mobileApi } from '@/lib/api'
import { keys, useProject, useProjectDetail, useProjects } from '@/hooks/useData'

export type QuickAddMode = 'task' | 'note'

export function QuickAddSheet({
  open,
  mode,
  onClose,
}: {
  open: boolean
  mode: QuickAddMode
  onClose: () => void
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const { data: projects } = useProjects()
  const [project, setProject] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  // Both queries are gated by their `enabled: !!name` — passing '' is a no-op.
  const { data: projectFull, isLoading: projLoading } = useProject(project ?? '')
  const { data: detailData, isLoading: detailLoading } = useProjectDetail(detail ?? '')

  // Reset every transient choice whenever the sheet is dismissed, so the next
  // open always starts at step 1 / a blank note.
  useEffect(() => {
    if (!open) {
      setProject(null)
      setDetail(null)
      setText('')
      setSaving(false)
    }
  }, [open])

  if (!open) return null

  // ----- Note mode: single-field Personal Note capture -----
  if (mode === 'note') {
    const saveNote = async () => {
      const body = text.trim()
      if (!body) return
      setSaving(true)
      try {
        const res = await mobileApi.createPersonalNote('', body, [])
        if (res.status !== 'ok') throw new Error(res.message || 'Could not save note')
        qc.invalidateQueries({ queryKey: keys.personalNotes })
        toast('success', 'Note saved')
        onClose()
      } catch (e) {
        toast('error', e instanceof Error ? e.message : 'Could not save note')
      } finally {
        setSaving(false)
      }
    }
    return (
      <SheetShell title="Quick note" onClose={onClose}>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Jot something down…"
          rows={4}
          className="w-full rounded-2xl border border-paper-edge bg-paper px-3 py-2.5 text-[16px] text-stone-700 outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
        />
        <button
          onClick={saveNote}
          disabled={saving || !text.trim()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          Save note
        </button>
      </SheetShell>
    )
  }

  // ----- Task mode, final step: hand off to the real create form -----
  if (detail) {
    if (detailLoading || !detailData) {
      return (
        <SheetShell title="New todo" onClose={onClose}>
          <div className="flex justify-center py-8">
            <Spinner className="h-5 w-5 text-stone-400" />
          </div>
        </SheetShell>
      )
    }
    return (
      <CreateProjectItemSheet
        open
        onClose={onClose}
        projectDetail={detail}
        team={detailData.team}
        defaultGroup={detailData.default_group}
        siblings={detailData.project_items.map((t) => ({ name: t.name, to_do: t.to_do }))}
      />
    )
  }

  // ----- Task mode, step 2: pick a work item within the project -----
  if (project) {
    const details = projectFull?.project_details ?? []
    return (
      <SheetShell title="Pick a work item" onClose={onClose} onBack={() => setProject(null)}>
        {projLoading && !projectFull ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-5 w-5 text-stone-400" />
          </div>
        ) : details.length ? (
          <div className="flex flex-col gap-2">
            {details.map((d) => (
              <button
                key={d.name}
                onClick={() => setDetail(d.name)}
                className="flex items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card px-4 py-3 text-left active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800"
              >
                <ListChecks className="h-5 w-5 shrink-0 text-brand-500" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-700 dark:text-slate-100">
                  {d.title}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ListChecks}
            title="No work items"
            subtitle="This project has no work items to add a todo to yet."
          />
        )}
      </SheetShell>
    )
  }

  // ----- Task mode, step 1: pick a project -----
  return (
    <SheetShell title="Pick a project" onClose={onClose}>
      {projects && projects.length ? (
        <div className="flex flex-col gap-2">
          {projects.map((p) => (
            <button
              key={p.name}
              onClick={() => setProject(p.name)}
              className="flex items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card px-4 py-3 text-left active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800"
            >
              <FolderKanban className="h-5 w-5 shrink-0 text-brand-500" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-stone-700 dark:text-slate-100">
                  {p.project_name}
                </span>
                {p.brand && (
                  <span className="block truncate text-xs text-stone-400 dark:text-slate-500">{p.brand}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FolderKanban}
          title="Join a project first"
          subtitle="You need to be on a project to add a todo."
        />
      )}
    </SheetShell>
  )
}

// Bottom-sheet chrome shared by every QuickAddSheet step. Mirrors RedeemSheet:
// tap-scrim-to-close, rounded-top panel, drag handle, safe-area bottom padding.
function SheetShell({
  title,
  children,
  onClose,
  onBack,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  onBack?: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative mx-auto max-h-[80vh] w-full max-w-[448px] overflow-y-auto rounded-t-3xl bg-paper-card p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-paper-line dark:bg-slate-600" />
        <div className="mb-4 flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back"
              className="rounded-full p-1 text-stone-400 active:scale-90 dark:text-slate-500"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <h2 className="flex-1 font-display text-lg font-semibold text-stone-800 dark:text-slate-50">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-stone-400 active:scale-90 dark:text-slate-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
```

- [ ] MANUAL SMOKE CHECK (compile-only — no mount yet): run `cd frontend && npm run build`. Expected: build completes with no TypeScript errors (confirms `CreateProjectItemSheet` props, `ProjectFull.project_details`, `ProjectDetail.team/default_group/project_items`, and `createPersonalNote` signature all line up). Full click-through smoke happens in Task 3.
- [ ] Commit:
```
git add frontend/src/components/QuickAddSheet.tsx
git commit -m "$(cat <<'EOF'
feat(fab): QuickAddSheet — note capture + project-first todo handoff

Note mode reuses mobileApi.createPersonalNote (whitelisted, sets user
server-side). Task mode walks project -> work item then hands off to the
existing CreateProjectItemSheet — no create logic duplicated.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
EOF
)"
```

---

### Task 3: Mount FAB on the Today tab

**Files:**
- Modify `frontend/src/pages/Today.tsx` (add 2 imports near the existing component imports ~26-33; add 1 state line in the `Today()` body ~115-119; add 2 render lines just before the closing `</TabScreen>` ~507)

**Interfaces:**
- Consumes: `Fab` (`{ onTap, onLongPress }`), `QuickAddSheet` + `QuickAddMode` (`{ open, mode, onClose }`).
- Produces: nothing exported (page wiring only). New local state `quickAdd: QuickAddMode | null`.

- [ ] In `frontend/src/pages/Today.tsx`, add the two imports immediately after the existing `import { NotesButton } from '@/components/NotesButton'` line:

```tsx
import { Fab } from '@/components/Fab'
import { QuickAddSheet, type QuickAddMode } from '@/components/QuickAddSheet'
```

- [ ] In the `Today()` component body, immediately after `const [sheet, setSheet] = useState(false)`, add:

```tsx
  const [quickAdd, setQuickAdd] = useState<QuickAddMode | null>(null)
```

- [ ] In the same file, locate the existing closing block of the filter sheet:

```tsx
      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        dimensions={dimensions}
        value={filters}
        onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        onClear={() => setFilters((f) => ({ status: f.status || '' }))}
      />
    </TabScreen>
```

Replace it with (adds the FAB + sheet just before `</TabScreen>`):

```tsx
      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        dimensions={dimensions}
        value={filters}
        onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        onClear={() => setFilters((f) => ({ status: f.status || '' }))}
      />

      <Fab onTap={() => setQuickAdd('task')} onLongPress={() => setQuickAdd('note')} />
      <QuickAddSheet open={quickAdd !== null} mode={quickAdd ?? 'task'} onClose={() => setQuickAdd(null)} />
    </TabScreen>
```

- [ ] Rebuild: `cd frontend && npm run build`.
- [ ] MANUAL SMOKE CHECK in `/m` (Today tab):
  1. Load Today on a fresh browser profile (or clear `localStorage` key `vernon.fabTipDismissed`). Expected: a brand-indigo `+` FAB sits bottom-right above the nav with a gentle float, and a "Hold for a quick note" bubble above it.
  2. **Tap** the FAB. Expected: tooltip disappears (and stays gone on reload); a "Pick a project" sheet slides up. Pick a project → "Pick a work item" → pick an item → the existing "New todo" form opens prefilled with that detail's team/group. Fill required fields, Create → toast "Todo created", everything closes.
  3. If you are on no projects, the tap sheet shows "Join a project first".
  4. **Long-press** the FAB (~0.5s). Expected: a "Quick note" sheet opens; type text, Save note → toast "Note saved". Open the Notes screen → the note is listed. Verify a quick tap right after does NOT also open the note sheet (long-press cancels the tap).
- [ ] Commit:
```
git add frontend/src/pages/Today.tsx vernon_project/public/frontend/ vernon_project/www/m.html
git commit -m "$(cat <<'EOF'
feat(today): mount quick-add FAB (tap=todo, hold=note)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
EOF
)"
```

> Note: `npm run build` regenerates hashed bundles under `vernon_project/public/frontend/assets/` and rewrites `vernon_project/www/m.html`. Run `git status` first and `git add` ONLY the new/changed Today bundle + `m.html` produced by THIS build — never `git add -A` (the user edits in parallel).

---

### Task 4: Mount FAB on the Projects tab

**Files:**
- Modify `frontend/src/pages/Projects.tsx` (add 2 imports ~1-10; add 1 state line ~17-21; add 2 render lines just before the closing `</TabScreen>` ~204)

**Interfaces:**
- Consumes: `Fab`, `QuickAddSheet` + `QuickAddMode` (same as Task 3).
- Produces: nothing exported. New local state `quickAdd: QuickAddMode | null`.

- [ ] In `frontend/src/pages/Projects.tsx`, add the two imports immediately after `import { useProjects, useBoot, canCreateProject } from '@/hooks/useData'`:

```tsx
import { Fab } from '@/components/Fab'
import { QuickAddSheet, type QuickAddMode } from '@/components/QuickAddSheet'
```

- [ ] In the `Projects()` component body, immediately after `const [sheet, setSheet] = useState(false)`, add:

```tsx
  const [quickAdd, setQuickAdd] = useState<QuickAddMode | null>(null)
```

- [ ] In the same file, locate the existing tail of the return (filter sheet + project form sheet):

```tsx
      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        dimensions={dimensions}
        value={filters}
        onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        onClear={() => setFilters({})}
      />

      <ProjectFormSheet open={formOpen} onClose={() => setFormOpen(false)} />
    </TabScreen>
```

Replace it with (adds the FAB + sheet just before `</TabScreen>`):

```tsx
      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        dimensions={dimensions}
        value={filters}
        onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        onClear={() => setFilters({})}
      />

      <ProjectFormSheet open={formOpen} onClose={() => setFormOpen(false)} />

      <Fab onTap={() => setQuickAdd('task')} onLongPress={() => setQuickAdd('note')} />
      <QuickAddSheet open={quickAdd !== null} mode={quickAdd ?? 'task'} onClose={() => setQuickAdd(null)} />
    </TabScreen>
```

- [ ] Rebuild: `cd frontend && npm run build`.
- [ ] MANUAL SMOKE CHECK in `/m` (Projects tab):
  1. Open the Projects tab. Expected: the same FAB appears bottom-right (no tooltip — already dismissed from the Today smoke; the localStorage flag is shared).
  2. **Tap** → "Pick a project" → "Pick a work item" → "New todo" form → Create → toast "Todo created".
  3. **Long-press** → "Quick note" → Save → toast "Note saved".
  4. Confirm the FAB does not overlap the "New project" button or the bottom nav.
- [ ] Commit:
```
git add frontend/src/pages/Projects.tsx vernon_project/public/frontend/ vernon_project/www/m.html
git commit -m "$(cat <<'EOF'
feat(projects): mount quick-add FAB (tap=todo, hold=note)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
EOF
)"
```

> Note: same bundle-staging caution as Task 3 — `git add` ONLY this build's changed Projects bundle + `m.html`.

---

### Task 5 (optional, final): Automated tests

Deferred per project convention (LIVE site, no test DB). If/when a frontend test harness is added, cover in `frontend`:
- [ ] `Fab` gesture logic: a `pointerdown`→`pointerup` under 450ms calls `onTap` and NOT `onLongPress`; a press held ≥450ms calls `onLongPress` and the trailing `pointerup` does NOT call `onTap`; a `pointerdown`→`pointerleave`→`pointerup` calls neither.
- [ ] `Fab` tooltip: renders when `vernon.fabTipDismissed` is absent; hides + persists the flag after first tap/long-press or explicit dismiss.
- [ ] `QuickAddSheet` note mode: Save with empty text is a no-op (button disabled); non-empty text calls `mobileApi.createPersonalNote('', body, [])`, toasts success, and invalidates `keys.personalNotes`.
- [ ] `QuickAddSheet` task mode: step transitions project → detail → `CreateProjectItemSheet`, and the no-projects branch renders the "Join a project first" empty state.
- [ ] Commit the test files only.
