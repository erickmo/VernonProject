import { clampDragY, shouldDismissSheet } from './sheetDrag'
import assert from 'node:assert/strict'

// upward drag (negative delta) never lifts the sheet above its resting position
assert.equal(clampDragY(-40), 0)
assert.equal(clampDragY(0), 0)
assert.equal(clampDragY(60), 60)

// dismiss threshold: strictly past the default 100px, not at it
assert.equal(shouldDismissSheet(0), false)
assert.equal(shouldDismissSheet(99), false)
assert.equal(shouldDismissSheet(100), false)
assert.equal(shouldDismissSheet(101), true)
assert.equal(shouldDismissSheet(30, 20), true)

console.log('sheetDrag.selfcheck: all assertions passed')
