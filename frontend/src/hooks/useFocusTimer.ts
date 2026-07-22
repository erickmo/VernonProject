import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { FocusMeta } from '@/lib/focusUI'
import { focusApi, type FocusRow } from '@/lib/api'
import { connectFocusRealtime } from '@/lib/focusRealtime'
import { mergeTimers } from '@/lib/focusMerge'

// App-wide focus timers, backend-persisted so they LINK across a user's devices
// (web + mobile). MULTIPLE tasks can each run their own timer concurrently.
// Wall-clock based: while running we store the segment start and recompute
// remaining from Date.now(), so a backgrounded tab reflects real elapsed time.
// localStorage stays as an offline cache for instant first paint; the backend is
// the cross-device source of truth (hydrate on load + realtime + poll backstop).
//
// A permanent per-task NOTE lives alongside the timers (kept in `notesMap`), and
// survives stopping the timer — it reappears whenever the task is focused again
// on any device.
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

// ---- permanent per-task notes (survive timer stop, sync across devices) ----

let notesMap: Record<string, string> = {}

function setNotesMap(next: Record<string, string>) {
  notesMap = next
  emit()
}

// ---- backend sync (client owns wall-clock timing; backend persists + pings) ---

const noop = () => {}

function syncSave(t: FocusTimer) {
  focusApi
    .save({
      task: t.taskId,
      task_title: t.taskTitle,
      estimated_ms: t.estimatedMs,
      status: t.status,
      started_at_ms: t.startedAt,
      elapsed_before_ms: t.elapsedBeforeMs,
      meta: t.meta ?? null,
    })
    // Surface (don't swallow) so a broken save is visible in the console —
    // the merge below still keeps the timer locally so nothing is lost.
    .catch((e) => console.warn('[focus] save failed', e))
}

// `syncedIds` = taskIds the backend has confirmed active at least once. It lets a
// hydrate tell "stopped/completed elsewhere" (was synced, now absent → drop) from
// "not persisted yet" (never synced → KEEP + re-push). Reset per page load, so on a
// cold load it's the timer's AGE (see mergeTimers) that guards a fresh in-flight
// save from being dropped. Merge logic lives in `@/lib/focusMerge` (pure, checked).
let syncedIds = new Set<string>()

// Merge the backend's rows into the local store (cross-device source of truth,
// but never destructive to an un-synced local timer — see `mergeTimers`).
function applyRows(rows: FocusRow[]) {
  const { timers, resave, synced } = mergeTimers(current, syncedIds, rows, Date.now())
  syncedIds = synced
  setTimers(timers)
  resave.forEach(syncSave)
  // Notes: backend values, but keep a local note for any timer we're still
  // trying to persist (its note hasn't reached the backend yet either).
  const notes: Record<string, string> = {}
  for (const r of rows) if (r.note) notes[r.taskId] = r.note
  for (const t of resave) if (notesMap[t.taskId]) notes[t.taskId] = notesMap[t.taskId]
  setNotesMap(notes)
}

let hydrating = false
function hydrate() {
  if (hydrating) return
  hydrating = true
  focusApi
    .list()
    .then(applyRows)
    .catch(noop)
    .finally(() => {
      hydrating = false
    })
}

// One-time wiring: hydrate from backend, subscribe to realtime, and poll as a
// backstop (tab focus / visibility / slow interval) in case the socket drops.
let started = false
function ensureStarted() {
  if (started || typeof window === 'undefined') return
  started = true
  hydrate()
  connectFocusRealtime(hydrate)
  const onVisible = () => document.visibilityState === 'visible' && hydrate()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', hydrate)
  setInterval(hydrate, 60_000)
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
  const t: FocusTimer = {
    taskId,
    taskTitle,
    estimatedMs: estimatedMinutes * 60_000,
    status: 'running',
    startedAt: Date.now(),
    elapsedBeforeMs: 0,
    meta,
  }
  setTimers([...current, t])
  syncSave(t)
}

// Apply `fn` to the matching timer, persist locally, and sync the result to the
// backend (so pause/resume/reset propagate to the user's other devices).
function mapTimer(taskId: string, fn: (t: FocusTimer) => FocusTimer) {
  const next = current.map((t) => (t.taskId === taskId ? fn(t) : t))
  setTimers(next)
  const updated = next.find((t) => t.taskId === taskId)
  if (updated) syncSave(updated)
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
  focusApi.stop(taskId).catch(noop) // backend keeps the row iff it has a note
}

// ---- permanent per-task note ----

const noteDebounce: Record<string, ReturnType<typeof setTimeout>> = {}

function setNote(taskId: string, note: string) {
  setNotesMap({ ...notesMap, [taskId]: note })
  clearTimeout(noteDebounce[taskId])
  noteDebounce[taskId] = setTimeout(() => focusApi.setNote(taskId, note).catch(noop), 600)
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

// Init hydrate + realtime + poll the first time any focus hook mounts.
function useFocusInit() {
  useEffect(() => {
    ensureStarted()
  }, [])
}

// Scoped to one task. Same shape single-task callers used before, bound to
// `taskId`. `timer` is that task's timer (or null); no-arg controls act on it.
export function useFocusTimer(taskId: string) {
  useFocusInit()
  const timers = useSyncExternalStore(subscribe, () => current, () => current)
  const notes = useSyncExternalStore(subscribe, () => notesMap, () => notesMap)
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
  const saveNote = useCallback((note: string) => setNote(taskId, note), [taskId])

  const d = timer ? deriveFocus(timer, now) : null
  return {
    timer,
    elapsedMs: d?.elapsedMs ?? 0,
    remainingMs: d?.remainingMs ?? 0,
    fraction: d?.fraction ?? 0,
    hasEstimate: d?.hasEstimate ?? false,
    note: notes[taskId] ?? '',
    setNote: saveNote,
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
  useFocusInit()
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
