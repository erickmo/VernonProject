// @ts-nocheck — test-only file, run via esbuild; not part of the app bundle
import assert from 'node:assert/strict'
import { buildOptions, groupByDetail, detailPickerOptions, availableDetailOptions, filterByTags, cycleTag, todoHasTag, todoDayBucket, cycleDay, filterByDay, aiPhaseOf } from './filters'

const todos = [
  { project: 'P1', project_name: 'Alpha', detail: 'Login screen' },
  { project: 'P1', project_name: 'Alpha', detail: 'Signup screen' },
  { project: 'P1', project_name: 'Alpha', detail: 'Login screen' }, // dup detail collapses
  { project: 'P2', project_name: 'Beta', detail: 'Invoices' },
  { project: '', project_name: 'skip', detail: 'x' }, // empty value dropped
]

const opts = buildOptions(todos, (t) => t.project, (t) => t.project_name, (t) => t.detail)

// Two distinct projects, empty-value row dropped.
assert.equal(opts.length, 2)
const p1 = opts.find((o) => o.value === 'P1')
// Detail titles gathered, deduped, joined — this is what the search box matches on.
assert.equal(p1.count, 3)
assert.equal(p1.keywords, 'Login screen Signup screen')
assert.match(p1.keywords.toLowerCase(), /signup/) // searching "signup" would surface Alpha

// No keyword accessor → keywords stays undefined (backward compatible).
const bare = buildOptions(todos, (t) => t.project, (t) => t.project_name)
assert.equal(bare.find((o) => o.value === 'P2').keywords, undefined)

// --- groupByDetail + detailPickerOptions (focus pickers) ---
const items = [
  { project: 'P1', project_name: 'Alpha', project_detail: 'D1', project_detail_title: 'Login' },
  { project: 'P1', project_name: 'Alpha', project_detail: 'D1', project_detail_title: 'Login' },
  { project: 'P1', project_name: 'Alpha', project_detail: 'D2', project_detail_title: 'Signup' },
  { project: 'P2', project_name: 'Beta', project_detail: '', project_detail_title: '' }, // detail-less → project bucket
]

const dg = groupByDetail(items)
assert.equal(dg.length, 3) // D1, D2, and P2's project-level bucket
assert.equal(dg.find((g) => g.key === 'D1').todos.length, 2) // dup detail collapses, todos accumulate

const picks = detailPickerOptions(dg)
// Project heading, then its details indented; projects alpha-sorted, details alpha-sorted.
assert.deepEqual(
  picks.map((o) => (o.header ? `#${o.label}` : o.label)),
  ['#Alpha', 'Login (2)', 'Signup (1)', '#Beta', 'Tanpa rincian (1)'],
)
const login = picks.find((o) => o.value === 'D1')
assert.equal(login.indent, true)
assert.equal(login.keywords, 'Alpha') // search-by-project still hits the detail
assert.equal(picks.find((o) => o.header).indent, undefined) // headings aren't indented rows

// --- availableDetailOptions (no duplicate columns) ---
// D1 taken elsewhere → hidden here, but this column's own D2 stays; Beta's lone
// detail is taken → its header drops (no orphan heading).
const avail = availableDetailOptions(picks, new Set(['D1', 'P2']), 'D2')
assert.deepEqual(
  avail.map((o) => (o.header ? `#${o.label}` : o.label)),
  ['#Alpha', 'Signup (1)'],
)
// Own pick always survives even if it's also (staler) in `taken`.
const ownKept = availableDetailOptions(picks, new Set(['D1']), 'D1')
assert.ok(ownKept.some((o) => o.value === 'D1'))

console.log('buildOptions.selfcheck: all assertions passed')

// --- todoHasTag / filterByTags (dashboard column tag filter) ---
const focused = new Set(['t-focus'])
const tagItems = [
  { name: 'a-untag', work_mode: '', ai_phase: 0, to_check: false },
  { name: 't-focus', work_mode: '', ai_phase: 0, to_check: false },
  { name: 'c-ai', work_mode: 'AI', ai_phase: 2, to_check: false },
  { name: 'd-check', work_mode: '', ai_phase: 0, to_check: true },
  { name: 'e-ai-check', work_mode: 'AI', ai_phase: 2, to_check: true }, // two tags at once
]
// Each predicate matches only its own tag; untagged excludes all the flags.
assert.equal(todoHasTag(tagItems[0], 'untagged', focused), true)
assert.equal(todoHasTag(tagItems[1], 'focus', focused), true)
assert.equal(todoHasTag(tagItems[1], 'untagged', focused), false) // focused ⇒ not untagged
assert.equal(todoHasTag(tagItems[2], 'ai2', focused), true)
assert.equal(todoHasTag(tagItems[2], 'ai1', focused), false) // phase tags are exclusive
assert.equal(todoHasTag(tagItems[3], 'to_check', focused), true)
// Empty state is a pass-through (no filtering).
assert.equal(filterByTags(tagItems, new Map(), focused).length, 5)
// Two 'on' tags OR together: ai2 OR to_check → c, d, and the two-tag e (once, no dup).
assert.deepEqual(
  filterByTags(tagItems, new Map([['ai2', 'on'], ['to_check', 'on']]), focused).map((t) => t.name),
  ['c-ai', 'd-check', 'e-ai-check'],
)
// Untagged 'on' surfaces only the flag-free row.
assert.deepEqual(filterByTags(tagItems, new Map([['untagged', 'on']]), focused).map((t) => t.name), ['a-untag'])
// 'off' excludes: hide ai2 → drop c and e, keep the rest.
assert.deepEqual(
  filterByTags(tagItems, new Map([['ai2', 'off']]), focused).map((t) => t.name),
  ['a-untag', 't-focus', 'd-check'],
)
// on + off combine (AND across the off constraint): require to_check, exclude ai2 → only the pure to_check row.
assert.deepEqual(
  filterByTags(tagItems, new Map([['to_check', 'on'], ['ai2', 'off']]), focused).map((t) => t.name),
  ['d-check'],
)
// All three AI phases 'on' reproduces the old single "any AI" filter.
assert.deepEqual(
  filterByTags(tagItems, new Map([['ai1', 'on'], ['ai2', 'on'], ['ai3', 'on']]), focused).map((t) => t.name),
  ['c-ai', 'e-ai-check'],
)
// cycleTag: all → on → off → all.
assert.equal(cycleTag(new Map(), 'ai2').get('ai2'), 'on')
assert.equal(cycleTag(new Map([['ai2', 'on']]), 'ai2').get('ai2'), 'off')
assert.equal(cycleTag(new Map([['ai2', 'off']]), 'ai2').has('ai2'), false)

// --- aiPhaseOf: server value wins; work_mode is the fallback for older payloads ---
assert.equal(aiPhaseOf({ work_mode: 'AI', ai_phase: 3 }), 3)
assert.equal(aiPhaseOf({ work_mode: 'AI', ai_phase: 0 }), 0) // untagged server-side ⇒ 0, not 1
assert.equal(aiPhaseOf({ work_mode: 'AI' }), 1) // no ai_phase in payload ⇒ tagged = phase 1
assert.equal(aiPhaseOf({ work_mode: 'Both' }), 1)
assert.equal(aiPhaseOf({ work_mode: 'Human' }), 0)
assert.equal(aiPhaseOf({}), 0)

// --- todoDayBucket / filterByDay / cycleDay (the "today" day-plan filter) ---
const TODAY = '2026-09-01'
const dayItems = [
  { name: 'plan-today', allocations: [{ date: '2026-08-30', minutes: 30 }, { date: TODAY, minutes: 60 }] },
  { name: 'plan-other', allocations: [{ date: '2026-09-05', minutes: 60 }] },
  { name: 'no-plan', allocations: [] },
  { name: 'no-alloc-field' }, // allocations undefined ⇒ unplanned
]
assert.equal(todoDayBucket(dayItems[0], TODAY), 'today') // any slot dated today
assert.equal(todoDayBucket(dayItems[1], TODAY), 'other') // planned, none today
assert.equal(todoDayBucket(dayItems[2], TODAY), 'unplanned') // empty slots
assert.equal(todoDayBucket(dayItems[3], TODAY), 'unplanned') // missing field
// filterByDay: undefined = pass-through; a bucket keeps only its members.
assert.equal(filterByDay(dayItems, undefined, TODAY).length, 4)
assert.deepEqual(filterByDay(dayItems, 'today', TODAY).map((t) => t.name), ['plan-today'])
assert.deepEqual(filterByDay(dayItems, 'other', TODAY).map((t) => t.name), ['plan-other'])
assert.deepEqual(filterByDay(dayItems, 'unplanned', TODAY).map((t) => t.name), ['no-plan', 'no-alloc-field'])
// cycleDay: All → Today → Not today → Unplanned → All.
assert.equal(cycleDay(undefined), 'today')
assert.equal(cycleDay('today'), 'other')
assert.equal(cycleDay('other'), 'unplanned')
assert.equal(cycleDay('unplanned'), undefined)

console.log('tagFilter.selfcheck: all assertions passed')
