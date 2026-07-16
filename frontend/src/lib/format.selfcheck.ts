// @ts-nocheck — test-only file, run via esbuild; not part of the app bundle
import assert from 'node:assert/strict'
import { dateSub, formatDate } from './format'

// No date → no sub-line at all (the tile falls back to "—" in its value).
assert.equal(dateSub(null), undefined)
assert.equal(dateSub(undefined), undefined)
assert.equal(dateSub(''), undefined)
// A flag without a date still yields nothing — the date is what the sub-line is for.
assert.equal(dateSub(null, 'Overdue'), undefined)

// Defers to formatDate for the date itself, which is locale-formatted — don't pin a literal here.
assert.equal(dateSub('2026-07-15'), formatDate('2026-07-15'))
// Flag rides in front of the date.
assert.equal(dateSub('2026-07-12', 'Overdue'), `Overdue · ${formatDate('2026-07-12')}`)
// A falsy flag (`data.is_overdue && 'Overdue'` when not overdue) is dropped, not printed.
assert.equal(dateSub('2026-07-15', false), formatDate('2026-07-15'))
assert.equal(dateSub('2026-07-15', null), formatDate('2026-07-15'))
// TZ-safe: a date-only ISO must not shift back a day west of UTC.
assert.match(dateSub('2026-07-15')!, /15/)

console.log('format.selfcheck: all assertions passed')
