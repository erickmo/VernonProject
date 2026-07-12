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

export function stopTimer(taskId: string) {
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
