import {
  matchProjectItem,
  matchProject,
  matchProjectDetail,
  projectDetailsFromTodos,
  todoInScope,
  projectInScope,
  detailInScope,
} from './filters'
import type { ProjectItem, ProjectCard } from './types'

// ponytail: no @types/node in frontend/ (frontend-web has it, frontend doesn't)
// — a tiny inline assert avoids pulling in a new dependency for one file.
function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`FAILED ${label}: expected ${expected}, got ${actual}`)
}

// Minimal fixture — only the fields matchProjectItem reads matter here.
const t = {
  to_do: 'Fix login bug',
  project_name: 'Vernon Core',
  project: 'PROJ-001',
  brand: 'Vernon',
  project_detail_title: 'Auth cleanup',
  project_owner_name: 'Alice Owner',
  project_leader_name: 'Bob Leader',
  assigned_to_name: 'Charlie Assignee',
  status: 'In Progress',
} as ProjectItem

assertEqual(matchProjectItem(t, ''), true, 'empty query matches all')
assertEqual(matchProjectItem(t, '   '), true, 'whitespace-only query matches all')
assertEqual(matchProjectItem(t, 'login'), true, 'matches to_do')
assertEqual(matchProjectItem(t, 'Vernon Core'), true, 'matches project_name')
assertEqual(matchProjectItem(t, 'Charlie'), true, 'matches assigned_to_name')
assertEqual(matchProjectItem(t, 'progress'), true, 'matches status')
assertEqual(matchProjectItem(t, 'FIX LOGIN'), true, 'case-insensitive')
assertEqual(matchProjectItem(t, 'nonexistent'), false, 'non-match')

// matchProject
const p = { name: 'PROJ-001', project_name: 'Vernon Core', brand: 'Vernon', owner_name: 'Alice', leader_name: 'Bob', status: 'Active' } as ProjectCard
assertEqual(matchProject(p, ''), true, 'project empty matches all')
assertEqual(matchProject(p, 'vernon core'), true, 'project matches name')
assertEqual(matchProject(p, 'alice'), true, 'project matches owner')
assertEqual(matchProject(p, 'zzz'), false, 'project non-match')

// projectDetailsFromTodos dedupe + matchProjectDetail
const t2 = { ...t, project_detail: 'PD-001' } as ProjectItem
const t3 = { ...t, project_detail: 'PD-001' } as ProjectItem // dup id
const t4 = { ...t, project_detail: 'PD-002', project_detail_title: 'Billing rework' } as ProjectItem
const details = projectDetailsFromTodos([t2, t3, t4])
assertEqual(details.length, 2, 'details deduped by id')
assertEqual(matchProjectDetail(details[0], 'auth cleanup'), true, 'detail matches title')
assertEqual(matchProjectDetail(details[1], 'billing'), true, 'detail matches other title')
assertEqual(matchProjectDetail(details[0], 'zzz'), false, 'detail non-match')

// scope filters: ongoing / done / all
const openTodo = { ...t, status_key: 'planned' } as ProjectItem
const doneTodo = { ...t, status_key: 'completed' } as ProjectItem
const cancelledTodo = { ...t, status_key: 'cancelled' } as ProjectItem
assertEqual(todoInScope(openTodo, 'all'), true, 'todo all')
assertEqual(todoInScope(openTodo, 'ongoing'), true, 'open todo is ongoing')
assertEqual(todoInScope(openTodo, 'done'), false, 'open todo not done')
assertEqual(todoInScope(doneTodo, 'done'), true, 'completed todo is done')
assertEqual(todoInScope(doneTodo, 'ongoing'), false, 'completed todo not ongoing')
assertEqual(todoInScope(cancelledTodo, 'ongoing'), false, 'cancelled todo not ongoing')
assertEqual(todoInScope(cancelledTodo, 'done'), false, 'cancelled todo not done')

const ongoingProj = { ...p, status: 'Ongoing' } as ProjectCard
const closedProj = { ...p, status: 'Closed' } as ProjectCard
assertEqual(projectInScope(ongoingProj, 'ongoing'), true, 'ongoing project')
assertEqual(projectInScope(ongoingProj, 'done'), false, 'ongoing project not done')
assertEqual(projectInScope(closedProj, 'done'), true, 'closed project is done')

// detail open-ness aggregates across child todos
const detOpen = projectDetailsFromTodos([{ ...t, project_detail: 'PD-A', status_key: 'completed' } as ProjectItem, { ...t, project_detail: 'PD-A', status_key: 'planned' } as ProjectItem])[0]
assertEqual(detOpen.open, true, 'detail open when any child todo open')
assertEqual(detailInScope(detOpen, 'ongoing'), true, 'open detail is ongoing')
const detDone = projectDetailsFromTodos([{ ...t, project_detail: 'PD-B', status_key: 'completed' } as ProjectItem])[0]
assertEqual(detDone.open, false, 'detail done when all child todos closed')
assertEqual(detailInScope(detDone, 'done'), true, 'closed detail is done')

console.log('filters matchers ok')
