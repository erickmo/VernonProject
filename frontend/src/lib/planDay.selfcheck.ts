// @ts-nocheck — test-only file, run via esbuild; not part of the app bundle
import assert from 'node:assert'
import type { ProjectItem } from './types'
import { filterCandidates, sortForPlanning, touchedDiff, buildNext } from './planDay'
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

console.log('planDay self-check OK')
