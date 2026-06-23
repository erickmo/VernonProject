import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ListChecks, AlertCircle, Plus, ChevronRight, CalendarClock, List, BarChart3 } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { CreateProjectItemSheet } from '@/components/CreateProjectItemSheet'
import { GanttChart } from '@/components/GanttChart'
import { groupFromItems } from '@/lib/gantt'
import CommentThread from '@/components/CommentThread'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { useProjectDetail } from '@/hooks/useData'
import { stripHtml, sanitizeHtml, byDeadlineAsc } from '@/lib/format'

export default function ProjectDetailScreen() {
  const { name = '' } = useParams()
  const navigate = useNavigate()
  const id = decodeURIComponent(name)
  const [showCancelled, setShowCancelled] = useState(false)
  const { data, isLoading } = useProjectDetail(id, showCancelled)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [view, setView] = useState<'list' | 'gantt'>('list')
  const [todoFilter, setTodoFilter] = useState<'all' | 'open' | 'completed'>('all')

  if (isLoading && !data) {
    return (
      <DetailScreen title="Detail">
        <FullScreenLoader />
      </DetailScreen>
    )
  }
  if (!data) {
    return (
      <DetailScreen title="Detail">
        <EmptyState icon={AlertCircle} title="Couldn't load detail" />
      </DetailScreen>
    )
  }

  // Text Editor fields — render the stored HTML; stripHtml is only used to test
  // emptiness (an empty editor can still hold markup like <p></p>).
  const conditionHtml = data.current_condition || ''
  const outcomeHtml = data.expected_outcome || ''
  const hasCondition = !!stripHtml(conditionHtml).trim()
  const hasOutcome = !!stripHtml(outcomeHtml).trim()
  const projectItems = data.project_items.slice().sort(byDeadlineAsc)
  const completedCount = projectItems.filter((t) => t.status_key === 'completed').length
  const filteredItems = projectItems.filter((t) =>
    todoFilter === 'all' ? true : todoFilter === 'completed' ? t.status_key === 'completed' : t.status_key !== 'completed',
  )

  return (
    <DetailScreen title={data.title}>
      <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-card">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {data.project_name}
        </p>
        <h2 className="mt-1 text-lg font-bold leading-snug text-slate-900 dark:text-slate-50">{data.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-block rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            {data.status}
          </span>
          {data.deadline_human && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              <CalendarClock className="h-3.5 w-3.5" /> {data.deadline_human}
            </span>
          )}
        </div>

        <div className="mt-3 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-sm">
          {hasCondition && (
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">Current condition</p>
              <div className="prose-notes text-slate-600 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: sanitizeHtml(conditionHtml) }} />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">Expected outcome</p>
            {hasOutcome ? (
              <div className="prose-notes text-slate-600 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: sanitizeHtml(outcomeHtml) }} />
            ) : (
              <p className="text-slate-600 dark:text-slate-300">—</p>
            )}
          </div>
        </div>
      </div>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <ListChecks className="h-4 w-4" /> Todos ({projectItems.length})
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-slate-100 dark:bg-slate-800 p-0.5">
              <button
                onClick={() => setView('list')}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${view === 'list' ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm' : 'text-slate-400 dark:text-slate-500'}`}
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button
                onClick={() => setView('gantt')}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${view === 'gantt' ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm' : 'text-slate-400 dark:text-slate-500'}`}
              >
                <BarChart3 className="h-3.5 w-3.5" /> Gantt
              </button>
            </div>
            {data.can_create && (
              <button
                onClick={() => setSheetOpen(true)}
                className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" /> Todo
              </button>
            )}
          </div>
        </div>
        {view === 'gantt' ? (
          <GanttChart
            groups={[groupFromItems(data.title, projectItems)]}
            title={data.title}
            onBarClick={(tid) => navigate(`/project-item/${encodeURIComponent(tid)}`)}
          />
        ) : projectItems.length ? (
          <>
            <div className="mb-2.5 flex items-center justify-between gap-1.5">
              <div className="flex gap-1.5">
                {([
                  ['all', `All ${projectItems.length}`],
                  ['open', `Open ${projectItems.length - completedCount}`],
                  ['completed', `Completed ${completedCount}`],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTodoFilter(key)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${todoFilter === key ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={showCancelled}
                  onChange={(e) => setShowCancelled(e.target.checked)}
                  className="h-4 w-4 accent-brand-600"
                />
                Show cancelled
              </label>
            </div>
            {filteredItems.length ? (
          <div className="flex flex-col gap-3">
            {[
              { label: 'Open', items: filteredItems.filter((t) => t.status_key !== 'completed') },
              { label: 'Completed', items: filteredItems.filter((t) => t.status_key === 'completed') },
            ].filter((s) => s.items.length).map((s) => (
              <div key={s.label}>
                <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{s.label} ({s.items.length})</p>
                <div className="flex flex-col gap-1.5">
                  {s.items.map((t) => (
              <Link
                key={t.name}
                to={`/project-item/${encodeURIComponent(t.name)}`}
                className="flex items-center gap-3 rounded-xl bg-white dark:bg-slate-800 px-4 py-3 shadow-card transition active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${t.is_overdue ? 'text-rose-700' : 'text-slate-800 dark:text-slate-100'}`}>
                    {t.to_do}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                    <span>{t.status}</span>
                    {t.deadline_human && (
                      <>
                        <span>·</span>
                        <span className={t.is_overdue ? 'font-semibold text-rose-500' : ''}>
                          {t.deadline_human}
                        </span>
                      </>
                    )}
                    {t.assigned_to_name && (
                      <>
                        <span>·</span>
                        <span>{t.assigned_to_name}</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
              </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
            ) : (
              <EmptyState icon={ListChecks} title="No matching todos" />
            )}
          </>
        ) : (
          <EmptyState icon={ListChecks} title="No todos in this detail" />
        )}
      </section>

      <CommentThread referenceDoctype="Project Detail" referenceName={id} />

      <CreateProjectItemSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        projectDetail={data.name}
        team={data.team}
        defaultGroup={data.default_group}
        siblings={data.project_items.map((t) => ({ name: t.name, to_do: t.to_do }))}
      />
    </DetailScreen>
  )
}
