import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { Search, AlertCircle, CheckCheck } from 'lucide-react'
import { useProjects } from '@/hooks/useData'
import { ProgressBar, Spinner } from '@/components/ui'

// Persistent left rail: searchable project list, active-row highlight.
// Left half of the projects workspace split.
export function ProjectRail() {
  const projects = useProjects()
  const [q, setQ] = useState('')
  const [showClosed, setShowClosed] = useState(false)

  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return (projects.data ?? []).filter((p) => {
      if (!showClosed && p.status !== 'Ongoing') return false
      // match name / brand / owner / leader so you can find "projects led by X"
      if (ql && ![p.project_name, p.brand, p.owner_name, p.leader_name].some((s) => (s || '').toLowerCase().includes(ql)))
        return false
      return true
    })
  }, [projects.data, q, showClosed])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search projects or people"
            placeholder="Search projects or people"
            className="w-full rounded-lg border border-line bg-transparent py-1.5 pl-8 pr-2 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-600"
          />
          Show closed
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {projects.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : visible.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted">No projects</div>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((p) => (
              <li key={p.name}>
                <NavLink
                  to={`/project/${encodeURIComponent(p.name)}`}
                  className={({ isActive }) =>
                    clsx(
                      'block rounded-lg px-2.5 py-2 transition',
                      isActive ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-hover/[0.04]',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-2">
                        <span
                          className={clsx(
                            'min-w-0 flex-1 truncate text-sm font-medium',
                            isActive ? 'text-brand-700 dark:text-brand-300' : 'text-ink',
                          )}
                        >
                          {p.project_name}
                        </span>
                        {p.review > 0 && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-brand-600">
                            <CheckCheck className="h-3 w-3" />
                            {p.review}
                          </span>
                        )}
                        {p.overdue > 0 && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                            <AlertCircle className="h-3 w-3" />
                            {p.overdue}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <ProgressBar value={p.progress} className="flex-1" />
                        <span className="shrink-0 text-[10px] tabular-nums text-muted">
                          {p.item_done}/{p.item_total}
                        </span>
                      </div>
                      {p.brand && <div className="mt-0.5 truncate text-[10px] text-muted">{p.brand}</div>}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
