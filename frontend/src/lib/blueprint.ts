// "Begin with the end in mind" backward map — pure layout, no DOM.
// goal (right) <- subgoals <- actions (todos). X is driven by deadline: the
// latest deadline sits rightmost (the goal is pinned there), earlier work flows
// left, undated todos park in a left lane. Y groups each subgoal's todos into a
// horizontal band. Shared by both frontends; presentation lives in the canvas.
import type { StatusKey } from './types'

export interface BlueprintGoal {
  name: string
  project_name: string
  goal: string | null
  deadline: string | null
  status: string
}
export interface BlueprintDetail {
  name: string
  title: string
  deadline: string | null
  expected_outcome: string
  status: string
}
export interface BlueprintTodo {
  id: string
  label: string
  detail: string
  deadline: string | null
  statusKey: StatusKey
  overdue: boolean
  assignee: string | null
  blocking: string[]
}
export interface BlueprintData {
  goal: BlueprintGoal
  details: BlueprintDetail[]
  todos: BlueprintTodo[]
}

export type NodeKind = 'goal' | 'subgoal' | 'todo'
export interface LayoutNode {
  id: string
  kind: NodeKind
  x: number
  y: number
  w: number
  h: number
  goal?: BlueprintGoal
  detail?: BlueprintDetail
  todo?: BlueprintTodo
}
export interface LayoutEdge {
  id: string
  from: string
  to: string
  kind: 'hierarchy' | 'dependency'
  overdue?: boolean
}
export interface Layout {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
}

// Geometry (px). Fixed role-columns keep the board tidy (no overlap); the canvas
// pans/zooms so absolute size is free.
export const GEO = {
  PAD: 48,
  COL_GAP: 96, // horizontal gap between the todo | subgoal | goal columns
  TODO_W: 200,
  TODO_H: 60,
  SUB_W: 210,
  SUB_H: 88,
  GOAL_W: 240,
  GOAL_H: 140,
  ROW_GAP: 16, // vertical gap between stacked todos in a band
  BAND_GAP: 44, // vertical gap between subgoal bands
}

// Column X positions: todos (left) → subgoals (middle) → goal (right).
export function columnX() {
  const todo = GEO.PAD
  const sub = todo + GEO.TODO_W + GEO.COL_GAP
  const goal = sub + GEO.SUB_W + GEO.COL_GAP
  return { todo, sub, goal }
}

const cmp = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b) // nulls last

/** Compute node + edge geometry for the backward map. Deterministic.
 *  Role-columns: goal right, subgoals middle, actions left; deadline orders the
 *  actions top→bottom within each subgoal's band. */
export function layoutBlueprint(data: BlueprintData): Layout {
  const { PAD, TODO_W, TODO_H, SUB_W, SUB_H, GOAL_W, GOAL_H, ROW_GAP, BAND_GAP } = GEO
  const X = columnX()

  const byDetail = new Map<string, BlueprintTodo[]>()
  for (const t of data.todos) {
    const arr = byDetail.get(t.detail) ?? []
    arr.push(t)
    byDetail.set(t.detail, arr)
  }

  // Subgoal bands, ordered by the subgoal's deadline (undated last).
  const details = [...data.details].sort((a, b) => cmp(a.deadline, b.deadline))
  const nodes: LayoutNode[] = []
  const edges: LayoutEdge[] = []
  const nodeIds = new Set<string>()

  const rowH = TODO_H + ROW_GAP
  // Detail-scoped map (no subgoal tier): the goal IS a Project Detail, its todos
  // stack in one band and link straight to it. Otherwise the full project tree.
  const hasSub = details.length > 0
  const goalX = hasSub ? X.goal : X.sub
  let cursorY = PAD

  if (hasSub) {
    for (const d of details) {
      const items = (byDetail.get(d.name) ?? []).sort(
        (a, b) => cmp(a.deadline, b.deadline) || a.label.localeCompare(b.label),
      )
      const rows = Math.max(items.length, 1)
      const bandTop = cursorY
      const bandH = rows * TODO_H + (rows - 1) * ROW_GAP

      items.forEach((t, i) => {
        nodes.push({ id: t.id, kind: 'todo', x: X.todo, y: bandTop + i * rowH, w: TODO_W, h: TODO_H, todo: t })
        nodeIds.add(t.id)
        edges.push({ id: `h:${t.id}`, from: t.id, to: d.name, kind: 'hierarchy', overdue: t.overdue })
      })

      nodes.push({ id: d.name, kind: 'subgoal', x: X.sub, y: bandTop + bandH / 2 - SUB_H / 2, w: SUB_W, h: SUB_H, detail: d })
      nodeIds.add(d.name)
      edges.push({ id: `h:${d.name}`, from: d.name, to: data.goal.name, kind: 'hierarchy' })

      cursorY = bandTop + bandH + BAND_GAP
    }
  } else {
    const items = [...data.todos].sort((a, b) => cmp(a.deadline, b.deadline) || a.label.localeCompare(b.label))
    items.forEach((t, i) => {
      nodes.push({ id: t.id, kind: 'todo', x: X.todo, y: PAD + i * rowH, w: TODO_W, h: TODO_H, todo: t })
      nodeIds.add(t.id)
      edges.push({ id: `h:${t.id}`, from: t.id, to: data.goal.name, kind: 'hierarchy', overdue: t.overdue })
    })
    const rows = Math.max(items.length, 1)
    cursorY = PAD + rows * TODO_H + (rows - 1) * ROW_GAP + BAND_GAP
  }

  const totalH = Math.max(cursorY - BAND_GAP, PAD + GOAL_H)
  // Goal pinned right, vertically centered across all bands.
  nodes.push({ id: data.goal.name, kind: 'goal', x: goalX, y: PAD + (totalH - PAD) / 2 - GOAL_H / 2, w: GOAL_W, h: GOAL_H, goal: data.goal })
  nodeIds.add(data.goal.name)

  // Dependency edges: emitted once from the `blocking` side; skip self + unknown.
  for (const t of data.todos) {
    for (const b of t.blocking) {
      if (b === t.id || !nodeIds.has(b)) continue
      edges.push({ id: `d:${t.id}->${b}`, from: t.id, to: b, kind: 'dependency', overdue: t.overdue })
    }
  }

  return {
    nodes,
    edges,
    width: goalX + GOAL_W + PAD,
    height: totalH + PAD,
  }
}

/** Scope a project blueprint down to ONE sub-goal: that Project Detail becomes the
 *  goal (end in mind), only its todos remain, no sibling details, no project node.
 *  Cross-detail / cross-project dependency edges fall away (target not in scope). */
export function toDetailScope(data: BlueprintData, detailName: string): BlueprintData | null {
  const d = data.details.find((x) => x.name === detailName)
  if (!d) return null
  return {
    goal: { name: d.name, project_name: d.title, goal: d.expected_outcome || null, deadline: d.deadline, status: d.status },
    details: [],
    todos: data.todos.filter((t) => t.detail === detailName),
  }
}

interface DetailTodoLike {
  project_detail: string
  project_detail_title: string
  project: string
  project_name: string
}
/** Project-detail picker options derived from a todo list (e.g. the calendar).
 *  Each visible sub-goal once, labelled "Project · Sub-goal", plus a
 *  detail→project map so the picker can open the right project's map. */
export function projectDetailOptions(todos: DetailTodoLike[]) {
  const seen = new Map<string, { value: string; label: string; project: string }>()
  for (const t of todos) {
    if (!t.project_detail || seen.has(t.project_detail)) continue
    seen.set(t.project_detail, {
      value: t.project_detail,
      label: `${t.project_name} · ${t.project_detail_title || t.project_detail}`,
      project: t.project,
    })
  }
  const arr = [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  return {
    options: arr.map(({ value, label }) => ({ value, label })),
    projectOf: new Map(arr.map((a) => [a.value, a.project])),
  }
}

/** Would adding edge from→to create a direct 2-cycle or duplicate/self?
 *  (Deeper cycle detection deferred — see spec.) */
export function connectionRejected(
  from: string,
  to: string,
  todos: Pick<BlueprintTodo, 'id' | 'blocking'>[],
): 'self' | 'duplicate' | 'cycle' | null {
  if (from === to) return 'self'
  const map = new Map(todos.map((t) => [t.id, t.blocking]))
  if ((map.get(from) ?? []).includes(to)) return 'duplicate'
  if ((map.get(to) ?? []).includes(from)) return 'cycle'
  return null
}
