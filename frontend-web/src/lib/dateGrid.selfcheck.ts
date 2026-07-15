// @ts-nocheck — test-only file, run via esbuild; not part of the app bundle
import assert from 'node:assert'
import {
  parseISO, fmtISO, monthGrid, stepMonth, inRange, splitDT, joinDT, monthLabel, WEEKDAYS,
} from './dateGrid'

// parse: pure string split, no Date → identical in every timezone
assert.deepEqual(parseISO('2026-07-14'), { y: 2026, m: 7, d: 14 }, 'parse basic')
assert.deepEqual(parseISO('2026-07-14T09:30'), { y: 2026, m: 7, d: 14 }, 'parse ignores time')
assert.equal(parseISO('nope'), null, 'parse bad → null')

// round-trip
const p = parseISO('2026-12-01')
assert.equal(fmtISO(p.y, p.m, p.d), '2026-12-01', 'fmt round-trip pads')
assert.equal(fmtISO(2026, 3, 5), '2026-03-05', 'fmt pads month+day')

// monthGrid dims + membership (July 2026 has 31 days)
const g = monthGrid(2026, 7)
assert.equal(g.length, 6, '6 weeks')
assert.ok(g.every((w) => w.length === 7), '7 days each')
const flat = g.flat()
assert.equal(flat.length, 42, '42 cells')
assert.equal(flat.filter((c) => c.inMonth).length, 31, 'July 2026 = 31 in-month days')
const cell14 = flat.find((c) => c.iso === '2026-07-14')
assert.ok(cell14 && cell14.inMonth && cell14.day === 14, '14th present, in month')
// first cell is a Sunday; the 1st sits at its correct weekday slot
const firstOfMonth = flat.findIndex((c) => c.iso === '2026-07-01')
assert.equal(firstOfMonth, new Date(2026, 6, 1).getDay(), '1st at its weekday column')
// leading days spill from previous month
assert.equal(flat[0].inMonth, firstOfMonth === 0, 'leading cell out-of-month unless 1st is Sunday')

// stepMonth wraps year boundaries
assert.deepEqual(stepMonth(2026, 12, 1), { y: 2027, m: 1 }, 'Dec +1 → next Jan')
assert.deepEqual(stepMonth(2026, 1, -1), { y: 2025, m: 12 }, 'Jan -1 → prev Dec')
assert.deepEqual(stepMonth(2026, 6, 8), { y: 2027, m: 2 }, '+8 months wraps')

// inRange (lexical == chronological for YYYY-MM-DD)
assert.equal(inRange('2026-07-14', '2026-07-10', '2026-07-20'), true, 'inside')
assert.equal(inRange('2026-07-01', '2026-07-10'), false, 'below min')
assert.equal(inRange('2026-07-30', undefined, '2026-07-20'), false, 'above max')
assert.equal(inRange('2026-07-14'), true, 'no bounds → always in')

// datetime split/join
assert.deepEqual(splitDT('2026-07-14T09:30'), { date: '2026-07-14', time: '09:30' }, 'split')
assert.deepEqual(splitDT(''), { date: '', time: '' }, 'split empty')
assert.deepEqual(splitDT('2026-07-14T09:30:00'), { date: '2026-07-14', time: '09:30' }, 'split drops seconds')
assert.equal(joinDT('2026-07-14', '09:30'), '2026-07-14T09:30', 'join')
assert.equal(joinDT('2026-07-14', ''), '2026-07-14T00:00', 'join defaults midnight')
assert.equal(joinDT('', '09:30'), '', 'join no date → empty')

// labels
assert.equal(monthLabel(2026, 7), 'July 2026', 'month label')
assert.equal(WEEKDAYS.length, 7, '7 weekday labels')

console.log('dateGrid.selfcheck: all assertions passed')
