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

// A local timer the backend doesn't have AND that this session never saw active is
// kept + re-pushed only if it's younger than this — long enough to cover an in-flight
// save (or a brief offline burst), short enough that a stale timer from a prior
// session (its task completed/deleted while the tab was closed, backend row since
// gone) is dropped instead of resurrected into the FAB. See mergeTimers.
const STALE_MS = 10 * 60_000

// An *idle* remote row is authoritative proof the timer ended server-side (task
// completed/cancelled → clear_task_timers, or stopped on another device). The only
// reason to keep a local running timer over it is a just-issued RE-FOCUS whose save
// hasn't landed yet — a sub-second race. This tight grace covers that race without
// letting a completed-todo leftover linger in the FAB for the full STALE_MS window.
const REFOCUS_GRACE_MS = 15_000

// Merge backend rows into the local timers. Non-destructive to a local timer the
// backend hasn't confirmed as ACTIVE yet (`synced` = taskIds seen running/paused):
// that's what stops a refresh — where the backend list can lag or a save failed —
// from wiping a live timer. `resave` are the local-only timers to re-push.
//
// `now` gates the un-synced keep by age: on a cold load `synced` is empty, so a
// stale localStorage timer would otherwise be kept + resurrected — the age check
// distinguishes a just-started (save in flight) timer from an old dead one. Two
// windows: STALE_MS (generous) when the backend has NO row at all (first save may
// be slow), REFOCUS_GRACE_MS (tight) when the backend has an *idle* row for the
// task (it KNOWS the timer ended — only a live re-focus should override it).
export function mergeTimers(
  local: FocusTimer[],
  synced: Set<string>,
  rows: FocusRow[],
  now: number,
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
    } else if (remote.has(t.taskId)) {
      // Backend has a row for this task but it's NOT active (idle note-row) → the
      // timer ended server-side (task completed/cancelled, or stopped elsewhere).
      // Drop it — that's the completed-todo-stuck-in-FAB fix — UNLESS we only just
      // re-focused it locally (a hydrate can race ahead of the re-focus save), in
      // which case keep + re-push so the row flips back to running.
      if (now - t.startedAt < REFOCUS_GRACE_MS) {
        timers.push(t)
        resave.push(t)
      }
    } else if (now - t.startedAt < STALE_MS) {
      timers.push(t) // no remote row at all → fresh & un-synced (first save in
      resave.push(t) // flight/failed) → keep it and re-push, so a quick refresh isn't lossy
    }
    // ponytail: else stale un-synced → drop. Ceiling: a genuinely-still-running
    // timer whose save never landed for >10min is lost. Persist synced across loads
    // if that edge ever matters.
  }
  for (const r of active) if (!handled.has(r.taskId)) timers.push(rowToTimer(r)) // started elsewhere
  return { timers, resave, synced: new Set(activeIds) }
}
