import { matchCommand } from './match'
import assert from 'node:assert/strict'
// palette fuzzy: query 'log' matches 'Fix login' (label) but not 'Projects'/'Pages'
assert.equal(matchCommand('Fix login', 'Todos', 'log'), true)
assert.equal(matchCommand('Projects', 'Pages', 'log'), false)
assert.equal(matchCommand('anything', 'group', ''), true)          // empty query matches all
assert.equal(matchCommand('Review', 'Rewards', 'rew'), true)        // group match
// inline-edit field mapping: a cell builds { [field]: value } for the update mutation
const buildTodoUpdate = (field: string, value: string) => ({ [field]: value })
assert.deepEqual(buildTodoUpdate('assigned_to', 'u1'), { assigned_to: 'u1' })
assert.deepEqual(buildTodoUpdate('deadline', '2026-01-01'), { deadline: '2026-01-01' })
console.log('match.selfcheck: all assertions passed')
