// @ts-nocheck — test-only, run via esbuild (see focusMerge.selfcheck.ts pattern).
// Run: npx esbuild --bundle src/lib/googleCal.selfcheck.ts --platform=node | node
import assert from 'node:assert'
import { googleCalUrl } from './googleCal'

const base = { title: 'Sprint Sync', scheduled_at: '2026-07-22 09:00:00', estimated: 30, notes: '', participants: [] }

// 1) null when no start time
assert.equal(googleCalUrl({ ...base, scheduled_at: null }), null, 'null scheduled_at → null')
assert.equal(googleCalUrl({ ...base, scheduled_at: '' }), null, 'empty scheduled_at → null')

// 2) basic shape: TEMPLATE action + Asia/Jakarta tz
let u = new URL(googleCalUrl(base))
assert.equal(u.origin + u.pathname, 'https://calendar.google.com/calendar/render', 'render endpoint')
assert.equal(u.searchParams.get('action'), 'TEMPLATE', 'action=TEMPLATE')
assert.equal(u.searchParams.get('ctz'), 'Asia/Jakarta', 'ctz hardcoded')
assert.equal(u.searchParams.get('text'), 'Sprint Sync', 'title → text')

// 3) dates START/END, wall-clock basic format, END = START + estimated
assert.equal(u.searchParams.get('dates'), '20260722T090000/20260722T093000', '30-min end')

// 4) estimated 0/undefined → 30-min default
u = new URL(googleCalUrl({ ...base, estimated: 0 }))
assert.equal(u.searchParams.get('dates'), '20260722T090000/20260722T093000', 'estimated 0 → 30-min default')
u = new URL(googleCalUrl({ ...base, estimated: undefined }))
assert.equal(u.searchParams.get('dates'), '20260722T090000/20260722T093000', 'estimated undefined → 30-min default')

// 5) hour/day rollover via UTC math (23:50 + 30 → next day 00:20)
u = new URL(googleCalUrl({ ...base, scheduled_at: '2026-07-22 23:50:00', estimated: 30 }))
assert.equal(u.searchParams.get('dates'), '20260722T235000/20260723T002000', 'rolls into next day')

// 6) accepts ISO 'T' separator too
u = new URL(googleCalUrl({ ...base, scheduled_at: '2026-07-22T09:00:00' }))
assert.equal(u.searchParams.get('dates'), '20260722T090000/20260722T093000', 'T-separator parsed')

// 7) notes → details, omitted when empty
assert.equal(new URL(googleCalUrl(base)).searchParams.has('details'), false, 'no details when notes empty')
u = new URL(googleCalUrl({ ...base, notes: 'Bring the deck' }))
assert.equal(u.searchParams.get('details'), 'Bring the deck', 'notes → details')

// 8) participants → add (comma-joined), omitted when empty
assert.equal(new URL(googleCalUrl(base)).searchParams.has('add'), false, 'no add when no participants')
u = new URL(googleCalUrl({ ...base, participants: ['a@x.id', 'b@x.id'] }))
assert.equal(u.searchParams.get('add'), 'a@x.id,b@x.id', 'participants → add guests')

console.log('googleCal self-check OK')
