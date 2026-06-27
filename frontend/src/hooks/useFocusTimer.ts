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
