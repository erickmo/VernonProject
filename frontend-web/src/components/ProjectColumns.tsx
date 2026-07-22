import { type ReactNode } from 'react'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { ProjectItem } from '@/lib/types'

// Bucket todos by project, preserving first-seen order (so groups follow the
// list's existing sort). Feeds the by-project columns.
export type ProjectGroup = { key: string; name: string; todos: ProjectItem[] }
export function groupByProject(todos: ProjectItem[]): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>()
  for (const t of todos) {
    const key = t.project || t.project_name || '—'
    let g = map.get(key)
    if (!g) {
      g = { key, name: t.project_name || t.project || '—', todos: [] }
      map.set(key, g)
    }
    g.todos.push(t)
  }
  return [...map.values()]
}

// One by-project column: a project picker + that project's todos rendered via
// `renderCard`. No matching group → placeholder, unless `fallbackTodos` is given
// (col 1) in which case it shows the full list (any) — covers both an empty pick
// and a stale persisted pick whose project has left the list; the picker narrows.
function ProjectPickCol({
  pick, setPick, options, group, renderCard, className, fallbackTodos,
}: {
  pick: string
  setPick: (v: string) => void
  options: { value: string; label: string }[]
  group?: ProjectGroup
  renderCard: (t: ProjectItem, i: number) => ReactNode
  className?: string
  fallbackTodos?: ProjectItem[]
}) {
  const todos = group ? group.todos : fallbackTodos
  return (
    <div className={`min-w-0 space-y-3${className ? ` ${className}` : ''}`}>
      <SearchableSelect value={pick} onChange={setPick} options={options} allowClear placeholder={fallbackTodos ? 'All projects' : 'Pick a project'} />
      {todos ? (
        <div className="flex flex-col gap-2.5">{todos.map(renderCard)}</div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          Pick a project to see its todos
        </div>
      )}
    </div>
  )
}

// By-project layout: column 1 = the flat list (all items in `items`), the rest
// = a separate project each (picked via SearchableSelect) so you can focus one
// project at a time — the "choose which project first" concept. 3 columns at lg,
// a 4th picked-project column appears at xl. `renderCard` controls how a single
// todo renders (plain card, checkbox row, …).
export function ThreeColProjectList({
  items, renderCard, proj1, setProj1, proj2, setProj2, proj3, setProj3, proj4, setProj4,
}: {
  items: ProjectItem[]
  renderCard: (t: ProjectItem, i: number) => ReactNode
  proj1: string; setProj1: (v: string) => void
  proj2: string; setProj2: (v: string) => void
  proj3: string; setProj3: (v: string) => void
  proj4: string; setProj4: (v: string) => void
}) {
  const groups = groupByProject(items)
  const options = groups.map((g) => ({ value: g.key, label: `${g.name} (${g.todos.length})` }))
  const colFor = (pick: string) => groups.find((g) => g.key === pick)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {/* Column 1 — full list by default; picker narrows it to one project */}
      <ProjectPickCol pick={proj1} setPick={setProj1} options={options} group={colFor(proj1)} renderCard={renderCard} fallbackTodos={items} />
      {/* Remaining columns — each a separate project you pick; 4th only at xl */}
      <ProjectPickCol pick={proj2} setPick={setProj2} options={options} group={colFor(proj2)} renderCard={renderCard} />
      <ProjectPickCol pick={proj3} setPick={setProj3} options={options} group={colFor(proj3)} renderCard={renderCard} />
      <ProjectPickCol pick={proj4} setPick={setProj4} options={options} group={colFor(proj4)} renderCard={renderCard} className="hidden xl:block" />
    </div>
  )
}
