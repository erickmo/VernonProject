// @ts-nocheck — test-only, run via esbuild (see planDay.selfcheck.ts pattern).
import assert from 'node:assert'
import { mergeTimers } from './focusMerge'

function timer(taskId, status = 'running', elapsedBeforeMs = 0) {
  return { taskId, taskTitle: 'x', estimatedMs: 0, status, startedAt: 1000, elapsedBeforeMs, meta: undefined }
}
function row(taskId, status = 'running', elapsedBeforeMs = 0) {
  return { taskId, taskTitle: 'x', estimatedMs: 0, status, startedAt: 1000, elapsedBeforeMs, note: '', meta: null }
}
const ids = (ts) => ts.map((t) => t.taskId)

// 1) THE BUG: refresh with an empty/lagging backend must NOT wipe a live local
//    timer — keep it and re-push.
let r = mergeTimers([timer('t1')], new Set(), [])
assert.deepEqual(ids(r.timers), ['t1'], 'empty backend keeps un-synced local timer')
assert.deepEqual(ids(r.resave), ['t1'], 'un-synced local timer is re-pushed')

// 2) Stopped on another device: was synced, now absent → drop.
r = mergeTimers([timer('t1')], new Set(['t1']), [])
assert.deepEqual(r.timers, [], 'synced-then-absent timer is dropped (stopped elsewhere)')
assert.deepEqual(r.resave, [], 'nothing re-pushed on a genuine remote stop')

// 3) Started on another device: local empty, backend running → added.
r = mergeTimers([], new Set(), [row('t2')])
assert.deepEqual(ids(r.timers), ['t2'], 'remote-started timer is adopted')

// 4) THE WEB BUG: a leftover idle note-row for a re-focused task must NOT drop the
//    live local timer — keep it and re-push (so the row goes back to running).
r = mergeTimers([timer('t1')], new Set(), [row('t1', 'idle')])
assert.deepEqual(ids(r.timers), ['t1'], 'idle note-row does not drop a live local timer')
assert.deepEqual(ids(r.resave), ['t1'], 'the kept timer is re-pushed to running')

// 5) Backend wins for a live timer (adopt its elapsed/status).
r = mergeTimers([timer('t1', 'running', 5)], new Set(['t1']), [row('t1', 'running', 999)])
assert.equal(r.timers[0].elapsedBeforeMs, 999, 'backend state wins for a still-active timer')

console.log('focusMerge self-check OK')
