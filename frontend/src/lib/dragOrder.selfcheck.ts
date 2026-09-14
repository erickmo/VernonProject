import assert from 'node:assert/strict'
import { dropIndex, DRAG_THRESHOLD_PX } from './dragOrder'

// Three 60px rows at y=0,60,120 → midpoints 30, 90, 150.
const mids = [30, 90, 150]

// Dragging DOWN: past the next row's midpoint means swap with THAT row — not a
// jump past it. This is the bug that made the focus list unusable: one nudge
// down sent the row to the bottom.
assert.equal(dropIndex(mids, 95, 0), 1, 'row 0 nudged past row 1 lands at 1, not 2')
assert.equal(dropIndex(mids, 155, 0), 2, 'row 0 dragged below every midpoint lands last')
assert.equal(dropIndex(mids, 95, 1), 1, 'row 1 still inside its own band does not move')
assert.equal(dropIndex(mids, 155, 1), 2, 'row 1 dragged to the bottom lands last')

// Dragging UP: unchanged — this direction always worked.
assert.equal(dropIndex(mids, 25, 2), 0, 'row 2 dragged above row 0 lands first')
assert.equal(dropIndex(mids, 85, 2), 1, 'row 2 dragged above row 1 lands at 1')
assert.equal(dropIndex(mids, 25, 1), 0, 'row 1 dragged to the top lands first')

// Two rows — the shape the bug was reported on.
assert.equal(dropIndex([30, 90], 95, 0), 1, 'two rows: top dragged down swaps')
assert.equal(dropIndex([30, 90], 25, 1), 0, 'two rows: bottom dragged up swaps')

// A press that never really moves must stay a tap.
assert.ok(DRAG_THRESHOLD_PX > 0, 'a tap needs a slack window or every tap is a drag')

console.log('dragOrder self-check OK')
