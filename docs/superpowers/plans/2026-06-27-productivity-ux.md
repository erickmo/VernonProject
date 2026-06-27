# Productivity UX Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the focus timer one-tap and app-global (Soft-Pop overlay + persistent mini-bar) and add a "Plan my day" sheet that allocates today's minutes — frontend only, reusing the existing `useFocusTimer` and `setTodoAllocations` engines.

**Architecture:** The focus timer becomes a single shared external store (so the card button, the global mini-bar, and the global overlay all reflect one live timer), with a second tiny store for overlay open/meta state — no React context boilerplate. The overlay and mini-bar mount once at the app root in `main.tsx`; any screen opens the overlay by calling `openFocusOverlay(meta)`. The planner is a drag-to-close bottom sheet that writes today-dated allocation rows per touched todo via `mobileApi.setTodoAllocations`, preserving each todo's other-day rows.

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
| `frontend/src/hooks/useFocusTimer.ts` | Modify (full rewrite of internals) | Same returned API as today, but backed by a shared module store (`useSyncExternalStore`) so every consumer reflects one live timer. |
| `frontend/src/lib/focusUI.ts` | Create | Tiny external store for the overlay's open/meta state + `openFocusOverlay()` / `closeFocusOverlay()` / `useFocusOverlay()`. Exports the `FocusMeta` type. |
| `frontend/src/components/FocusOverlay.tsx` | Modify (full rewrite) | Prop-less, app-global, Soft-Pop full-screen focus overlay; reads `useFocusTimer()` + `useFocusOverlay()`; keeps ambient-sound controls. |
| `frontend/src/components/FocusMiniBar.tsx` | Create | Slim pill above the bottom nav while a timer runs; tap reopens overlay, square stops the timer. |
| `frontend/src/main.tsx` | Modify (lines 5-10 imports, 46-58 tree) | Mounts `<FocusMiniBar />` + `<FocusOverlay />` once at the app root. |
| `frontend/src/pages/ProjectItemScreen.tsx` | Modify (lines 34-35, 682, 767-770, 778-801) | Switch the detail-screen focus button from a locally-rendered overlay to the global `openFocusOverlay(meta)`. |
| `frontend/src/components/TodoCard.tsx` | Modify (lines 1-8 imports, meta row ~44-80) | One-tap Focus affordance on every card → `start()` + `openFocusOverlay(meta)`. |
| `frontend/src/components/PlanDaySheet.tsx` | Create | "Plan my day" bottom sheet: minutes stepper per candidate todo; saves today-dated allocations, preserving other-day rows. |
| `frontend/src/pages/Today.tsx` | Modify (state ~115-119, candidates ~194, entry button ~400, sheet mount ~506) | "Plan my day" entry button + sheet mount; builds today candidate list. |

---

### Task 1: Shared focus-timer store (rewrite hook internals) + overlay UI store

**Files:**
- Modify `frontend/src/hooks/useFocusTimer.ts` (full rewrite, currently 1-119)
- Create `frontend/src/lib/focusUI.ts`

**Interfaces:**
- Produces (unchanged API) `useFocusTimer()` → `{ timer: FocusTimer | null, elapsedMs: number, remainingMs: number, fraction: number, hasEstimate: boolean, start(taskId: string, taskTitle: string, estimatedMinutes: number): void, pause(): void, resume(): void, reset(): void, stop(): void }`. Also re-exports `type FocusTimer`.
- Produces `type FocusMeta = { project?: string; deadlineHuman?: string; overdue?: boolean; estimateLabel?: string; group?: string }`
- Produces `openFocusOverlay(meta?: FocusMeta): void`, `closeFocusOverlay(): void`, `useFocusOverlay(): { open: boolean; meta?: FocusMeta }`

- [ ] Replace the entire contents of `frontend/src/hooks/useFocusTimer.ts` with the shared-store version (API identical to today; `start/pause/resume/reset/stop` now mutate a module store so all consumers stay in sync; per-second ticking stays local so only components that call the hook re-render):

```ts
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

// Single, app-wide focus timer persisted to localStorage so it survives reloads
// and navigation. Wall-clock based: while running we store the segment start
// time and recompute remaining from `Date.now()`, so a backgrounded tab/closed
// PWA still reflects real elapsed time on return. No backend involvement.
//
// Backed by a module-level store (not per-hook useState) so EVERY consumer — the
// card Focus button, the global mini-bar, the global overlay — observes the same
// timer the instant any of them starts/pauses/stops it.

const KEY = 'vernon.focusTimer'

export type FocusTimer = {
  taskId: string
  taskTitle: string
  estimatedMs: number
  status: 'running' | 'paused'
  startedAt: number // epoch ms when the current running segment began
  elapsedBeforeMs: number // elapsed accumulated before the current segment
}

function load(): FocusTimer | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as FocusTimer
    if (!t || typeof t.estimatedMs !== 'number' || !t.taskId) return null
    return t
  } catch {
    return null
  }
}

let current: FocusTimer | null = load()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function setTimerState(next: FocusTimer | null) {
  current = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable — store stays in-memory only */
  }
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

export function useFocusTimer() {
  const timer = useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  )
  const [now, setNow] = useState(() => Date.now())

  // Tick once a second only while a timer is actively running.
  useEffect(() => {
    if (timer?.status === 'running') {
      setNow(Date.now())
      const id = setInterval(() => setNow(Date.now()), 1000)
      return () => clearInterval(id)
    }
  }, [timer?.status])

  const start = useCallback(
    (taskId: string, taskTitle: string, estimatedMinutes: number) => {
      setTimerState({
        taskId,
        taskTitle,
        estimatedMs: estimatedMinutes * 60_000,
        status: 'running',
        startedAt: Date.now(),
        elapsedBeforeMs: 0,
      })
    },
    [],
  )

  const pause = useCallback(() => {
    if (!current || current.status !== 'running') return
    setTimerState({
      ...current,
      status: 'paused',
      elapsedBeforeMs: current.elapsedBeforeMs + (Date.now() - current.startedAt),
    })
  }, [])

  const resume = useCallback(() => {
    if (!current || current.status !== 'paused') return
    setTimerState({ ...current, status: 'running', startedAt: Date.now() })
  }, [])

  const reset = useCallback(() => {
    if (!current) return
    setTimerState({ ...current, startedAt: Date.now(), elapsedBeforeMs: 0 })
  }, [])

  const stop = useCallback(() => setTimerState(null), [])

  const elapsedMs = timer ? elapsedOf(timer, now) : 0
  const hasEstimate = !!timer && timer.estimatedMs > 0
  const remainingMs = timer ? timer.estimatedMs - elapsedMs : 0
  const fraction = hasEstimate ? Math.min(1, Math.max(0, remainingMs / timer!.estimatedMs)) : 0

  return { timer, elapsedMs, remainingMs, fraction, hasEstimate, start, pause, resume, reset, stop }
}
```

- [ ] Create `frontend/src/lib/focusUI.ts` (overlay open/meta store — mirrors the timer store, no provider needed):

```ts
import { useSyncExternalStore } from 'react'

// Lightweight UI state for the single, app-global focus overlay: whether it's
// open and the task meta to render. Kept in a tiny external store (mirrors the
// focus-timer store) so any screen can openFocusOverlay() and the one mounted
// overlay reacts — no React context/provider boilerplate.

export type FocusMeta = {
  project?: string
  deadlineHuman?: string
  overdue?: boolean
  estimateLabel?: string
  group?: string
}

type FocusUI = { open: boolean; meta?: FocusMeta }

let state: FocusUI = { open: false, meta: undefined }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function openFocusOverlay(meta?: FocusMeta) {
  // Reopening from the mini-bar (no meta) keeps the last meta shown.
  state = { open: true, meta: meta ?? state.meta }
  emit()
}

export function closeFocusOverlay() {
  state = { ...state, open: false }
  emit()
}

export function useFocusOverlay(): FocusUI {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
}
```

- [ ] **Manual smoke check:** `cd frontend && npm run build`. Expect a clean build (no TS errors). No UI change yet — this task only swaps the hook's internals and adds an unused store, so the existing focus button on a todo detail still works exactly as before (open `/m`, open a todo, tap **Focus mode**, ring counts down).
- [ ] **Commit:**
```
git add frontend/src/hooks/useFocusTimer.ts frontend/src/lib/focusUI.ts
git commit -m "$(cat <<'EOF'
refactor(focus): back useFocusTimer with shared store + add overlay UI store

So the card button, a global mini-bar, and a global overlay all reflect one
live timer. Hook's returned API is unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
EOF
)"
```

---

### Task 2: Rewrite FocusOverlay (Soft-Pop, prop-less, app-global) + mount it + rewire ProjectItemScreen

**Files:**
- Modify `frontend/src/components/FocusOverlay.tsx` (full rewrite, currently 1-237)
- Modify `frontend/src/main.tsx` (imports 5-10; tree 46-58)
- Modify `frontend/src/pages/ProjectItemScreen.tsx` (imports 34-35; state 682; `openFocus` 767-770; overlay JSX 778-801)

**Interfaces:**
- Consumes `useFocusTimer()` (Task 1), `useFocusOverlay()` + `closeFocusOverlay()` (Task 1), `formatClock` from `@/lib/format`, `ambient/loadSoundPrefs/saveSoundPrefs` from `@/lib/ambientSound`.
- Produces `export default function FocusOverlay()` (no props).

- [ ] Replace the entire contents of `frontend/src/components/FocusOverlay.tsx` with the prop-less Soft-Pop overlay (reads the shared timer + overlay-UI stores; ambient sound now gated on `open` so it only plays while the overlay is up):

```tsx
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  AlertCircle,
  CalendarDays,
  Clock,
  Coffee,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { formatClock } from '@/lib/format'
import { ambient, loadSoundPrefs, saveSoundPrefs } from '@/lib/ambientSound'
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { useFocusOverlay, closeFocusOverlay } from '@/lib/focusUI'

// Single app-global focus overlay. Mounted once at the app root; shows when a
// timer exists AND the overlay store is open. Presentational only — all timer
// state lives in the shared useFocusTimer store. The X closes the overlay but
// leaves the timer running (the mini-bar stays); Stop ends the timer.
export default function FocusOverlay() {
  const { timer, elapsedMs, remainingMs, fraction, hasEstimate, pause, resume, reset, stop } =
    useFocusTimer()
  const { open, meta } = useFocusOverlay()

  // ---- ambient sound (coffeeshop) ---- hooks must run unconditionally, so
  // they sit before the early return. Sound plays only while the overlay is up.
  const [prefs, setPrefs] = useState(() => loadSoundPrefs())
  const { enabled, volume } = prefs
  useEffect(() => {
    if (open && enabled) ambient.play()
    else ambient.stop()
  }, [open, enabled])
  useEffect(() => {
    ambient.setVolume(volume)
  }, [volume])
  useEffect(() => () => ambient.stop(), [])
  const patch = (p: Partial<typeof prefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...p }
      saveSoundPrefs(next)
      return next
    })

  if (!open || !timer) return null

  const stopwatch = !hasEstimate
  const paused = timer.status === 'paused'
  const over = !stopwatch && remainingMs < 0
  const displayMs = stopwatch ? elapsedMs : remainingMs

  const R = 130
  const C = 2 * Math.PI * R
  // Countdown: ring drains as time passes, pinned empty (rose) in overtime.
  // Stopwatch: no target, so show a full static ring.
  const offset = stopwatch ? 0 : over ? C : C * (1 - fraction)

  const onStop = () => {
    stop()
    closeFocusOverlay()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-paper via-paper to-brand-50 px-6 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <button
        onClick={closeFocusOverlay}
        aria-label="Close focus mode"
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] rounded-full p-2 text-stone-400 transition active:scale-90 dark:text-slate-500"
      >
        <X className="h-6 w-6" />
      </button>

      <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-brand-500">Focus mode</p>
      <h2 className="line-clamp-2 max-w-xs text-center font-display text-xl font-semibold text-stone-800 dark:text-slate-100">
        {timer.taskTitle}
      </h2>

      {/* Task detail */}
      {meta && (
        <div className="mb-7 mt-2 flex max-w-xs flex-col items-center gap-2">
          {meta.project && (
            <p className="text-xs font-medium text-stone-400 dark:text-slate-500">{meta.project}</p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {meta.deadlineHuman && (
              <span
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                  meta.overdue
                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                    : 'bg-paper-line text-stone-600 dark:bg-slate-800 dark:text-slate-300',
                )}
              >
                {meta.overdue ? <AlertCircle className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
                {meta.deadlineHuman}
              </span>
            )}
            {meta.estimateLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-paper-line px-2.5 py-1 text-xs font-semibold text-stone-600 dark:bg-slate-800 dark:text-slate-300">
                <Clock className="h-3.5 w-3.5" /> {meta.estimateLabel}
              </span>
            )}
            {meta.group && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                <Layers className="h-3.5 w-3.5" /> {meta.group}
              </span>
            )}
          </div>
        </div>
      )}
      {!meta && <div className="mb-8" />}

      <div className="relative flex h-72 w-72 items-center justify-center">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 300 300">
          <circle
            cx="150"
            cy="150"
            r={R}
            fill="none"
            strokeWidth="14"
            className="stroke-paper-edge dark:stroke-slate-800"
          />
          <circle
            cx="150"
            cy="150"
            r={R}
            fill="none"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            className={clsx(
              'transition-[stroke-dashoffset] duration-1000 ease-linear',
              over ? 'stroke-rose-500' : 'stroke-brand-500',
            )}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span
            className={clsx(
              'font-mono text-5xl font-bold tabular-nums',
              over ? 'text-rose-600 dark:text-rose-400' : 'text-stone-900 dark:text-slate-50',
            )}
          >
            {over ? '+' : ''}
            {formatClock(displayMs)}
          </span>
          <span
            className={clsx(
              'mt-2 text-xs font-semibold uppercase tracking-wide',
              over ? 'text-rose-500' : paused ? 'text-amber-500' : 'text-stone-400 dark:text-slate-500',
            )}
          >
            {over ? 'over estimate' : paused ? 'paused' : stopwatch ? 'elapsed' : 'remaining'}
          </span>
        </div>
      </div>

      <div className="mt-10 flex items-center gap-3">
        <button
          onClick={reset}
          aria-label="Reset timer"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-800 dark:text-slate-300"
        >
          <RotateCcw className="h-6 w-6" />
        </button>

        <button
          onClick={paused ? resume : pause}
          aria-label={paused ? 'Resume timer' : 'Pause timer'}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-white shadow-card transition active:scale-90"
        >
          {paused ? <Play className="ml-1 h-9 w-9" /> : <Pause className="h-9 w-9" />}
        </button>

        <button
          onClick={onStop}
          aria-label="Stop timer"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 transition active:scale-90 dark:bg-rose-500/15 dark:text-rose-400"
        >
          <Square className="h-6 w-6" fill="currentColor" />
        </button>
      </div>

      {/* Ambient sound */}
      <div className="mt-10 flex w-full max-w-xs flex-col items-center gap-3">
        <button
          onClick={() => patch({ enabled: !enabled })}
          className={clsx(
            'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95',
            enabled
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
              : 'bg-paper-line text-stone-500 dark:bg-slate-800 dark:text-slate-400',
          )}
        >
          {enabled ? <Coffee className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {enabled ? 'Coffeeshop on' : 'Coffeeshop off'}
        </button>

        {enabled && (
          <div className="flex w-full items-center gap-2 px-2">
            <VolumeX className="h-4 w-4 shrink-0 text-stone-400" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => patch({ volume: Number(e.target.value) })}
              className="h-1.5 flex-1 cursor-pointer accent-brand-600"
            />
            <Volume2 className="h-4 w-4 shrink-0 text-stone-400" />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] In `frontend/src/main.tsx`, add the two imports after the existing component imports (after line 9, the `ErrorBoundary` import):

```tsx
import FocusOverlay from './components/FocusOverlay'
import { FocusMiniBar } from './components/FocusMiniBar'
```

- [ ] In `frontend/src/main.tsx`, mount both at the app root by replacing the `<AdvanceProvider>…</AdvanceProvider>` block (currently lines 53-55):

```tsx
            <AdvanceProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
              <FocusMiniBar />
              <FocusOverlay />
            </AdvanceProvider>
```

> NOTE: `FocusMiniBar` is created in Task 3. Between this step and Task 3 the import will not resolve, so complete Task 2 and Task 3 together (or temporarily stub `FocusMiniBar`); the smoke check below is run after Task 3's file exists. If you must build mid-task, create `FocusMiniBar.tsx` from Task 3 first.

- [ ] In `frontend/src/pages/ProjectItemScreen.tsx`, replace the two focus imports (lines 34-35):

```tsx
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { openFocusOverlay } from '@/lib/focusUI'
```

(this drops `import FocusOverlay from '@/components/FocusOverlay'` — the overlay is now global.)

- [ ] In `frontend/src/pages/ProjectItemScreen.tsx`, delete the now-unused local overlay state (line 682):

```tsx
  const [focusOpen, setFocusOpen] = useState(false)
```

- [ ] In `frontend/src/pages/ProjectItemScreen.tsx`, replace the `openFocus` handler (lines 767-770) so it opens the global overlay with rich meta:

```tsx
  const openFocus = () => {
    if (!focusActive) focus.start(data.name, data.to_do, data.estimated)
    openFocusOverlay({
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
  }
```

- [ ] In `frontend/src/pages/ProjectItemScreen.tsx`, delete the entire locally-rendered overlay block (currently lines 778-801, the `{focusOpen && focusActive && focus.timer && (<FocusOverlay … />)}` JSX). Remove it completely — the global overlay replaces it. The big `Focus mode` button (lines 932-955) stays untouched.

- [ ] **Manual smoke check:** Run after Task 3 creates `FocusMiniBar.tsx`. `cd frontend && npm run build`, hard-reload `/m`. Open a todo detail → tap **Focus mode** → the new Soft-Pop overlay shows (warm paper→indigo gradient, brand ring counting down, task title in display font, project/deadline/estimate/group chips). Pause → label turns amber; Resume → counts again. Let it run past the estimate (or use a short-estimate todo) → countdown shows `+MM:SS` in rose, ring is rose. Tap the **X** → overlay closes, timer keeps running. Tap **Focus mode** again → reopens at the same time. Tap the rose **square** → timer ends, button reverts to "Focus mode".
- [ ] **Commit (run together with Task 3 so the build is green):**
```
git add frontend/src/components/FocusOverlay.tsx frontend/src/main.tsx frontend/src/pages/ProjectItemScreen.tsx
git commit -m "$(cat <<'EOF'
feat(focus): app-global Soft-Pop focus overlay

Rewrite FocusOverlay prop-less, mount once at root, open via openFocusOverlay().
ProjectItemScreen now opens the global overlay instead of a local one.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
EOF
)"
```

---

### Task 3: Persistent FocusMiniBar

**Files:**
- Create `frontend/src/components/FocusMiniBar.tsx`

**Interfaces:**
- Consumes `useFocusTimer()` (Task 1), `useFocusOverlay()` + `openFocusOverlay()` (Task 1), `formatClock` from `@/lib/format`.
- Produces `export function FocusMiniBar()` (no props) — mounted by `main.tsx` (Task 2).

- [ ] Create `frontend/src/components/FocusMiniBar.tsx`:

```tsx
import clsx from 'clsx'
import { Timer, Square } from 'lucide-react'
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { useFocusOverlay, openFocusOverlay } from '@/lib/focusUI'
import { formatClock } from '@/lib/format'

// Slim pill docked above the bottom nav while a focus timer runs. Tap reopens the
// overlay; the square stops the timer. Hidden while the overlay itself is open.
// Centered and width-capped to the app column, leaving the bottom-right corner
// clear for a future FAB.
export function FocusMiniBar() {
  const { timer, elapsedMs, remainingMs, hasEstimate, stop } = useFocusTimer()
  const { open } = useFocusOverlay()
  if (!timer || open) return null

  const over = hasEstimate && remainingMs < 0
  const valueMs = hasEstimate ? remainingMs : elapsedMs
  const paused = timer.status === 'paused'

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-40 flex justify-center px-4">
      <div className="pointer-events-auto mx-auto flex w-full max-w-[416px] items-center gap-2 rounded-full border border-paper-edge bg-paper-card px-2 py-1.5 shadow-card dark:border-slate-700 dark:bg-slate-800">
        <button
          onClick={() => openFocusOverlay()}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-2 py-1 text-left transition active:scale-[0.98]"
        >
          <span
            className={clsx(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              over
                ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                : 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
            )}
          >
            <Timer className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-stone-800 dark:text-slate-100">
              {timer.taskTitle}
            </span>
            <span
              className={clsx(
                'block font-mono text-xs tabular-nums',
                over ? 'text-rose-500' : paused ? 'text-amber-500' : 'text-stone-500 dark:text-slate-400',
              )}
            >
              {paused ? 'Paused · ' : ''}
              {over ? '+' : ''}
              {formatClock(valueMs)}
              {hasEstimate && !over ? ' left' : ''}
            </span>
          </span>
        </button>
        <button
          onClick={stop}
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

- [ ] **Manual smoke check:** `cd frontend && npm run build`, hard-reload `/m`. Open a todo detail, tap **Focus mode**, then tap **X** to close the overlay. The mini-bar pill appears just above the bottom nav showing the task title + live time. Navigate to Today / Projects / Review — the pill persists on every tab. Tap the pill → overlay reopens with the same task/time. Close again, tap the pill's rose **square** → pill disappears (timer stopped). Let a real timer go overtime → pill time shows `+MM:SS` in rose.
- [ ] **Commit:**
```
git add frontend/src/components/FocusMiniBar.tsx
git commit -m "$(cat <<'EOF'
feat(focus): persistent mini-bar above bottom nav while a timer runs

Tap reopens the overlay; square stops. Reads the shared focus store so it stays
in sync on every tab.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
EOF
)"
```

---

### Task 4: One-tap Focus on every TodoCard

**Files:**
- Modify `frontend/src/components/TodoCard.tsx` (imports 1-8; meta row 44-80)

**Interfaces:**
- Consumes `useFocusTimer()` (Task 1), `openFocusOverlay()` + `FocusMeta` (Task 1), `formatEstimate` (already imported).
- Produces no new exports — adds an inline Focus affordance inside the existing card.

- [ ] In `frontend/src/components/TodoCard.tsx`, extend the imports. Replace lines 1-8:

```tsx
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Clock, ChevronRight, CalendarDays, ArrowRight, Repeat, Play, Timer } from 'lucide-react'
import { STATUS } from '@/lib/status'
import { formatEstimate } from '@/lib/format'
import { Avatar, Pill } from './ui'
import { useAdvance } from '@/components/AdvanceProvider'
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { openFocusOverlay } from '@/lib/focusUI'
import type { ProjectItem } from '@/lib/types'
```

- [ ] In `frontend/src/components/TodoCard.tsx`, inside the `TodoCard` function body, add the timer hook + active flag. Replace the opening lines of the component (currently lines 17-25):

```tsx
export function TodoCard({ todo, showAssignee, showProject = true }: Props) {
  const navigate = useNavigate()
  const advanceConfirm = useAdvance()
  const meta = STATUS[todo.status_key]
  // ponytail: this subscribes the card to the per-second timer tick, so every
  // visible card re-renders ~1×/s while a timer runs. Fine for the Today list's
  // handful of cards; if a screen ever renders hundreds, swap this for an
  // imperative store start that doesn't subscribe.
  const focus = useFocusTimer()
  const focusActive = focus.timer?.taskId === todo.name

  const startFocus = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!focusActive) focus.start(todo.name, todo.to_do, todo.estimated)
    openFocusOverlay({
      project: todo.project_name,
      deadlineHuman: todo.deadline_human || undefined,
      overdue: todo.is_overdue,
      estimateLabel: todo.estimated > 0 ? formatEstimate(todo.estimated) : undefined,
    })
  }

  const onAdvance = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (todo.next_status_label) advanceConfirm(todo.name, todo.next_status_label, todo.to_do)
  }
```

- [ ] In `frontend/src/components/TodoCard.tsx`, add the Focus affordance as the first item in the meta flex-wrap row. Insert it immediately after the opening `<div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">` (currently line 44), before the status `<Pill>`. Use a `span role="button"` (the card itself is a `<button>`, so nested real buttons are invalid — this mirrors the existing advance affordance):

```tsx
            <span
              role="button"
              tabIndex={0}
              onClick={startFocus}
              title={focusActive ? 'Open focus timer' : 'Start focus timer'}
              className={clsx(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition active:scale-95',
                focusActive
                  ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                  : 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
              )}
            >
              {focusActive ? <Timer className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {focusActive ? 'Focusing' : 'Focus'}
            </span>
```

- [ ] **Manual smoke check:** `cd frontend && npm run build`, hard-reload `/m` Today. Each todo card shows a small **Focus** chip with a Play icon. Tap it → the Soft-Pop overlay opens immediately for that task (title + project/deadline/estimate chips correct), timer counts down. Close the overlay → mini-bar shows that task. Back on Today, that card's chip now reads **Focusing** with a Timer icon. Tapping a different card's **Focus** chip switches the active timer to the new task (single app-wide timer). Verify the chip tap does NOT navigate into the todo detail (stopPropagation works).
- [ ] **Commit:**
```
git add frontend/src/components/TodoCard.tsx
git commit -m "$(cat <<'EOF'
feat(focus): one-tap Focus chip on every todo card

Starts the shared timer and opens the overlay; reflects the active task.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
EOF
)"
```

---

### Task 5: "Plan my day" sheet + Today entry

**Files:**
- Create `frontend/src/components/PlanDaySheet.tsx`
- Modify `frontend/src/pages/Today.tsx` (state ~115-119; candidates ~194; entry button ~400; sheet mount ~506)

**Interfaces:**
- Consumes `mobileApi.setTodoAllocations(todoId: string, allocations: { date: string; minutes: number; note?: string }[])` from `@/lib/api`, `keys` (`keys.dashboard`, `keys.projectItem(name)`) from `@/hooks/useData`, `useQueryClient` from `@tanstack/react-query`, `useToast()` from `@/components/Toast`, `Spinner`/`EmptyState` from `@/components/ui`, `formatEstimate`/`todayISO` from `@/lib/format`, `type ProjectItem` from `@/lib/types`.
- Produces `export function PlanDaySheet({ todos, onClose }: { todos: ProjectItem[]; onClose: () => void })`.

- [ ] Create `frontend/src/components/PlanDaySheet.tsx` (drag-to-close bottom sheet mirroring `NotificationSheet`; per-todo minutes stepper; saves today-dated rows while preserving every other-day row):

```tsx
import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, CalendarRange, Sparkles, Save } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { mobileApi } from '@/lib/api'
import { keys } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner, EmptyState } from '@/components/ui'
import { formatEstimate, todayISO } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

const ANIM_MS = 260
const DAILY_TARGET_MIN = 360 // soft 6h/day target — a guide, not a cap
const CHIPS = [15, 30, 60]

// Plan today's minutes across candidate todos. Writes only today's allocation row
// per touched todo, preserving each todo's other-day rows. Planning only — never
// touches status/scoring (reuses the validated set_todo_allocations endpoint).
export function PlanDaySheet({ todos, onClose }: { todos: ProjectItem[]; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const today = todayISO()

  // Minutes planned for *today* per todo, seeded from today_allocation.
  const [mins, setMins] = useState<Record<string, number>>(() =>
    Object.fromEntries(todos.map((t) => [t.name, t.today_allocation || 0])),
  )
  const [saving, setSaving] = useState(false)

  const [shown, setShown] = useState(false) // drives the enter/exit slide
  const [drag, setDrag] = useState(0) // px the sheet is pulled down (>= 0)
  const dragging = useRef(false)
  const startY = useRef<number | null>(null)
  const closed = useRef(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const close = () => {
    if (closed.current) return
    closed.current = true
    setShown(false)
    setDrag(0)
    setTimeout(onClose, ANIM_MS)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    dragging.current = true
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || startY.current === null) return
    setDrag(Math.max(0, e.touches[0].clientY - startY.current))
  }
  const onTouchEnd = () => {
    dragging.current = false
    startY.current = null
    if (drag > 110) close()
    else setDrag(0)
  }

  const setMin = (id: string, v: number) => setMins((m) => ({ ...m, [id]: Math.max(0, v) }))

  const total = Object.values(mins).reduce((s, v) => s + v, 0)
  const pct = Math.min(1, total / DAILY_TARGET_MIN)

  const onSave = async () => {
    // Only write todos whose today-minutes actually changed.
    const touched = todos.filter((t) => (mins[t.name] || 0) !== (t.today_allocation || 0))
    if (!touched.length) {
      close()
      return
    }
    setSaving(true)
    try {
      await Promise.all(
        touched.map((t) => {
          const m = mins[t.name] || 0
          // Preserve every other-day row; replace only today's.
          const next = [
            ...(t.allocations ?? []).filter((a) => a.date !== today),
            ...(m > 0 ? [{ date: today, minutes: m }] : []),
          ]
          return mobileApi.setTodoAllocations(t.name, next)
        }),
      )
      qc.invalidateQueries({ queryKey: keys.dashboard })
      for (const t of touched) qc.invalidateQueries({ queryKey: keys.projectItem(t.name) })
      toast('success', 'Day planned')
      close()
    } catch (e) {
      toast('error', (e as Error).message || 'Could not save plan')
    } finally {
      setSaving(false)
    }
  }

  const sheetStyle: React.CSSProperties = {
    transform: shown ? `translateY(${drag}px)` : 'translateY(100%)',
    transition: dragging.current ? 'none' : `transform ${ANIM_MS}ms cubic-bezier(0.32,0.72,0,1)`,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-[260ms]"
        style={{ opacity: shown ? 1 : 0 }}
        onClick={close}
      />
      <div
        className="relative mx-auto flex max-h-[85vh] w-full max-w-[448px] flex-col rounded-t-[28px] bg-paper-card shadow-2xl will-change-transform dark:bg-slate-800"
        style={sheetStyle}
      >
        {/* Grabber + header — drag handle area */}
        <div
          className="shrink-0 cursor-grab touch-none px-5 pt-3 active:cursor-grabbing"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-stone-300 dark:bg-slate-600" />
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-500" />
            <h2 className="font-display text-lg font-semibold text-stone-800 dark:text-slate-50">Plan my day</h2>
          </div>
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs font-medium text-stone-500 dark:text-slate-400">
              <span>Planned today</span>
              <span>
                <span className="font-bold text-brand-600 dark:text-brand-400">{formatEstimate(total)}</span> /{' '}
                {formatEstimate(DAILY_TARGET_MIN)}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper-line dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {todos.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="Nothing to plan"
              subtitle="No tasks due today or overdue. Enjoy the breathing room."
            />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {todos.map((t) => {
                const v = mins[t.name] || 0
                return (
                  <li
                    key={t.name}
                    className="rounded-2xl border border-paper-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-800/60"
                  >
                    <p className="line-clamp-2 text-sm font-semibold text-stone-800 dark:text-slate-100">{t.to_do}</p>
                    <p className="mt-0.5 truncate text-[11px] text-stone-400 dark:text-slate-500">
                      {t.project_name}
                      {t.estimated > 0 ? ` · est ${formatEstimate(t.estimated)}` : ''}
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        onClick={() => setMin(t.name, v - 15)}
                        aria-label="15 minutes less"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-16 shrink-0 text-center text-sm font-bold tabular-nums text-stone-800 dark:text-slate-100">
                        {v > 0 ? formatEstimate(v) : '—'}
                      </span>
                      <button
                        onClick={() => setMin(t.name, v + 15)}
                        aria-label="15 minutes more"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <div className="ml-auto flex items-center gap-1">
                        {CHIPS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setMin(t.name, c)}
                            className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition active:scale-95 dark:bg-brand-500/15 dark:text-brand-300"
                          >
                            {c}m
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-paper-edge px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 dark:border-slate-700">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 text-sm font-semibold text-white transition active:bg-brand-700 disabled:opacity-60"
          >
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save plan
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] In `frontend/src/pages/Today.tsx`, add the `PlanDaySheet` import after the `NotesButton` import (currently line 32):

```tsx
import { PlanDaySheet } from '@/components/PlanDaySheet'
```

- [ ] In `frontend/src/pages/Today.tsx`, add the sheet-open state. Insert after the `const [sheet, setSheet] = useState(false)` line (currently line 117):

```tsx
  const [planOpen, setPlanOpen] = useState(false)
```

- [ ] In `frontend/src/pages/Today.tsx`, build the candidate list. Insert immediately after the `plannedTodayMin` definition (currently line 194):

```tsx
  // Plan-my-day candidates: everything due today + overdue, plus anything already
  // allocated to today (even if its deadline is future) so re-planning is complete.
  const planCandidates = useMemo(() => {
    if (!data) return []
    const byId = new Map<string, ProjectItem>()
    for (const t of [...data.due_today, ...data.overdue]) byId.set(t.name, t)
    for (const t of data.upcoming) if ((t.today_allocation || 0) > 0) byId.set(t.name, t)
    return [...byId.values()]
  }, [data])
```

- [ ] In `frontend/src/pages/Today.tsx`, add the "Plan my day" entry button inside the `lens === 'me'` block, between the filter row and the deadline-bucket group tabs. Insert it right after the closing `</div>` of the filter row (the `<div className="mt-4 flex items-stretch gap-2">…</div>` block, currently ending at line 400), i.e. immediately before the `{(() => {` group-tabs IIFE:

```tsx
                  <button
                    onClick={() => setPlanOpen(true)}
                    className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-3.5 text-left transition active:scale-[0.99] dark:border-brand-500/30 dark:bg-brand-500/15"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-brand-800 dark:text-brand-300">Plan my day</span>
                      <span className="block text-xs text-brand-600/80 dark:text-brand-300/70">
                        {plannedTodayMin > 0
                          ? `${formatEstimate(plannedTodayMin)} planned for today`
                          : "Allocate minutes to today's tasks"}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-brand-400" />
                  </button>
```

- [ ] In `frontend/src/pages/Today.tsx`, mount the sheet. Insert immediately after the closing `/>` of `<FilterSheet … />` (currently line 506), before the closing `</TabScreen>`:

```tsx
      {planOpen && <PlanDaySheet todos={planCandidates} onClose={() => setPlanOpen(false)} />}
```

- [ ] **Manual smoke check:** `cd frontend && npm run build`, hard-reload `/m` Today (lens "For me"). A **Plan my day** card sits above the Today/Overdue/Upcoming tabs. Tap it → bottom sheet slides up listing today's due + overdue todos, each with a −/+ stepper (15m steps) and 15m/30m/60m chips; header shows running total vs 6h target with a progress bar. Set e.g. 30m on one task and 60m on another → tap **Save plan** → toast "Day planned", sheet closes. The Today hero ring and the "Planning for today" line update to reflect the new allocated minutes. Re-open the sheet → the saved minutes are pre-filled. Open one of those todos' detail → the existing "Split across days" card still shows any prior other-day rows intact (today's row added/updated, other days untouched). Drag the sheet handle down → it closes without saving.
- [ ] **Commit:**
```
git add frontend/src/components/PlanDaySheet.tsx frontend/src/pages/Today.tsx
git commit -m "$(cat <<'EOF'
feat(today): Plan my day sheet — allocate today's minutes per todo

Per-todo minutes stepper + quick chips; saves today-dated allocation rows via
set_todo_allocations, preserving each todo's other-day rows. Feeds the Today ring.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
EOF
)"
```

---

### Task 6 (optional, deferred): Automated tests

Per project convention there is no test DB, so per-task automated tests are skipped. When a test pass is scheduled, add lightweight pure-logic unit tests (no Frappe, no DB) for the parts worth locking down:
- `useFocusTimer` store transitions (start → pause accumulates `elapsedBeforeMs`; resume resets `startedAt`; reset zeroes elapsed; stop clears) — extract the pure `setTimerState`-driven reducer logic and assert against it, or test via `@testing-library/react` `renderHook`.
- `PlanDaySheet` allocation merge: given `allocations=[{date:'2026-06-25',minutes:30},{date:today,minutes:10}]` and a new today value of `45`, the payload is `[{date:'2026-06-25',minutes:30},{date:today,minutes:45}]`; a new today value of `0` drops today's row but keeps `2026-06-25`. Extract the merge into a tiny pure helper if testing it directly is easier.

- [ ] Decide test runner (Vitest is the natural fit for this Vite app) and add only if the team opts in.
- [ ] **Commit** (only if tests are added):
```
git add frontend
git commit -m "$(cat <<'EOF'
test(focus,today): pure-logic tests for timer store + allocation merge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
EOF
)"
```
