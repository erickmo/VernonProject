// @ts-nocheck — test-only file, run via esbuild; not part of the app bundle
import assert from 'node:assert'
import { numAlign, isSummable, formatReportNumber, columnTotals } from './reportFormat'

// numAlign
assert.equal(numAlign('Currency'), true, 'currency right-aligns')
assert.equal(numAlign('Int'), true, 'int right-aligns')
assert.equal(numAlign('Data'), false, 'text left-aligns')
assert.equal(numAlign('Date'), false, 'date left-aligns')

// isSummable — money/count only, not percent/rating
assert.equal(isSummable('Currency'), true, 'currency sums')
assert.equal(isSummable('Float'), true, 'float sums')
assert.equal(isSummable('Percent'), false, 'percent not summed')
assert.equal(isSummable('Rating'), false, 'rating not summed')

// formatReportNumber — assertions kept locale-agnostic (ICU may be absent under node)
assert.equal(formatReportNumber(5, 'Int'), '5', 'small int unchanged')
assert.ok(formatReportNumber(50, 'Percent').endsWith('%'), 'percent suffixed')

// columnTotals
const cols = [
  { fieldname: 'name', fieldtype: 'Data' },
  { fieldname: 'amt', fieldtype: 'Currency' },
  { fieldname: 'pct', fieldtype: 'Percent' },
]
const rows = [
  { name: 'a', amt: 10, pct: 50 },
  { name: 'b', amt: 5, pct: 25 },
  { name: 'c', amt: '', pct: 0 }, // empty amt skipped
  { name: 'd', amt: null, pct: 0 }, // null amt skipped
]
const t = columnTotals(cols, rows)
assert.equal(t.amt, 15, 'currency summed, empties skipped')
assert.ok(!('pct' in t), 'percent column not totalled')
assert.ok(!('name' in t), 'text column not totalled')
assert.deepEqual(columnTotals(cols, []), {}, 'no rows → no totals')

console.log('reportFormat selfcheck OK')
