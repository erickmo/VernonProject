import { layoutBlueprint, connectionRejected, toDetailScope, GEO, type BlueprintData } from './blueprint'

function assert(cond: boolean, label: string) {
  if (!cond) throw new Error('FAIL: ' + label)
}

const data: BlueprintData = {
  goal: { name: 'PRJ', project_name: 'P', goal: 'g', deadline: '2026-12-31', status: 'Ongoing' },
  details: [
    { name: 'D1', title: 'Sub 1', deadline: '2026-06-01', expected_outcome: '', status: 'Ongoing' },
    { name: 'D2', title: 'Sub 2', deadline: null, expected_outcome: '', status: 'Pending' },
  ],
  todos: [
    { id: 'T1', label: 'a', detail: 'D1', deadline: '2026-03-01', statusKey: 'planned', overdue: false, assignee: null, blocking: ['T2'] },
    { id: 'T2', label: 'b', detail: 'D1', deadline: '2026-05-01', statusKey: 'planned', overdue: false, assignee: null, blocking: [] },
    { id: 'T3', label: 'c', detail: 'D2', deadline: null, statusKey: 'planned', overdue: false, assignee: null, blocking: ['T99'] },
  ],
}

const L = layoutBlueprint(data)
const node = (id: string) => L.nodes.find((n) => n.id === id)!

// Role-columns: all todos share the left column; subgoal middle; goal right.
assert(node('T1').x === GEO.PAD && node('T2').x === GEO.PAD && node('T3').x === GEO.PAD, 'todos in left column')
assert(node('T1').x < node('D1').x && node('D1').x < node('PRJ').x, 'todo < subgoal < goal (columns L→R)')
// Goal is always rightmost.
const maxX = Math.max(...L.nodes.filter((n) => n.kind !== 'goal').map((n) => n.x))
assert(node('PRJ').x > maxX, 'goal pinned rightmost')

// Deadline orders todos vertically within a band: earlier (T1) above later (T2).
assert(node('T1').y < node('T2').y, 'earlier deadline → higher in band')
assert(node('T2').y - node('T1').y === GEO.TODO_H + GEO.ROW_GAP, 'todos stack one row apart')

// Hierarchy: every todo → its detail, every detail → goal.
assert(L.edges.some((e) => e.kind === 'hierarchy' && e.from === 'T1' && e.to === 'D1'), 'todo→detail edge')
assert(L.edges.some((e) => e.kind === 'hierarchy' && e.from === 'D1' && e.to === 'PRJ'), 'detail→goal edge')

// Dependency: T1→T2 kept; T3→T99 dropped (unknown target); no self-edge.
const deps = L.edges.filter((e) => e.kind === 'dependency')
assert(deps.length === 1 && deps[0].from === 'T1' && deps[0].to === 'T2', 'one valid dependency edge')
assert(!deps.some((e) => e.from === e.to), 'no self dependency edge')

// Connection guard.
assert(connectionRejected('T1', 'T1', data.todos) === 'self', 'reject self')
assert(connectionRejected('T1', 'T2', data.todos) === 'duplicate', 'reject duplicate (T1 already blocks T2)')
assert(connectionRejected('T2', 'T1', data.todos) === 'cycle', 'reject 2-cycle')
assert(connectionRejected('T2', 'T3', data.todos) === null, 'allow fresh edge')

// Detail scope: the picked sub-goal becomes the goal; only its todos; no siblings.
const scoped = toDetailScope(data, 'D1')!
assert(scoped.goal.name === 'D1', 'picked detail becomes the goal')
assert(scoped.details.length === 0, 'no subgoal tier in detail scope')
assert(scoped.todos.length === 2 && scoped.todos.every((t) => t.detail === 'D1'), 'only D1 todos (T3 in D2 dropped)')
const LS = layoutBlueprint(scoped)
const sn = (id: string) => LS.nodes.find((n) => n.id === id)!
assert(!LS.nodes.some((n) => n.kind === 'subgoal'), 'no subgoal nodes in detail scope')
assert(sn('D1').kind === 'goal', 'D1 rendered as the goal node')
assert(sn('T1').x < sn('D1').x, 'todos left of the detail-goal')
assert(LS.edges.some((e) => e.kind === 'hierarchy' && e.from === 'T1' && e.to === 'D1'), 'todo links straight to detail-goal')
const deps2 = LS.edges.filter((e) => e.kind === 'dependency')
assert(deps2.length === 1 && deps2[0].from === 'T1' && deps2[0].to === 'T2', 'intra-detail dependency kept')

console.log('blueprint.selfcheck: all assertions passed')
