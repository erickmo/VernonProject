import { patchTodoInCache } from './patchTodoCache'

function assert(cond: boolean, label: string) {
  if (!cond) throw new Error('FAIL: ' + label)
}

const patch = { status_key: 'done', next_status_label: 'Approve (Leader)', can_advance: true }

// single detail object
const single = { name: 'T1', status_key: 'planned', to_do: 'x' }
const s2 = patchTodoInCache(single, 'T1', patch) as Record<string, unknown>
assert(s2.status_key === 'done' && s2.can_advance === true, 'single patched')
assert(s2 !== single, 'single new ref')

// bare array — only the match changes, non-match keeps identity
const arr = [{ name: 'T1', status_key: 'planned' }, { name: 'T2', status_key: 'planned' }]
const a2 = patchTodoInCache(arr, 'T1', patch) as Array<Record<string, unknown>>
assert(a2[0].status_key === 'done', 'array match patched')
assert(a2[1] === arr[1], 'array non-match same ref')

// nested project→detail→todos
const nested = { projects: [{ name: 'P', details: [{ name: 'PD', todos: [{ name: 'T2', status_key: 'planned' }] }] }] }
const n2 = patchTodoInCache(nested, 'T2', patch) as typeof nested
assert(n2.projects[0].details[0].todos[0].status_key === 'done', 'nested patched')
assert(n2 !== nested && n2.projects[0].details[0].todos[0].status_key === 'done', 'nested new ref on path')

// no match anywhere → identical reference back (no needless re-render)
const same = patchTodoInCache(arr, 'MISSING', patch)
assert(same === arr, 'no-match returns same ref')

// object with matching name but NOT a todo (no status_key) is left alone
const notTodo = { name: 'T1', title: 'a project' }
assert(patchTodoInCache(notTodo, 'T1', patch) === notTodo, 'non-todo name match ignored')

console.log('patchTodoCache ok')
