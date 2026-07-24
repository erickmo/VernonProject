import assert from 'node:assert/strict'
import { resolveGlobalKey, isEditableTarget, SHORTCUTS } from './shortcuts'

// bare keys
assert.deepEqual(resolveGlobalKey(false, '?'), { kind: 'help' })
assert.deepEqual(resolveGlobalKey(false, '/'), { kind: 'palette' })
assert.deepEqual(resolveGlobalKey(false, 'c'), { kind: 'quick' })
assert.deepEqual(resolveGlobalKey(false, 'n'), { kind: 'task' })
assert.deepEqual(resolveGlobalKey(false, 'g'), { kind: 'startG' })
assert.equal(resolveGlobalKey(false, 'x'), null)

// g-prefix sequences
assert.deepEqual(resolveGlobalKey(true, 'h'), { kind: 'nav', to: '/' })
assert.deepEqual(resolveGlobalKey(true, 'p'), { kind: 'nav', to: '/projects' })
assert.deepEqual(resolveGlobalKey(true, 'r'), { kind: 'nav', to: '/review' })
assert.deepEqual(resolveGlobalKey(true, 'n'), { kind: 'nav', to: '/notes' })   // g n = notes, not new-task
assert.deepEqual(resolveGlobalKey(true, 'c'), { kind: 'nav', to: '/calendar' })// g c = calendar, not quick-create
assert.equal(resolveGlobalKey(true, 'z'), null)                                 // unknown second key

// editable guard
assert.equal(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget), true)
assert.equal(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget), true)
assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget), true)
assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: false } as unknown as EventTarget), false)
assert.equal(isEditableTarget(null), false)

// display list is non-empty and every row has keys + label
assert.ok(SHORTCUTS.length >= 2)
for (const g of SHORTCUTS) for (const r of g.rows) { assert.ok(r.keys); assert.ok(r.label) }

console.log('shortcuts.selfcheck: all assertions passed')
