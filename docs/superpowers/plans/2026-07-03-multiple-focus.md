# Multiple Focus Timers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let several tasks each run their own focus timer concurrently on both frontends, surface all running timers in a global UI, and float focused tasks to the top of the Home plan list.

**Architecture:** Flip the shared `useFocusTimer` store from one `FocusTimer | null` to a `FocusTimer[]` keyed by taskId; add a scoped hook (`useFocusTimer(id)`, same shape as before), a global list hook (`useFocusTimers()`), and a membership-only hook (`useFocusedTaskIds()`). Overlay open-state (`focusUI`) becomes `{open, taskId}` and drives both frontends' overlays. Meta moves onto the timer object.

**Tech Stack:** React 18, TypeScript, Vite, TailwindCSS, lucide-react. Two Vite apps: `frontend` (mobile `/m`) and `frontend-web` (web `/w`) sharing `frontend/src` via the `@` alias; web-only UI under `@web`.

## Global Constraints

- **Live site, no test infra.** No vitest/tsx/tsc bin installed. Verification = `npm run build` per frontend (esbuild — catches syntax/import errors, NOT type errors, so copy code exactly) + manual behavior check. Runnable unit test deferred (project convention). Mark the deferred pure-function test with a `// ponytail:` debt line.
- **Design tokens:** mobile uses `paper-*` / `brand-*` / `stone-*`; web uses semantic tokens `canvas / surface / ink / muted / line / hover` (+ `brand-*`). Do NOT use `paper-*` in web.
- **No native `alert/confirm/prompt`** anywhere.
- **Shared-file edits break BOTH frontends** — `frontend/src/hooks/useFocusTimer.ts`, `frontend/src/lib/focusUI.ts`, `frontend/src/lib/planDay.ts` are imported by web too.
- **Git:** the user works in parallel; `git add` only the exact files each step lists. Never `git add -A`. `frontend-web/src/pages/Home.tsx` is the user's untracked WIP — edit it but coordinate before committing it.
- **Build/deploy:** `cd frontend && npm run build` emits hashed assets to `vernon_project/public/frontend/`; `cd frontend-web && npm run build` emits to `vernon_project/public/frontend_web/`. Client-only change — no `bench` restart or migrate.

---

### Task 1: Shared core — store, overlay open-state, plan ordering

**Files:**
- Modify (rewrite): `frontend/src/hooks/useFocusTimer.ts`
- Modify (rewrite): `frontend/src/lib/focusUI.ts`
- Modify: `frontend/src/lib/planDay.ts` (append `focusedFirst`)

**Interfaces produced (later tasks depend on these exact signatures):**
- `type FocusTimer = { taskId, taskTitle, estimatedMs, status: 'running'|'paused', startedAt, elapsedBeforeMs, meta?: FocusMeta }`
- `type EnrichedTimer = FocusTimer & { elapsedMs, remainingMs, fraction, hasEstimate }`
- `useFocusTimer(taskId: string)` → `{ timer: FocusTimer|null, elapsedMs, remainingMs, fraction, hasEstimate, start(id,title,estMin,meta?), pause(), resume(), reset(), stop() }`
- `useFocusTimers()` → `{ timers: EnrichedTimer[], stop(id) }`
- `useFocusedTaskIds()` → `Set<string>`
- `focusUI`: `openFocusOverlay(taskId: string)`, `closeFocusOverlay()`, `useFocusOverlay()` → `{ open, taskId? }`, `type FocusMeta`
- `focusedFirst(list: ProjectItem[], focused: Set<string>)` → `ProjectItem[]`

- [ ] **Step 1: Rewrite `frontend/src/lib/focusUI.ts`**

```ts
import { useSyncExternalStore } from 'react'

// Shared open-state for the global focus overlay: whether it's open and which
// task. Drives BOTH the mobile and web overlays (both frontends import this via
// the shared `@` alias). Task detail (meta) now lives on the timer, so this
// store only tracks which task's overlay is open.

export type FocusMeta = {
  project?: string
  deadlineHuman?: string
  overdue?: boolean
  estimateLabel?: string
  group?: string
}

type FocusUI = { open: boolean; taskId?: string }

let state: FocusUI = { open: false }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

// Hoisted (stable) subscribe — an inline arrow would re-subscribe every render.
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function openFocusOverlay(taskId: string) {
  state = { open: true, taskId }
  emit()
}

export function closeFocusOverlay() {
  state = { ...state, open: false }
  emit()
}

export function useFocusOverlay(): FocusUI {
  return useSyncExternalStore(subscribe, () => state, () => state)
}
```

- [ ] **Step 2: Rewrite `frontend/src/hooks/useFocusTimer.ts`**

```ts
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { FocusMeta } from '@/lib/focusUI'

// App-wide focus timers persisted to localStorage. MULTIPLE tasks can each run
// their own timer concurrently. Wall-clock based: while running we store the
// segment start and recompute remaining from Date.now(), so a backgrounded
// tab/closed PWA reflects real elapsed time on return. No backend involvement.
//
// Module-level store (not per-hook useState) so every consumer — per-card Focus
// buttons, the global mini-bar/dock, the global overlay — observes the same
// timers the instant any of them mutates.

const KEY = 'vernon.focusTimer'

export type FocusTimer = {
  taskId: string
  taskTitle: string
  estimatedMs: number
  status: 'running' | 'paused'
  startedAt: number // epoch ms when the current running segment began
  elapsedBeforeMs: number // elapsed accumulated before the current segment
  meta?: FocusMeta // task detail shown in the overlay; travels with the timer
}

export type EnrichedTimer = FocusTimer & {
  elapsedMs: number
  remainingMs: number
  fraction: number
  hasEstimate: boolean
}

function isTimer(t: unknown): t is FocusTimer {
  return (
    !!t &&
    typeof (t as FocusTimer).estimatedMs === 'number' &&
    typeof (t as FocusTimer).taskId === 'string'
  )
}

function load(): FocusTimer[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Legacy shape: a single timer object → wrap in an array so a live user
    // mid-timer doesn't lose it on deploy.
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr.filter(isTimer)
  } catch {
    return []
  }
}

let current: FocusTimer[] = load()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function persist() {
  try {
    if (current.length) localStorage.setItem(KEY, JSON.stringify(current))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable — store stays in-memory only */
  }
}

function setTimers(next: FocusTimer[]) {
  current = next
  persist()
  emit()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function elapsedOf(t: FocusTimer, now: number): number {
  return t.elapsedBeforeMs + (t.status === 'running' ? now - t.startedAt : 0)
}

export function deriveFocus(t: FocusTimer, now: number): EnrichedTimer {
  const elapsedMs = elapsedOf(t, now)
  const hasEstimate = t.estimatedMs > 0
  const remainingMs = t.estimatedMs - elapsedMs
  const fraction = hasEstimate ? Math.min(1, Math.max(0, remainingMs / t.estimatedMs)) : 0
  return { ...t, elapsedMs, remainingMs, fraction, hasEstimate }
}

// ---- imperative mutators (operate by taskId) ----

function startTimer(taskId: string, taskTitle: string, estimatedMinutes: number, meta?: FocusMeta) {
  if (current.some((t) => t.taskId === taskId)) return // already running — no-op
  setTimers([
    ...current,
    {
      taskId,
      taskTitle,
      estimatedMs: estimatedMinutes * 60_000,
      status: 'running',
      startedAt: Date.now(),
      elapsedBeforeMs: 0,
      meta,
    },
  ])
}

function mapTimer(taskId: string, fn: (t: FocusTimer) => FocusTimer) {
  setTimers(current.map((t) => (t.taskId === taskId ? fn(t) : t)))
}

function pauseTimer(taskId: string) {
  mapTimer(taskId, (t) =>
    t.status !== 'running'
      ? t
      : { ...t, status: 'paused', elapsedBeforeMs: t.elapsedBeforeMs + (Date.now() - t.startedAt) },
  )
}

function resumeTimer(taskId: string) {
  mapTimer(taskId, (t) => (t.status !== 'paused' ? t : { ...t, status: 'running', startedAt: Date.now() }))
}

function resetTimer(taskId: string) {
  mapTimer(taskId, (t) => ({ ...t, startedAt: Date.now(), elapsedBeforeMs: 0 }))
}

function stopTimer(taskId: string) {
  setTimers(current.filter((t) => t.taskId !== taskId))
}

// ---- hooks ----

// Tick once a second only while `active`.
function useNowTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

// Scoped to one task. Same shape single-task callers used before, bound to
// `taskId`. `timer` is that task's timer (or null); no-arg controls act on it.
export function useFocusTimer(taskId: string) {
  const timers = useSyncExternalStore(subscribe, () => current, () => current)
  const timer = timers.find((t) => t.taskId === taskId) ?? null
  const now = useNowTick(timer?.status === 'running')

  const start = useCallback(
    (id: string, title: string, estimatedMinutes: number, meta?: FocusMeta) =>
      startTimer(id, title, estimatedMinutes, meta),
    [],
  )
  const pause = useCallback(() => pauseTimer(taskId), [taskId])
  const resume = useCallback(() => resumeTimer(taskId), [taskId])
  const reset = useCallback(() => resetTimer(taskId), [taskId])
  const stop = useCallback(() => stopTimer(taskId), [taskId])

  const d = timer ? deriveFocus(timer, now) : null
  return {
    timer,
    elapsedMs: d?.elapsedMs ?? 0,
    remainingMs: d?.remainingMs ?? 0,
    fraction: d?.fraction ?? 0,
    hasEstimate: d?.hasEstimate ?? false,
    start,
    pause,
    resume,
    reset,
    stop,
  }
}

// All timers, enriched + sorted (overdue first, then most-recently started).
// For the global mini-bar / dock.
export function useFocusTimers() {
  const timers = useSyncExternalStore(subscribe, () => current, () => current)
  const anyRunning = timers.some((t) => t.status === 'running')
  const now = useNowTick(anyRunning)
  const enriched = timers
    .map((t) => deriveFocus(t, now))
    .sort((a, b) => {
      const ao = a.hasEstimate && a.remainingMs < 0 ? 1 : 0
      const bo = b.hasEstimate && b.remainingMs < 0 ? 1 : 0
      if (ao !== bo) return bo - ao // overdue first
      return b.startedAt - a.startedAt // then most-recently started
    })
  return { timers: enriched, stop: stopTimer }
}

// Membership-only: taskIds of existing timers. Re-renders on start/stop (store
// mutation) but NOT on the 1s tick — plan lists sort focused-first without
// per-second churn. Memoised on the stable `current` ref so the Set identity is
// stable between mutations.
export function useFocusedTaskIds(): Set<string> {
  const timers = useSyncExternalStore(subscribe, () => current, () => current)
  return useMemo(() => new Set(timers.map((t) => t.taskId)), [timers])
}
```

- [ ] **Step 3: Append `focusedFirst` to `frontend/src/lib/planDay.ts`**

Add at the end of the file (after `buildNext`):

```ts
// ponytail: pure partition; runnable test deferred — no test infra in this repo
// (project convention: defer tests to final phase). Add a vitest case when infra
// lands. Behaviour: focused todos float to the very top, preserving input order
// within the focused and non-focused groups.
export function focusedFirst(list: ProjectItem[], focused: Set<string>): ProjectItem[] {
  if (!focused.size) return list
  const yes: ProjectItem[] = []
  const no: ProjectItem[] = []
  for (const t of list) (focused.has(t.name) ? yes : no).push(t)
  return [...yes, ...no]
}
```

- [ ] **Step 4: Self-review the shared contract**

Re-read the three files. Confirm: `FocusMeta` imported into the store from `@/lib/focusUI` (type-only, no cycle); every exported name matches the Interfaces block above; no leftover `FocusTimer | null` / single-`timer` references. No build yet (consumers still stale — expected).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useFocusTimer.ts frontend/src/lib/focusUI.ts frontend/src/lib/planDay.ts
git commit -m "feat(focus): array-backed multi-timer store + shared overlay state

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BMBFEjDsoMRdNyhH6DMYKd"
```

---

### Task 2: Mobile consumers + focused-first + mobile build

**Files:**
- Modify: `frontend/src/components/TodoCard.tsx`
- Modify: `frontend/src/pages/ProjectItemScreen.tsx`
- Modify: `frontend/src/components/FocusOverlay.tsx`
- Modify: `frontend/src/components/Fab.tsx`
- Modify (rewrite): `frontend/src/components/FocusMiniBar.tsx`
- Modify: `frontend/src/pages/Today.tsx`

**Interfaces consumed:** all of Task 1.

- [ ] **Step 1: `TodoCard.tsx` — scope the hook + pass meta**

Replace line 29–30:
```ts
  const focus = useFocusTimer()
  const focusActive = focus.timer?.taskId === todo.name
```
with:
```ts
  const focus = useFocusTimer(todo.name)
  const focusActive = focus.timer != null
```

Replace the `startFocus` body (lines 32–41):
```ts
  const startFocus = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!focusActive)
      focus.start(todo.name, todo.to_do, todo.estimated, {
        project: todo.project_name,
        deadlineHuman: todo.deadline_human || undefined,
        overdue: todo.is_overdue,
        estimateLabel: todo.estimated > 0 ? formatEstimate(todo.estimated) : undefined,
      })
    openFocusOverlay(todo.name)
  }
```

- [ ] **Step 2: `ProjectItemScreen.tsx` — scope the hook, pass meta, pass id to overlay**

Replace line 919:
```ts
  const focus = useFocusTimer()
```
with:
```ts
  const focus = useFocusTimer(id)
```
(`id` is the route param already in scope — used by `useUpdateTodo(id)` on line 909.)

Replace line 1046:
```ts
  const focusActive = focus.timer?.taskId === data.name
```
with:
```ts
  const focusActive = focus.timer != null
```

Replace the `openFocus` body (lines 1047–1065) — move the meta into `start`, open by id:
```ts
  const openFocus = () => {
    if (!focusActive)
      focus.start(data.name, data.to_do, data.estimated, {
        project: data.project_name,
        deadlineHuman: data.deadline_human || undefined,
        overdue: data.is_overdue,
        estimateLabel: data.estimated > 0 ? formatEstimate(data.estimated) : undefined,
        group: data.group
          ? [
              data.group,
              data.level_type && data.level
                ? `${data.level_type} · ${data.level}`
                : data.level_type || data.level,
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined,
      })
    openFocusOverlay(data.name)
  }
```
(`focusOver` / `focusValueMs` on lines 1068–1069 stay as-is.)

- [ ] **Step 3: `FocusOverlay.tsx` (mobile) — read the active task from focusUI**

Replace lines 27–29:
```ts
  const { timer, elapsedMs, remainingMs, fraction, hasEstimate, pause, resume, reset, stop } =
    useFocusTimer()
  const { open, meta } = useFocusOverlay()
```
with:
```ts
  const { open, taskId } = useFocusOverlay()
  const { timer, elapsedMs, remainingMs, fraction, hasEstimate, pause, resume, reset, stop } =
    useFocusTimer(taskId ?? '')
  const meta = timer?.meta
```

(Everything else — the `if (!open || !timer) return null` guard, the `meta` render block, ambient sound — is unchanged. `useFocusTimer` is imported already; `useFocusOverlay` import stays.)

- [ ] **Step 4: `Fab.tsx` — hide FAB while any timer exists**

Replace the import on line 4:
```ts
import { useFocusTimer } from '@/hooks/useFocusTimer'
```
with:
```ts
import { useFocusTimers } from '@/hooks/useFocusTimer'
```
Replace line 21:
```ts
  const focusing = useFocusTimer().timer != null
```
with:
```ts
  const focusing = useFocusTimers().timers.length > 0
```

- [ ] **Step 5: Rewrite `frontend/src/components/FocusMiniBar.tsx`**

```tsx
import { useState } from 'react'
import clsx from 'clsx'
import { Timer, Square } from 'lucide-react'
import { useFocusTimers, type EnrichedTimer } from '@/hooks/useFocusTimer'
import { useFocusOverlay, openFocusOverlay } from '@/lib/focusUI'
import { formatClock } from '@/lib/format'

// Slim pill docked above the bottom nav while focus timers run. The primary
// timer (overdue-first, else most-recently started) shows in the pill; a +N
// badge expands the rest above it. Each row/pill: tap reopens that task's
// overlay, the square stops it. Hidden while the overlay itself is open.
function timeParts(t: EnrichedTimer) {
  const over = t.hasEstimate && t.remainingMs < 0
  return { over, valueMs: t.hasEstimate ? t.remainingMs : t.elapsedMs, paused: t.status === 'paused' }
}

export function FocusMiniBar() {
  const { timers, stop } = useFocusTimers()
  const { open } = useFocusOverlay()
  const [expanded, setExpanded] = useState(false)
  if (!timers.length || open) return null

  const [primary, ...rest] = timers
  const p = timeParts(primary)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-40 flex flex-col items-center gap-2 px-4">
      {expanded && rest.length > 0 && (
        <div className="pointer-events-auto flex w-full max-w-[416px] flex-col gap-1.5 rounded-2xl border border-paper-edge bg-paper-card p-1.5 shadow-card dark:border-slate-700 dark:bg-slate-800">
          {rest.map((t) => {
            const q = timeParts(t)
            return (
              <div key={t.taskId} className="flex items-center gap-2 rounded-xl px-1.5 py-1">
                <button
                  onClick={() => {
                    openFocusOverlay(t.taskId)
                    setExpanded(false)
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={clsx(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      q.over
                        ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                        : 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
                    )}
                  >
                    <Timer className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-stone-800 dark:text-slate-100">
                      {t.taskTitle}
                    </span>
                    <span
                      className={clsx(
                        'block font-mono text-xs tabular-nums',
                        q.over ? 'text-rose-500' : q.paused ? 'text-amber-500' : 'text-stone-500 dark:text-slate-400',
                      )}
                    >
                      {q.paused ? 'Paused · ' : ''}
                      {q.over ? '+' : ''}
                      {formatClock(q.valueMs)}
                      {t.hasEstimate && !q.over ? ' left' : ''}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => stop(t.taskId)}
                  aria-label={`Stop focus timer for ${t.taskTitle}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                >
                  <Square className="h-3.5 w-3.5" fill="currentColor" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="pointer-events-auto mx-auto flex w-full max-w-[416px] items-center gap-2 rounded-full border border-paper-edge bg-paper-card px-2 py-1.5 shadow-card dark:border-slate-700 dark:bg-slate-800">
        <button
          onClick={() => openFocusOverlay(primary.taskId)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-2 py-1 text-left transition active:scale-[0.98]"
        >
          <span
            className={clsx(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              p.over
                ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                : 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
            )}
          >
            <Timer className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-stone-800 dark:text-slate-100">
              {primary.taskTitle}
            </span>
            <span
              className={clsx(
                'block font-mono text-xs tabular-nums',
                p.over ? 'text-rose-500' : p.paused ? 'text-amber-500' : 'text-stone-500 dark:text-slate-400',
              )}
            >
              {p.paused ? 'Paused · ' : ''}
              {p.over ? '+' : ''}
              {formatClock(p.valueMs)}
              {primary.hasEstimate && !p.over ? ' left' : ''}
            </span>
          </span>
        </button>

        {rest.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={`${rest.length} more focus timers`}
            className="flex h-9 shrink-0 items-center justify-center rounded-full bg-brand-100 px-3 text-sm font-semibold text-brand-700 transition active:scale-95 dark:bg-brand-500/20 dark:text-brand-300"
          >
            +{rest.length}
          </button>
        )}

        <button
          onClick={() => stop(primary.taskId)}
          aria-label="Stop focus timer"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 transition active:scale-90 dark:bg-rose-500/15 dark:text-rose-300"
        >
          <Square className="h-4 w-4" fill="currentColor" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: `Today.tsx` — focused tasks first in the today plan bucket**

Add to the `@/hooks/useFocusTimer` usage — insert import near the top imports:
```ts
import { useFocusedTaskIds } from '@/hooks/useFocusTimer'
```
Change the plan-day import on line 41 to also pull `focusedFirst`. Line 41 currently imports from `@/lib/format`; `focusedFirst` lives in `@/lib/planDay`. Find the existing `planDay` import (used for `buildNext`, `sortForPlanning`, etc.) and add `focusedFirst`, e.g.:
```ts
import { focusedFirst /* , existing planDay imports */ } from '@/lib/planDay'
```
(If `Today.tsx` doesn't already import from `@/lib/planDay`, add the line above.)

Add the hook next to the other hooks in the component body (near line 166–171):
```ts
  const focusedIds = useFocusedTaskIds()
```

Change the `today` bucket in the `planGroups` useMemo (line 265) from:
```ts
      today: filteredActive.filter(isToday).slice().sort(byAllocationAsc),
```
to:
```ts
      today: focusedFirst(filteredActive.filter(isToday).slice().sort(byAllocationAsc), focusedIds),
```
and add `focusedIds` to that useMemo's dependency array (line 272): `[filteredActive, todayStr, focusedIds]`.

- [ ] **Step 7: Build mobile**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build`
Expected: build succeeds, emits hashed assets under `vernon_project/public/frontend/assets/` + updates `public/frontend/index.html`. If it fails, fix the reported import/syntax error before committing.

- [ ] **Step 8: Commit (source only — assets handled at deploy)**

```bash
git add frontend/src/components/TodoCard.tsx frontend/src/pages/ProjectItemScreen.tsx \
  frontend/src/components/FocusOverlay.tsx frontend/src/components/Fab.tsx \
  frontend/src/components/FocusMiniBar.tsx frontend/src/pages/Today.tsx
git commit -m "feat(focus/mobile): concurrent timers, primary+count mini-bar, focused-first plan

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BMBFEjDsoMRdNyhH6DMYKd"
```

---

### Task 3: Web global focus surface + focused-first + web build

**Files:**
- Modify: `frontend-web/src/components/FocusOverlay.tsx` (import shared `FocusMeta`)
- Create: `frontend-web/src/components/FocusHost.tsx`
- Create: `frontend-web/src/components/FocusDock.tsx`
- Modify: `frontend-web/src/components/AppShell.tsx` (mount host + dock)
- Modify: `frontend-web/src/pages/ProjectItem.tsx` (use shared global overlay)
- Modify: `frontend-web/src/pages/Home.tsx` (focused-first)

**Interfaces consumed:** all of Task 1.

- [ ] **Step 1: `frontend-web/src/components/FocusOverlay.tsx` — use the shared FocusMeta type**

Delete the local definition (lines 20–26):
```ts
export type FocusMeta = {
  project?: string
  deadlineHuman?: string
  overdue?: boolean
  estimateLabel?: string
  group?: string
}
```
and add, alongside the other imports at the top (after line 18):
```ts
import type { FocusMeta } from '@/lib/focusUI'
```
(No other change — the component still uses `meta?: FocusMeta` in its props.)

- [ ] **Step 2: Create `frontend-web/src/components/FocusHost.tsx`**

```tsx
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { useFocusOverlay, closeFocusOverlay } from '@/lib/focusUI'
import { FocusOverlay } from '@web/components/FocusOverlay'

// The single global web focus overlay, driven by the shared focusUI store.
// Reads the open task's timer + meta and feeds the presentational FocusOverlay.
export function FocusHost() {
  const { open, taskId } = useFocusOverlay()
  const focus = useFocusTimer(taskId ?? '')
  if (!open || !focus.timer) return null
  return (
    <FocusOverlay
      title={focus.timer.taskTitle}
      meta={focus.timer.meta}
      displayMs={focus.hasEstimate ? focus.remainingMs : focus.elapsedMs}
      fraction={focus.fraction}
      stopwatch={!focus.hasEstimate}
      paused={focus.timer.status === 'paused'}
      onPause={focus.pause}
      onResume={focus.resume}
      onReset={focus.reset}
      onStop={() => {
        focus.stop()
        closeFocusOverlay()
      }}
      onClose={closeFocusOverlay}
    />
  )
}
```

- [ ] **Step 3: Create `frontend-web/src/components/FocusDock.tsx`**

```tsx
import { useState } from 'react'
import clsx from 'clsx'
import { Timer, ChevronDown, Square } from 'lucide-react'
import { useFocusTimers, type EnrichedTimer } from '@/hooks/useFocusTimer'
import { openFocusOverlay } from '@/lib/focusUI'
import { formatClock } from '@/lib/format'

// Global running-timers surface for web: a floating bottom-right pill showing
// the primary timer + count. Click (with >1 timer) toggles a dropdown listing
// all timers; each row opens that task's overlay or stops it. Hidden when none.
function parts(t: EnrichedTimer) {
  const over = t.hasEstimate && t.remainingMs < 0
  return { over, valueMs: t.hasEstimate ? t.remainingMs : t.elapsedMs, paused: t.status === 'paused' }
}

export function FocusDock() {
  const { timers, stop } = useFocusTimers()
  const [openList, setOpenList] = useState(false)
  if (!timers.length) return null

  const [primary] = timers
  const p = parts(primary)

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {openList && (
        <div className="w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {timers.map((t) => {
            const q = parts(t)
            return (
              <div
                key={t.taskId}
                className="flex items-center gap-2 border-b border-line px-2.5 py-2 last:border-b-0"
              >
                <button
                  onClick={() => {
                    openFocusOverlay(t.taskId)
                    setOpenList(false)
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Timer
                    className={clsx('h-4 w-4 shrink-0', q.over ? 'text-rose-500' : 'text-brand-600 dark:text-brand-400')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{t.taskTitle}</span>
                    <span
                      className={clsx(
                        'block font-mono text-xs tabular-nums',
                        q.over ? 'text-rose-500' : q.paused ? 'text-amber-500' : 'text-muted',
                      )}
                    >
                      {q.paused ? 'Paused · ' : ''}
                      {q.over ? '+' : ''}
                      {formatClock(q.valueMs)}
                      {t.hasEstimate && !q.over ? ' left' : ''}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => stop(t.taskId)}
                  aria-label={`Stop focus timer for ${t.taskTitle}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-rose-500 hover:bg-hover"
                >
                  <Square className="h-3.5 w-3.5" fill="currentColor" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <button
        onClick={() => (timers.length > 1 ? setOpenList((v) => !v) : openFocusOverlay(primary.taskId))}
        className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 shadow-lg transition hover:bg-hover"
      >
        <span
          className={clsx(
            'flex h-6 w-6 items-center justify-center rounded-full',
            p.over
              ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
              : 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
          )}
        >
          <Timer className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-sm tabular-nums text-ink">
          {p.over ? '+' : ''}
          {formatClock(p.valueMs)}
        </span>
        {timers.length > 1 && (
          <span className="flex items-center gap-0.5 text-sm font-medium text-muted">
            {timers.length} focusing
            <ChevronDown className={clsx('h-4 w-4 transition', openList && 'rotate-180')} />
          </span>
        )}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: `AppShell.tsx` — mount the dock + host**

Add imports after line 9 (`import { QuickCreate } ...`):
```ts
import { FocusDock } from '@web/components/FocusDock'
import { FocusHost } from '@web/components/FocusHost'
```
Add the two components just before the closing `</div>` of the shell (after line 117, the `<QuickCreate ... />` line):
```tsx
      <FocusDock />
      <FocusHost />
```

- [ ] **Step 5: `ProjectItem.tsx` (web) — route the Focus button through the shared overlay**

Remove the now-unused overlay import (line 54):
```ts
import { FocusOverlay } from '@web/components/FocusOverlay'
```
Add near the other `@/lib` imports:
```ts
import { openFocusOverlay } from '@/lib/focusUI'
```
Replace line 725:
```ts
  const focus = useFocusTimer()
```
with:
```ts
  const focus = useFocusTimer(todoName)
```
(`todoName` is defined on line 707, before `data` loads.)

Remove line 726:
```ts
  const [focusOpen, setFocusOpen] = useState(false)
```

Replace the `focusActive` + `openFocus` block (lines 805–809):
```ts
  const focusActive = focus.timer?.taskId === data.name
  const openFocus = () => {
    if (!focusActive) focus.start(data.name, data.to_do, data.estimated)
    setFocusOpen(true)
  }
```
with (fold the meta into `start`, open the shared overlay by id):
```ts
  const focusActive = focus.timer != null
  const openFocus = () => {
    if (!focusActive)
      focus.start(data.name, data.to_do, data.estimated, {
        project: data.project_name,
        deadlineHuman: data.deadline_human || undefined,
        overdue: data.is_overdue,
        estimateLabel: data.estimated > 0 ? formatEstimate(data.estimated) : undefined,
        group: data.group
          ? [
              data.group,
              data.level_type && data.level ? `${data.level_type} · ${data.level}` : data.level_type || data.level,
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined,
      })
    openFocusOverlay(data.name)
  }
```
(`focusOver` / `focusValueMs` on lines 810–811 stay as-is.)

Delete the inline overlay render (lines 815–839) — the whole block:
```tsx
      {/* Focus overlay — full-screen, rendered above everything */}
      {focusOpen && focusActive && focus.timer && (
        <FocusOverlay
          ...
        />
      )}
```
(FocusHost renders it globally now.)

- [ ] **Step 6: `Home.tsx` (web) — focused tasks first in the Planned list**

Add imports:
```ts
import { useFocusedTaskIds } from '@/hooks/useFocusTimer'
import { focusedFirst } from '@/lib/planDay'
```
(There's already `import { buildNext } from '@/lib/planDay'` on line 13 — extend it to `import { buildNext, focusedFirst } from '@/lib/planDay'`.)

Add the hook in the component body near the other `useMemo`s (around line 203):
```ts
  const focusedIds = useFocusedTaskIds()
```
Change the `planned` memo (lines 211–214):
```ts
  const planned = useMemo(
    () => allTasks.filter((t) => t.today_allocation > 0).slice().sort(byAllocationAsc),
    [allTasks],
  )
```
to:
```ts
  const planned = useMemo(
    () => focusedFirst(allTasks.filter((t) => t.today_allocation > 0).slice().sort(byAllocationAsc), focusedIds),
    [allTasks, focusedIds],
  )
```

- [ ] **Step 7: Build web**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build`
Expected: build succeeds, emits hashed assets under `vernon_project/public/frontend_web/assets/` + updates `public/frontend_web/index.html`. Fix any reported error before committing.

- [ ] **Step 8: Commit (source only)**

```bash
git add frontend-web/src/components/FocusOverlay.tsx frontend-web/src/components/FocusHost.tsx \
  frontend-web/src/components/FocusDock.tsx frontend-web/src/components/AppShell.tsx \
  frontend-web/src/pages/ProjectItem.tsx
git commit -m "feat(focus/web): global focus dock + shared overlay host, focused-first plan

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BMBFEjDsoMRdNyhH6DMYKd"
```
(Do NOT `git add frontend-web/src/pages/Home.tsx` — it's the user's untracked WIP. Ask the user before committing it.)

---

### Task 4: Deploy + manual verification

**Files:** built assets under `vernon_project/public/frontend/` and `vernon_project/public/frontend_web/` (regenerated by the Task 2/3 builds).

- [ ] **Step 1: Re-check git state (user works in parallel)**

Run: `git status --porcelain | grep -E 'public/frontend|Home.tsx'`
Confirm the built assets are the ones your builds produced. Coordinate with the user on whether built assets + their `Home.tsx` get committed (their branch may already stage these).

- [ ] **Step 2: Manual verification on the live site**

Mobile `/m`:
1. Start Focus on task A, then task B, then task C from the Today list — all three keep running. Mini-bar shows A (or the overdue one) + `+2`.
2. Tap `+2` → list of B and C; tap a row → its overlay opens showing that task's title/meta/ring; stop from a row removes just it.
3. Focused tasks appear at the top of the Plan → Today list.
4. Reload the PWA mid-timer → timers survive (legacy single-timer users: their one timer survives too).

Web `/w`:
1. Start Focus on two tasks from different ProjectItem pages → bottom-right dock shows `[⏱ 2 focusing ▾]`.
2. Dropdown lists both; open/stop each; overlay renders from the dock on any page.
3. Home → Planned tab shows focused tasks first.

- [ ] **Step 3: Update memory**

If the multi-timer model or the shared-`focusUI`-drives-both-overlays fact is worth persisting, add/update a memory file + `MEMORY.md` pointer.

---

## Self-Review

**Spec coverage:**
- Concurrent per-task timers → Task 1 (array store, id-scoped mutators). ✓
- Legacy migration → Task 1 Step 2 `load()`. ✓
- Meta on timer → Task 1 (`FocusTimer.meta`), set in Tasks 2/3 `start(...)`. ✓
- Scoped/global/membership hooks → Task 1. ✓
- Mobile primary+count mini-bar → Task 2 Step 5. ✓
- Mobile overlay reads active task → Task 2 Step 3. ✓
- Fab any-timer → Task 2 Step 4. ✓
- Focused-first (mobile Today + web Home) → Task 2 Step 6, Task 3 Step 6, `focusedFirst` in Task 1 Step 3. ✓
- Web global dock + host + AppShell mount → Task 3 Steps 2–4. ✓
- Web ProjectItem shared overlay → Task 3 Step 5. ✓
- Web FocusOverlay shared FocusMeta → Task 3 Step 1. ✓
- Testing deferred, one debt marker → Task 1 Step 3 `// ponytail:`. ✓

**Placeholder scan:** none — all steps carry exact code/paths/commands.

**Type consistency:** `useFocusTimer(taskId)` returns `{timer,elapsedMs,remainingMs,fraction,hasEstimate,start,pause,resume,reset,stop}` used identically by TodoCard / ProjectItemScreen / mobile FocusOverlay / web ProjectItem / FocusHost. `useFocusTimers()` returns `{timers,stop}` used by Fab / FocusMiniBar / FocusDock. `EnrichedTimer` imported where `timers[]` items are read. `openFocusOverlay(taskId)` single string arg at every call site. `FocusMeta` single definition in `focusUI.ts`, imported by store + both overlays. `focusedFirst(list, Set)` consistent in Task 2/3. ✓
