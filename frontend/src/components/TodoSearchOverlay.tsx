import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SearchX, X, ChevronRight, FolderKanban, ListTree, CheckSquare } from 'lucide-react'
import { EmptyState, Segmented } from '@/components/ui'
import { STATUS } from '@/lib/status'
import { useCalendar, useProjects } from '@/hooks/useData'
import {
  matchProjectItem,
  matchProject,
  matchProjectDetail,
  projectDetailsFromTodos,
  type SearchScope,
  todoInScope,
  projectInScope,
  detailInScope,
} from '@/lib/filters'

const TODO_CAP = 50

// Shared nav-only row: title + muted secondary line + chevron. Search is
// jump-to, not a mutation surface — editing lives on the destination screen.
function ResultRow({
  icon: Icon,
  title,
  secondary,
  onClick,
}: {
  icon: typeof FolderKanban
  title: string
  secondary: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card px-4 py-3 text-left shadow-card transition active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800"
    >
      <Icon className="h-4 w-4 shrink-0 text-stone-400 dark:text-slate-500" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-stone-800 dark:text-slate-100">{title}</p>
        {secondary && <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-slate-400">{secondary}</p>}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-stone-300 dark:text-slate-600" />
    </button>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
      {children}
    </p>
  )
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// Global "jump to any of my to-dos" search. Top-anchored full-screen overlay
// (not a bottom sheet — the keyboard rises from the bottom, so results must
// fill downward from a top input). State-driven, opened from TabScreen's header.
export function TodoSearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<SearchScope>('all')
  const calendar = useCalendar()
  const projects = useProjects()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Mirrors FilterSheet's scroll-lock, adds focus-trap/restore + Esc/Android-back
  // close (FilterSheet has neither today; this overlay needs both since it's
  // full-screen and keyboard-heavy).
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const restoreEl = document.activeElement as HTMLElement | null
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0)

    // Push a history marker so the Android/browser back button closes the
    // overlay instead of leaving the page.
    window.history.pushState({ todoSearch: true }, '')
    let poppedByUser = false
    const onPopState = () => {
      poppedByUser = true
      onClose()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !containerRef.current) return
      const focusable = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('popstate', onPopState)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = prevOverflow
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('keydown', onKeyDown)
      // ponytail: only consume our marker if it's still the top entry (i.e. we're
      // closing in place). If a result-tap navigated past it instead, leave it —
      // one extra back press to skip past the search marker is an acceptable
      // ceiling vs. wiring up router-navigation tracking just to avoid it.
      if (!poppedByUser && (window.history.state as { todoSearch?: boolean } | null)?.todoSearch) {
        window.history.back()
      }
      restoreEl?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const q = query.trim()
  const projectHits = q ? (projects.data ?? []).filter((p) => matchProject(p, query) && projectInScope(p, scope)) : []
  const detailHits = q
    ? projectDetailsFromTodos(calendar.data?.todos ?? []).filter((d) => matchProjectDetail(d, query) && detailInScope(d, scope))
    : []
  const allTodoHits = q ? (calendar.data?.todos ?? []).filter((t) => matchProjectItem(t, query) && todoInScope(t, scope)) : []
  const todoHits = allTodoHits.slice(0, TODO_CAP)
  const total = projectHits.length + detailHits.length + allTodoHits.length

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex flex-col bg-paper animate-fade-in dark:bg-slate-900">
      <div className="shrink-0 border-b border-paper-edge bg-paper-card px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects, work items, to-dos…"
              aria-label="Search projects, work items, to-dos"
              className="w-full rounded-2xl border border-paper-edge bg-paper py-2.5 pl-9 pr-9 text-sm text-stone-800 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 active:scale-90 dark:text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 px-1 text-sm font-semibold text-brand-600 active:opacity-70 dark:text-brand-400"
          >
            Cancel
          </button>
        </div>
        <div className="mt-2">
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
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
        {!q ? (
          <p className="px-2 py-10 text-center text-sm text-stone-400 dark:text-slate-500">
            Search projects, work items, and to-dos by name, person, or status.
          </p>
        ) : total === 0 ? (
          <EmptyState icon={SearchX} title="No matches" subtitle="Try a different search." />
        ) : (
          <div className="flex flex-col gap-4">
            {projectHits.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionLabel>Projects</SectionLabel>
                {projectHits.map((p) => (
                  <ResultRow
                    key={p.name}
                    icon={FolderKanban}
                    title={p.project_name}
                    secondary={[p.brand, p.leader_name].filter(Boolean).join(' · ')}
                    onClick={() => {
                      navigate(`/project/${encodeURIComponent(p.name)}`)
                      onClose()
                    }}
                  />
                ))}
              </div>
            )}

            {detailHits.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionLabel>Work items</SectionLabel>
                {detailHits.map((d) => (
                  <ResultRow
                    key={d.name}
                    icon={ListTree}
                    title={d.title}
                    secondary={d.project_name}
                    onClick={() => {
                      navigate(`/project-detail/${encodeURIComponent(d.name)}`)
                      onClose()
                    }}
                  />
                ))}
              </div>
            )}

            {todoHits.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionLabel>To-dos</SectionLabel>
                {todoHits.map((t) => {
                  const secondary = [t.project_name, STATUS[t.status_key]?.label, t.assigned_to_name]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <ResultRow
                      key={t.name}
                      icon={CheckSquare}
                      title={t.to_do}
                      secondary={secondary}
                      onClick={() => {
                        navigate(`/project-item/${encodeURIComponent(t.name)}`)
                        onClose()
                      }}
                    />
                  )
                })}
                {allTodoHits.length > TODO_CAP && (
                  <p className="px-1 pt-0.5 text-center text-xs text-stone-400 dark:text-slate-500">
                    Showing first {TODO_CAP} of {allTodoHits.length}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
