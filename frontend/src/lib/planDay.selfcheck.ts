// @ts-nocheck — test-only file, run via esbuild; not part of the app bundle
import assert from 'node:assert'
import type { ProjectItem } from './types'
import { autoFillPlan, filterCandidates, sortForPlanning, touchedDiff, buildNext, planFloor } from './planDay'
import { byAllocationAsc } from './format'

// Minimal ProjectItem factory — only the fields these pure fns read.
function item(over: Partial<ProjectItem>): ProjectItem {
  const base = { name: 'x', to_do: '', project_name: '', today_allocation: 0, estimated: 0, deadline: null, allocations: [] }
  return { ...base, ...over } as unknown as ProjectItem
}

// filterCandidates
const cands = [
  item({ name: 'a', to_do: 'Write report', project_name: 'Acme' }),
  item({ name: 'b', to_do: 'Fix bug', project_name: 'Beta' }),
]
assert.deepEqual(filterCandidates(cands, '').map((t) => t.name), ['a', 'b'], 'empty query → all')
assert.deepEqual(filterCandidates(cands, 'report').map((t) => t.name), ['a'], 'title match')
assert.deepEqual(filterCandidates(cands, 'beta').map((t) => t.name), ['b'], 'project match (case-insensitive)')

// sortForPlanning: planned first (most minutes), unplanned keep input order
const list = [
  item({ name: 'a' }), item({ name: 'b' }), item({ name: 'c' }), item({ name: 'd' }),
]
const mins = { b: 30, d: 60 }
assert.deepEqual(
  sortForPlanning(list, mins).map((t) => t.name),
  ['d', 'b', 'a', 'c'],
  'planned (d=60, b=30) on top; unplanned a,c stable',
)

// touchedDiff: only rows whose today-minutes changed vs today_allocation
const saved = [item({ name: 'a', today_allocation: 0 }), item({ name: 'b', today_allocation: 30 })]
assert.deepEqual(
  touchedDiff(saved, { a: 15, b: 30 }).map((t) => t.name),
  ['a'],
  'a changed 0→15; b unchanged 30',
)

// buildNext: replace today's row, preserve others; 0 drops today's row
const allocs = [{ date: '2026-06-28', minutes: 60 }, { date: '2026-06-29', minutes: 30 }]
assert.deepEqual(
  buildNext(allocs, '2026-06-29', 45),
  [{ date: '2026-06-28', minutes: 60 }, { date: '2026-06-29', minutes: 45 }],
  'today row replaced, other-day kept',
)
assert.deepEqual(
  buildNext(allocs, '2026-06-29', 0),
  [{ date: '2026-06-28', minutes: 60 }],
  '0 minutes drops today row',
)

// byAllocationAsc: fewest today-minutes first
const sorted = [
  item({ name: 'big', today_allocation: 90, estimated: 0 }),
  item({ name: 'small', today_allocation: 15, estimated: 0 }),
].sort(byAllocationAsc)
assert.deepEqual(sorted.map((t) => t.name), ['small', 'big'], 'fewest minutes first')

// planFloor: a today-deadline todo is pinned to today's plan at (at least) its estimate.
const TODAY = '2026-07-16'
assert.equal(planFloor(item({ deadline: TODAY, estimated: 60 }), TODAY), 60, 'due today → floor = estimate')
assert.equal(planFloor(item({ deadline: TODAY, estimated: 0 }), TODAY), 30, 'due today, no estimate → floor = 30')
assert.equal(planFloor(item({ deadline: TODAY, estimated: 60, is_waiting: true }), TODAY), 0, 'waiting → no floor')
assert.equal(planFloor(item({ deadline: '2026-07-17', estimated: 60 }), TODAY), 0, 'future deadline → no floor')
assert.equal(planFloor(item({ deadline: '2026-07-15', estimated: 60 }), TODAY), 0, 'overdue → no floor')
assert.equal(planFloor(item({ deadline: null, estimated: 60 }), TODAY), 0, 'no deadline → no floor')

// autoFillPlan
const names = (picks: { todo: ProjectItem }[]) => picks.map((p) => p.todo.name)

// base only when min already met by base (no overdue/future pulled)
assert.deepEqual(
  names(
    autoFillPlan(
      {
        due_today: [item({ name: 'd1', estimated: 60, deadline: '2026-07-12' })],
        overdue: [item({ name: 'o1', estimated: 30, deadline: '2026-07-10' })],
        upcoming: [item({ name: 'u1', estimated: 30, deadline: '2026-07-20' })],
      },
      60,
    ),
  ),
  ['d1'],
  'base (60m) already meets min 60 → no overdue/future pulled',
)

// under min pulls overdue BEFORE future
assert.deepEqual(
  names(
    autoFillPlan(
      {
        due_today: [],
        overdue: [item({ name: 'o1', estimated: 30, deadline: '2026-07-10' })],
        upcoming: [item({ name: 'u1', estimated: 30, deadline: '2026-07-20' })],
      },
      45,
    ),
  ),
  ['o1', 'u1'],
  'under min: overdue pulled before future',
)

// overdue oldest-first, future nearest-first
assert.deepEqual(
  names(
    autoFillPlan(
      {
        due_today: [],
        overdue: [
          item({ name: 'oNew', estimated: 30, deadline: '2026-07-11' }),
          item({ name: 'oOld', estimated: 30, deadline: '2026-07-01' }),
        ],
        upcoming: [
          item({ name: 'uFar', estimated: 30, deadline: '2026-08-01' }),
          item({ name: 'uNear', estimated: 30, deadline: '2026-07-15' }),
        ],
      },
      999,
    ),
  ),
  ['oOld', 'oNew', 'uFar', 'uNear'],
  'overdue oldest-first, then future farthest-first',
)

// is_waiting excluded; null-deadline upcoming excluded from future pool
assert.deepEqual(
  names(
    autoFillPlan(
      {
        due_today: [item({ name: 'dWait', estimated: 60, deadline: '2026-07-12', is_waiting: true })],
        overdue: [item({ name: 'oWait', estimated: 30, deadline: '2026-07-10', is_waiting: true })],
        upcoming: [
          item({ name: 'uNull', estimated: 30, deadline: null }),
          item({ name: 'uOk', estimated: 30, deadline: '2026-07-20' }),
        ],
      },
      999,
    ),
  ),
  ['uOk'],
  'waiting tasks skipped everywhere; null-deadline upcoming not in future pool',
)

// already-planned-today counted toward total (fewer pulled) and NOT in picks
assert.deepEqual(
  names(
    autoFillPlan(
      {
        due_today: [],
        overdue: [
          item({ name: 'oPlanned', estimated: 30, deadline: '2026-07-05', today_allocation: 40 }),
          item({ name: 'oFree', estimated: 30, deadline: '2026-07-10' }),
        ],
        upcoming: [item({ name: 'u1', estimated: 30, deadline: '2026-07-20' })],
      },
      60,
    ),
  ),
  ['oFree'],
  'planned-today (40m) counts toward total → only oFree pulled to reach 60; planned not re-added',
)

// minMinutes <= 0 => only base returned
assert.deepEqual(
  names(
    autoFillPlan(
      {
        due_today: [item({ name: 'd1', estimated: 30, deadline: '2026-07-12' })],
        overdue: [item({ name: 'o1', estimated: 30, deadline: '2026-07-10' })],
        upcoming: [item({ name: 'u1', estimated: 30, deadline: '2026-07-20' })],
      },
      0,
    ),
  ),
  ['d1'],
  'min <= 0 → base only',
)

console.log('planDay self-check OK')
