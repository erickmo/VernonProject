import { useCallback, useEffect, useRef, useState } from 'react'

// Single, app-wide focus timer persisted to localStorage so it survives reloads
// and navigation. Wall-clock based: while running we store the segment start
// time and recompute remaining from `Date.now()`, so a backgrounded tab/closed
// PWA still reflects real elapsed time on return. No backend involvement.

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

function save(t: FocusTimer | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable — timer stays in-memory only */
  }
}

function elapsedOf(t: FocusTimer, now: number): number {
  return t.elapsedBeforeMs + (t.status === 'running' ? now - t.startedAt : 0)
}

export function useFocusTimer() {
  const [timer, setTimer] = useState<FocusTimer | null>(() => load())
  const [now, setNow] = useState(() => Date.now())
  const tick = useRef<ReturnType<typeof setInterval>>()

  // Tick once a second only while a timer is actively running.
  useEffect(() => {
    if (timer?.status === 'running') {
      setNow(Date.now())
      tick.current = setInterval(() => setNow(Date.now()), 1000)
      return () => clearInterval(tick.current)
    }
  }, [timer?.status])

  const update = useCallback((next: FocusTimer | null) => {
    save(next)
    setTimer(next)
    setNow(Date.now())
  }, [])

  const start = useCallback(
    (taskId: string, taskTitle: string, estimatedMinutes: number) => {
      update({
        taskId,
        taskTitle,
        estimatedMs: estimatedMinutes * 60_000,
        status: 'running',
        startedAt: Date.now(),
        elapsedBeforeMs: 0,
      })
    },
    [update],
  )

  const pause = useCallback(() => {
    setTimer((t) => {
      if (!t || t.status !== 'running') return t
      const next: FocusTimer = {
        ...t,
        status: 'paused',
        elapsedBeforeMs: t.elapsedBeforeMs + (Date.now() - t.startedAt),
      }
      save(next)
      return next
    })
  }, [])

  const resume = useCallback(() => {
    setTimer((t) => {
      if (!t || t.status !== 'paused') return t
      const next: FocusTimer = { ...t, status: 'running', startedAt: Date.now() }
      save(next)
      setNow(Date.now())
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setTimer((t) => {
      if (!t) return t
      const next: FocusTimer = { ...t, startedAt: Date.now(), elapsedBeforeMs: 0 }
      save(next)
      setNow(Date.now())
      return next
    })
  }, [])

  const stop = useCallback(() => update(null), [update])

  const elapsedMs = timer ? elapsedOf(timer, now) : 0
  const hasEstimate = !!timer && timer.estimatedMs > 0
  const remainingMs = timer ? timer.estimatedMs - elapsedMs : 0
  const fraction = hasEstimate ? Math.min(1, Math.max(0, remainingMs / timer!.estimatedMs)) : 0

  return { timer, elapsedMs, remainingMs, fraction, hasEstimate, start, pause, resume, reset, stop }
}
