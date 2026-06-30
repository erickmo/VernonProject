import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FolderKanban, CheckSquare, User, CornerDownLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useModalA11y } from '@web/lib/useModalA11y'
import { useProjects, useCalendar, useFormOptions } from '@/hooks/useData'

export type Command = {
  id: string
  label: string
  group: string
  icon: LucideIcon
  to: string
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

  const commands = useMemo<Command[]>(() => {
    const proj: Command[] = (projects.data ?? []).map((p) => ({
      id: `project:${p.name}`,
      label: p.project_name || p.name,
      group: 'Projects',
      icon: FolderKanban,
      to: `/project/${p.name}`,
    }))
    const todos: Command[] = (calendar.data?.todos ?? []).map((t) => ({
      id: `todo:${t.name}`, label: t.to_do, group: 'Todos', icon: CheckSquare,
      to: `/project-item/${t.name}`,
    }))
    const people: Command[] = (formOpts.data?.users ?? []).map((u) => ({
      id: `user:${u.value}`, label: u.label, group: 'People', icon: User, to: `/users/${u.value}`,
    }))
    return [...navCommands, ...proj, ...todos, ...people]
  }, [navCommands, projects.data, calendar.data, formOpts.data])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return commands
    return commands.filter(
      (c) => c.label.toLowerCase().includes(s) || c.group.toLowerCase().includes(s),
    )
  }, [q, commands])

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
        className="absolute left-1/2 top-20 sm:top-24 -translate-x-1/2 w-[min(92vw,640px)] overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl"
      >
        <div className="flex items-center gap-2 px-4 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, projects, todos, people…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden sm:block rounded border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
            esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">No matches</div>
          ) : (
            filtered.map((c, i) => {
              const Icon = c.icon
              return (
                <button
                  key={c.id}
                  data-active={i === active}
                  onClick={() => go(c)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                    i === active
                      ? 'bg-brand-50 dark:bg-brand-600/15 text-brand-700 dark:text-brand-200'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-slate-400" />
                  <span className="flex-1 truncate">{c.label}</span>
                  {i === active ? (
                    <CornerDownLeft className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <span className="text-[11px] text-slate-400">{c.group}</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
