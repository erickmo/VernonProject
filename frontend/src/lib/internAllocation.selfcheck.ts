import { strict as assert } from 'node:assert'
import {
  cellBand, dayLabel, EMPTY_INTERN_FILTERS, filterInternRows, internFilterOptions,
  internHelp, INTERN_HELP, isWeekend, lastDays, REVIEW_WAIT_DAYS, STALE_ASSIGNMENT_DAYS,
} from './internAllocation'
import type { InternAllocationRow } from './types'

const row = (over: Partial<InternAllocationRow>): InternAllocationRow => ({
  user: 'budi@x.id', full_name: 'Budi', sources: ['member_type'],
  per_day_assigned: {}, per_day_planned: {}, assigned_total: 0, planned_total: 0,
  flagged_dates: [], zero_days: 0, last_assigned_on: null, stale_days: 0,
  awaiting_review: 0, oldest_wait_days: 0, assigned_count: 0, done: 0, late: 0,
  notes_count: 0, last_note_on: null, projects: [], leaders: [],
  attention: false, reasons: [], ...over,
})

const budi = row({
  leaders: [{ leader: 'sinta@x.id', leader_name: 'Sinta' }],
  projects: [{ project: 'P1', project_name: 'Website', leader: 'sinta@x.id', leader_name: 'Sinta', todos: 2, minutes: 90, waiting: 1 }],
})
const ayu = row({
  user: 'ayu@x.id', full_name: 'Ayu', sources: ['profile'], attention: true, reasons: ['stale'],
  leaders: [{ leader: 'rendi@x.id', leader_name: 'Rendi' }],
  projects: [{ project: 'P2', project_name: 'App', leader: 'rendi@x.id', leader_name: 'Rendi', todos: 1, minutes: 60, waiting: 0 }],
})
const rows = [budi, ayu]
const f = (over: Partial<typeof EMPTY_INTERN_FILTERS>) => ({ ...EMPTY_INTERN_FILTERS, ...over })
const names = (rs: InternAllocationRow[]) => rs.map((r) => r.user)

// no filters -> everything
assert.deepEqual(names(filterInternRows(rows, EMPTY_INTERN_FILTERS)), ['budi@x.id', 'ayu@x.id'])
// attention only
assert.deepEqual(names(filterInternRows(rows, f({ attentionOnly: true }))), ['ayu@x.id'])
// by source marking
assert.deepEqual(names(filterInternRows(rows, f({ source: 'profile' }))), ['ayu@x.id'])
assert.deepEqual(names(filterInternRows(rows, f({ source: 'member_type' }))), ['budi@x.id'])
// by leader / project
assert.deepEqual(names(filterInternRows(rows, f({ leader: 'sinta@x.id' }))), ['budi@x.id'])
assert.deepEqual(names(filterInternRows(rows, f({ project: 'P2' }))), ['ayu@x.id'])
// search matches name or email, case-insensitively
assert.deepEqual(names(filterInternRows(rows, f({ q: '  AYU ' }))), ['ayu@x.id'])
assert.deepEqual(names(filterInternRows(rows, f({ q: 'budi@x' }))), ['budi@x.id'])
assert.deepEqual(names(filterInternRows(rows, f({ q: 'nobody' }))), [])
// filters compose (leader AND source that disagree -> nothing)
assert.deepEqual(names(filterInternRows(rows, f({ leader: 'sinta@x.id', source: 'profile' }))), [])

// options are derived from the rows, deduped and label-sorted
const opts = internFilterOptions(rows)
assert.deepEqual(opts.leaders, [{ value: 'rendi@x.id', label: 'Rendi' }, { value: 'sinta@x.id', label: 'Sinta' }])
assert.deepEqual(opts.projects, [{ value: 'P2', label: 'App' }, { value: 'P1', label: 'Website' }])
assert.deepEqual(internFilterOptions([]), { leaders: [], projects: [] })

// heat bands — threshold 0 (this site's current setting) must not invent a "thin" band
assert.equal(cellBand(0, 180), 'empty')
assert.equal(cellBand(120, 180), 'thin')
assert.equal(cellBand(180, 180), 'ok')
assert.equal(cellBand(240, 0), 'ok')
assert.equal(cellBand(0, 0), 'empty')

// 2026-08-22 is a Saturday, 23 Sunday, 21 Friday
assert.equal(isWeekend('2026-08-22'), true)
assert.equal(isWeekend('2026-08-23'), true)
assert.equal(isWeekend('2026-08-21'), false)

// labels + range
assert.ok(dayLabel('2026-08-19').length > 0)
const [from, to] = lastDays(14)
assert.equal(from < to, true)
assert.equal(Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000), 13)

// help copy: every term unique, non-empty, and both thresholds quoted from one place
assert.equal(new Set(INTERN_HELP.map((h) => h.term)).size, INTERN_HELP.length)
assert.ok(INTERN_HELP.every((h) => h.title && h.body))
assert.ok(internHelp('stale')!.body.includes(String(STALE_ASSIGNMENT_DAYS)))
assert.ok(internHelp('waiting')!.body.includes(String(REVIEW_WAIT_DAYS)))
assert.equal(internHelp('nope'), undefined)

console.log('intern allocation self-check OK')

// --- period range helpers -----------------------------------------------------
import { MAX_RANGE_DAYS, addDaysISO, rangeBounds, spanDays } from './internAllocation'

// inclusive span, both ends counted
assert.equal(spanDays('2026-08-17', '2026-08-17'), 1)
assert.equal(spanDays('2026-08-17', '2026-08-23'), 7)
// reversed or junk is not a range
assert.equal(spanDays('2026-08-23', '2026-08-17'), 0)
assert.equal(spanDays('', '2026-08-17'), 0)

// calendar arithmetic must cross month and year ends without UTC drift
assert.equal(addDaysISO('2026-08-31', 1), '2026-09-01')
assert.equal(addDaysISO('2026-09-01', -1), '2026-08-31')
assert.equal(addDaysISO('2026-12-31', 1), '2027-01-01')
assert.equal(addDaysISO('2026-01-01', -1), '2025-12-31')
assert.equal(addDaysISO('2026-08-17', 0), '2026-08-17')

// bounds keep every reachable pick inside what the endpoint accepts
const b = rangeBounds('2026-08-01', '2026-08-14')
assert.equal(b.toMin, '2026-08-01')            // "to" can never precede "from"
assert.equal(b.fromMax, '2026-08-14')          // "from" can never follow "to"
assert.equal(spanDays('2026-08-01', b.toMax!), MAX_RANGE_DAYS)   // widest allowed pick
assert.equal(spanDays(b.fromMin!, '2026-08-14'), MAX_RANGE_DAYS)
// an empty end leaves that side unbounded rather than guessing
assert.equal(rangeBounds('', '2026-08-14').toMin, undefined)
assert.equal(rangeBounds('2026-08-01', '').fromMax, undefined)

console.log('period range self-check OK')
