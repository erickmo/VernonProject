// @ts-nocheck — test-only, run via esbuild (see planDay.selfcheck.ts pattern).
import assert from 'node:assert'
import { mergeTimers } from './focusMerge'

const NOW = 1_000_000
// startedAt defaults to NOW so an un-synced timer reads as "fresh" (save in flight)
// unless a test overrides it to something old.
function timer(taskId, status = 'running', elapsedBeforeMs = 0, startedAt = NOW) {
  return { taskId, taskTitle: 'x', estimatedMs: 0, status, startedAt, elapsedBeforeMs, meta: undefined }
}
function row(taskId, status = 'running', elapsedBeforeMs = 0, sortOrder = 0) {
  return { taskId, taskTitle: 'x', estimatedMs: 0, status, startedAt: NOW, elapsedBeforeMs, note: '', meta: null, sortOrder }
}
const ids = (ts) => ts.map((t) => t.taskId)

// 1) THE BUG: refresh with an empty/lagging backend must NOT wipe a FRESH live local
//    timer — keep it and re-push.
let r = mergeTimers([timer('t1')], new Set(), [], NOW)
assert.deepEqual(ids(r.timers), ['t1'], 'empty backend keeps a fresh un-synced local timer')
assert.deepEqual(ids(r.resave), ['t1'], 'a fresh un-synced local timer is re-pushed')

// 1b) THE STUCK-FAB BUG: a STALE un-synced localStorage timer (task completed while the
//     tab was closed, backend row gone) must be dropped, not resurrected.
r = mergeTimers([timer('t1', 'running', 0, NOW - 20 * 60_000)], new Set(), [], NOW)
assert.deepEqual(r.timers, [], 'stale un-synced local timer is dropped')
assert.deepEqual(r.resave, [], 'stale un-synced local timer is NOT re-pushed')

// 2) Stopped on another device: was synced, now absent → drop (even if fresh).
r = mergeTimers([timer('t1')], new Set(['t1']), [], NOW)
assert.deepEqual(r.timers, [], 'synced-then-absent timer is dropped (stopped elsewhere)')
assert.deepEqual(r.resave, [], 'nothing re-pushed on a genuine remote stop')

// 3) Started on another device: local empty, backend running → added.
r = mergeTimers([], new Set(), [row('t2')], NOW)
assert.deepEqual(ids(r.timers), ['t2'], 'remote-started timer is adopted')

// 4) THE WEB BUG: a leftover idle note-row for a re-focused (FRESH, startedAt≈now)
//    task must NOT drop the live local timer — keep it and re-push (row → running).
r = mergeTimers([timer('t1')], new Set(), [row('t1', 'idle')], NOW)
assert.deepEqual(ids(r.timers), ['t1'], 'idle note-row does not drop a fresh local timer')
assert.deepEqual(ids(r.resave), ['t1'], 'the kept timer is re-pushed to running')

// 4b) THE STUCK-FAB BUG: a completed todo idles its backend row (clear_task_timers),
//     but a stale local running timer (started minutes ago, un-synced) lingered in
//     localStorage. An idle remote row is authoritative → drop it, do NOT resurrect.
r = mergeTimers([timer('t1', 'running', 0, NOW - 60_000)], new Set(), [row('t1', 'idle')], NOW)
assert.deepEqual(r.timers, [], 'idle remote row drops a stale (non-refocus) local timer')
assert.deepEqual(r.resave, [], 'a completed todo is NOT re-pushed/resurrected')

// 5) Backend wins for a live timer (adopt its elapsed/status).
r = mergeTimers([timer('t1', 'running', 5)], new Set(['t1']), [row('t1', 'running', 999)], NOW)
assert.equal(r.timers[0].elapsedBeforeMs, 999, 'backend state wins for a still-active timer')

// 6) Drag-to-reorder: final order follows the backend's sortOrder, not arrival
//    order — a reorder made on another device must win, even though both rows
//    were already known locally in the opposite order.
r = mergeTimers(
  [timer('t1'), timer('t2')],
  new Set(['t1', 't2']),
  [row('t1', 'running', 0, 1), row('t2', 'running', 0, 0)],
  NOW,
)
assert.deepEqual(ids(r.timers), ['t2', 't1'], 'remote sortOrder wins over local array order')

// 6b) A fresh un-synced local timer (no remote row, sortOrder unknown) sorts after
//     every remote-known row instead of jumping ahead of the persisted order.
r = mergeTimers([timer('t1'), timer('new')], new Set(['t1']), [row('t1', 'running', 0, 5)], NOW)
assert.deepEqual(ids(r.timers), ['t1', 'new'], 'un-synced local-only timer falls to the end')

console.log('focusMerge self-check OK')
