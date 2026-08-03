import { strict as assert } from 'node:assert'
import { presenceOf } from './presence'

// null -> never
assert.equal(presenceOf(null, 15).label, 'Never signed in')
assert.equal(presenceOf(null, 15).online, false)

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`

// within window -> online (2 min ago, 15-min window)
const twoMinAgo = new Date(Date.now() - 2 * 60_000)
assert.equal(presenceOf(fmt(twoMinAgo), 15).online, true)

// outside window -> offline + relative label
const ninetyMinAgo = new Date(Date.now() - 90 * 60_000)
const p = presenceOf(fmt(ninetyMinAgo), 15)
assert.equal(p.online, false)
assert.equal(p.label, 'last seen 1h ago')

// window <= 0 falls back to 15
assert.equal(presenceOf(fmt(twoMinAgo), 0).online, true)

console.log('presence self-check OK')
