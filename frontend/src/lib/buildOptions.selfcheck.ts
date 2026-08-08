// @ts-nocheck — test-only file, run via esbuild; not part of the app bundle
import assert from 'node:assert/strict'
import { buildOptions, groupByDetail, detailPickerOptions, availableDetailOptions } from './filters'

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
