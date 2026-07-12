import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FolderKanban, CheckSquare, User, CornerDownLeft, ListTree } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useModalA11y } from '@web/lib/useModalA11y'
import { useProjects, useCalendar, useFormOptions } from '@/hooks/useData'
import { matchCommand } from '@web/lib/match'
import { projectDetailsFromTodos, todoInScope, projectInScope, detailInScope } from '@/lib/filters'
import type { SearchScope } from '@/lib/filters'
import { Segmented } from '@/components/ui'

export type Command = {
  id: string
  label: string
  group: string
  icon: LucideIcon
  to: string
  haystack?: string
  meta?: string
}

/**
 * ⌘K command palette: jump to any page (passed in via navCommands) or project
 * (fetched here). Mounted only while open — useModalA11y handles Esc, focus
 * trap, scroll-lock and focus restore; arrow keys move the highlight, Enter
 * navigates. v1 scope is pages + projects only.
 */
export function CommandPalette({
  onClose,
  navCommands,
}: {
  onClose: () => void
  navCommands: Command[]
}) {
  const navigate = useNavigate()
  const projects = useProjects()
  const calendar = useCalendar()
  const formOpts = useFormOptions()
  const ref = useModalA11y(true, onClose)
  const listRef = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [scope, setScope] = useState<SearchScope>('all')

  const commands = useMemo<Command[]>(() => {
    const proj: Command[] = (projects.data ?? [])
      .filter((p) => projectInScope(p, scope))
      .map((p) => ({
        id: `project:${p.name}`,
        label: p.project_name || p.name,
        group: 'Projects',
        icon: FolderKanban,
        to: `/project/${p.name}`,
      }))
    const details: Command[] = projectDetailsFromTodos(calendar.data?.todos ?? [])
      .filter((d) => detailInScope(d, scope))
      .map((d) => ({
        id: `detail:${d.name}`,
        label: d.title,
        group: d.project_name,
        icon: ListTree,
        to: `/project-detail/${d.name}`,
        haystack: [d.title, d.project_name, d.brand].filter(Boolean).join(' '),
      }))
    const todos: Command[] = (calendar.data?.todos ?? [])
      .filter((t) => todoInScope(t, scope))
      .map((t) => ({
        id: `todo:${t.name}`, label: t.to_do, group: t.project_name, icon: CheckSquare,
        to: `/project-item/${t.name}`,
        haystack: [
          t.to_do, t.project_name, t.project, t.brand, t.project_detail_title,
          t.project_owner_name, t.project_leader_name, t.assigned_to_name, t.status,
        ].filter(Boolean).join(' '),
        meta: [t.status, t.assigned_to_name].filter(Boolean).join(' · '),
      }))
    const people: Command[] = (formOpts.data?.users ?? []).map((u) => ({
      id: `user:${u.value}`, label: u.label, group: 'People', icon: User, to: `/users/${u.value}`,
    }))
    if (scope === 'all') return [...navCommands, ...proj, ...details, ...todos, ...people]
    return [...proj, ...details, ...todos]
  }, [navCommands, projects.data, calendar.data, formOpts.data, scope])

  const trimmed = q.trim()

  // Cap the rendered set: `commands` is the full projects+todos+users union,
  // which can be thousands of DOM nodes. 50 is more than fits the viewport;
  // type to narrow past it. Empty query shows a static hint instead (below),
  // so no need to match/render anything until the user types.
  const matched = useMemo(
    () => (trimmed ? commands.filter((c) => matchCommand(c.label, c.group, q, c.haystack)) : []),
    [q, trimmed, commands],
  )
  const filtered = useMemo(() => matched.slice(0, 50), [matched])
  const capped = matched.length > 50

  // Keep the highlight in range as the filter narrows, and scroll it into view.
  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = (c?: Command) => {
    const target = c ?? filtered[active]
    if (!target) return
    onClose()
    navigate(target.to)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go()
    }
    // Escape is handled by useModalA11y.
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
        className="absolute left-1/2 top-20 sm:top-24 -translate-x-1/2 w-[min(92vw,640px)] overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 px-4 border-b border-line">
          <Search className="w-4 h-4 text-muted shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, projects, todos, people…"
            aria-label="Search pages, projects, todos, people"
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-activedescendant={filtered[active] ? `cmd-opt-${active}` : undefined}
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted"
          />
          <kbd className="hidden sm:block rounded border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted">
            esc
          </kbd>
        </div>
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <Segmented<SearchScope>
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'All' },
              { value: 'ongoing', label: 'Ongoing' },
              { value: 'done', label: 'Done' },
            ]}
          />
        </div>
        <div aria-live="polite" className="sr-only">
          {trimmed
            ? `${matched.length} result${matched.length === 1 ? '' : 's'}`
            : ''}
        </div>
        <div ref={listRef} id="command-palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto py-2">
          {!trimmed ? (
            <div className="px-4 py-10 text-center text-sm text-muted">
              Type to search to-dos, projects, people
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">No matches</div>
          ) : (
            filtered.map((c, i) => {
              const Icon = c.icon
              return (
                <button
                  key={c.id}
                  id={`cmd-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active}
                  onClick={() => go(c)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                    i === active
                      ? 'bg-brand-50 dark:bg-brand-600/15 text-brand-700 dark:text-brand-200'
                      : 'text-ink'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-muted" />
                  <span className="flex-1 truncate">{c.label}</span>
                  {i === active ? (
                    <CornerDownLeft className="w-3.5 h-3.5 text-muted" />
                  ) : (
                    <span className="text-[11px] text-muted truncate max-w-[40%]">
                      {[c.group, c.meta].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
        {capped && (
          <div className="border-t border-line px-4 py-2 text-center text-[11px] text-muted">
            Showing first 50 of {matched.length}
          </div>
        )}
      </div>
    </div>
  )
}
