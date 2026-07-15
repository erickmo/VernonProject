// @ts-nocheck — test-only file, run via esbuild; not part of the app bundle
import assert from 'node:assert'
import { buildCsv } from './reportCsv'

const cols = [
  { label: 'Name', fieldname: 'n' },
  { label: 'Amount', fieldname: 'a', fieldtype: 'Int' },
]
const rows = [
  { n: 'Alice', a: 5 },
  { n: 'Bob, Jr', a: 10 },
  { n: 'quote"d', a: null },
]

const csv = buildCsv(cols, rows, (v) => (v == null ? '' : String(v)))
const lines = csv.split('\r\n')
assert.equal(lines[0], 'Name,Amount', 'header row')
assert.equal(lines[1], 'Alice,5', 'plain row')
assert.equal(lines[2], '"Bob, Jr",10', 'value with comma is quoted')
assert.equal(lines[3], '"quote""d",', 'interior quote doubled + null → empty')

// A newline inside a value forces quoting.
const nl = buildCsv([{ label: 'x', fieldname: 'x' }], [{ x: 'a\nb' }])
assert.equal(nl.split('\r\n')[1], '"a\nb"', 'newline quoted')

// Empty rows → header only.
assert.equal(buildCsv(cols, []), 'Name,Amount', 'no rows → header only')

console.log('reportCsv selfcheck OK')
