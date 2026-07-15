import type { FocusTimer } from '@/hooks/useFocusTimer'
import type { FocusRow } from '@/lib/api'

// Pure focus-timer merge — kept import-light (types only) so it's unit-checkable.
// See focusMerge.selfcheck.ts.

export function rowToTimer(r: FocusRow): FocusTimer {
  return {
    taskId: r.taskId,
    taskTitle: r.taskTitle,
    estimatedMs: r.estimatedMs,
    status: r.status as 'running' | 'paused',
    startedAt: r.startedAt,
    elapsedBeforeMs: r.elapsedBeforeMs,
    meta: r.meta ?? undefined,
  }
}

// Merge backend rows into the local timers. Non-destructive to a local timer the
// backend hasn't confirmed as ACTIVE yet (`synced` = taskIds seen running/paused):
// that's what stops a refresh — where the backend list can lag, a save failed, or
// an *idle note-row* lingers from a prior stop of the same task — from wiping a
// live timer. `resave` are the local-only timers to re-push. An idle row carries
// only a note; it is NOT an active timer, so it never drops a local one.
export function mergeTimers(
  local: FocusTimer[],
  synced: Set<string>,
  rows: FocusRow[],
): { timers: FocusTimer[]; resave: FocusTimer[]; synced: Set<string> } {
  const remote = new Map(rows.map((r) => [r.taskId, r]))
  const active = rows.filter((r) => r.status === 'running' || r.status === 'paused')
  const activeIds = new Set(active.map((r) => r.taskId))
  const timers: FocusTimer[] = []
  const resave: FocusTimer[] = []
  const handled = new Set<string>()
  for (const t of local) {
    handled.add(t.taskId)
    if (activeIds.has(t.taskId)) {
      timers.push(rowToTimer(remote.get(t.taskId)!)) // backend wins for a live timer
    } else if (synced.has(t.taskId)) {
      /* was seen ACTIVE, now inactive remotely → stopped on another device → drop */
    } else {
      timers.push(t) // never synced-active (save in flight/failed, or only an idle
      resave.push(t) // note-row exists) → keep it and re-push, so refresh isn't lossy
    }
  }
  for (const r of active) if (!handled.has(r.taskId)) timers.push(rowToTimer(r)) // started elsewhere
  return { timers, resave, synced: new Set(activeIds) }
}
