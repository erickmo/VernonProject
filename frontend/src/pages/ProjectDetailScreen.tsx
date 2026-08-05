import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ListChecks, AlertCircle, Plus, ChevronRight, CalendarClock, List, BarChart3, FolderKanban, Play, Timer, Check } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { CreateProjectItemSheet } from '@/components/CreateProjectItemSheet'
import { BulkAddSheet } from '@/components/BulkAddSheet'
import { GanttChart } from '@/components/GanttChart'
import { CancelledNote } from '@/components/CancelledNote'
import { groupFromItems } from '@/lib/gantt'
import CommentThread from '@/components/CommentThread'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { AutoApproveSegment } from '@/components/AutoApproveSegment'
import { ProjectAutoApproveSwitch } from '@/components/ProjectAutoApproveSwitch'
import { useProjectDetail, useSetAutoApprove, useSetProjectAutoApprove, useSetTodoAllocations, useBoot } from '@/hooks/useData'
import { useFocusPill } from '@/hooks/useFocusPill'
import { useTodoContextMenu } from '@/hooks/useTodoMenu'
import { useHoldFeedback } from '@/hooks/useHoldFeedback'
import { buildNext } from '@/lib/planDay'
import { stripHtml, sanitizeHtml, byDeadlineAsc, formatEstimate, formatEstimateRatio, todayISO } from '@/lib/format'
import { STATUS } from '@/lib/status'
import type { ProjectItem } from '@/lib/types'

export default function ProjectDetailScreen() {
  const { name = '' } = useParams()
  const navigate = useNavigate()
  const id = decodeURIComponent(name)
  const [showCancelled, setShowCancelled] = useState(false)
  const { data, isLoading } = useProjectDetail(id, showCancelled)
  const { data: boot } = useBoot()
  const setProjectAutoApprove = useSetProjectAutoApprove()
  const toast = useToast()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
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
  const openCount = projectItems.filter((t) => t.status_key !== 'completed' && t.status_key !== 'cancelled').length
  const notCancelled = projectItems.filter((t) => t.status_key !== 'cancelled')
  const minutesTotal = notCancelled.reduce((s, t) => s + (t.estimated || 0), 0)
  const minutesDone = notCancelled
    .filter((t) => t.status_key === 'completed')
    .reduce((s, t) => s + (t.estimated || 0), 0)
  const filteredItems = projectItems.filter((t) =>
    todoFilter === 'all' ? true : todoFilter === 'completed' ? t.status_key === 'completed' : (t.status_key !== 'completed' && t.status_key !== 'cancelled'),
  )

  return (
    <DetailScreen title={data.title}>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
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
          <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            {formatEstimateRatio(minutesDone, minutesTotal)} done
          </span>
        </div>

        {data.can_set_auto_approve && !!boot?.settings?.show_auto_approve && (
          <div className="mt-3">
            <ProjectAutoApproveSwitch
              enabled={data.auto_approve}
              disabled={setProjectAutoApprove.isPending}
              onToggle={() =>
                setProjectAutoApprove.mutate(
                  { project: data.project, enabled: data.auto_approve ? 0 : 1 },
                  { onError: (e) => toast('error', (e as Error).message) },
                )
              }
            />
          </div>
        )}

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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBulkOpen(true)}
                  className="flex items-center gap-1 rounded-full border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-600 active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" /> Bulk
                </button>
                <button
                  onClick={() => setSheetOpen(true)}
                  className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" /> Todo
                </button>
              </div>
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
                  ['open', `Open ${openCount}`],
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
              { label: 'Open', items: filteredItems.filter((t) => t.status_key !== 'completed' && t.status_key !== 'cancelled') },
              { label: 'Completed', items: filteredItems.filter((t) => t.status_key === 'completed') },
              { label: 'Cancelled', items: todoFilter === 'all' ? projectItems.filter((t) => t.status_key === 'cancelled') : [] },
            ].filter((s) => s.items.length).map((s) => (
              <div key={s.label}>
                <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{s.label} ({s.items.length})</p>
                <div className="flex flex-col gap-1.5">
                  {s.items.map((t) => (
                    <TodoRow key={t.name} item={t} projectAutoApprove={data.auto_approve} />
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

      {bulkOpen && (
        <BulkAddSheet
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          projectDetail={data.name}
          team={data.team}
          defaultGroup={data.default_group}
          siblings={data.project_items.map((t) => ({ name: t.name, to_do: t.to_do }))}
        />
      )}
    </DetailScreen>
  )
}

// One todo link-row. A component (not inline JSX) because the Today + Focus
// quick-actions need per-row hooks — same pair the web todo table already shows.
// ponytail: each row subscribes to the 1s focus tick (via useFocusPill); fine for
// one detail's todo list, revisit if a screen ever renders hundreds of rows.
function TodoRow({
  item: t,
  projectAutoApprove,
}: {
  // The cancel fields aren't in the lightweight row shape — optional so CancelledNote still takes it.
  item: ProjectItem & { cancelled_on?: string | null; cancellation_reason?: string | null }
  projectAutoApprove: boolean
}) {
  const { data: boot } = useBoot()
  const setAutoApprove = useSetAutoApprove()
  const setAlloc = useSetTodoAllocations(t.name)
  const { focusActive, focusMode, onFocusPill } = useFocusPill(t)
  const toast = useToast()
  // Long-press (touch) / right-click opens the shared todo context menu — same
  // one the cards elsewhere use, so "Move to detail…" etc. are reachable here too.
  const menu = useTodoContextMenu()
  const { holding, longFired, bind } = useHoldFeedback((pt) => menu?.open(t, pt))
  const isCancelled = t.status_key === 'cancelled'
  // Planning or focusing a done/cancelled task is meaningless — open todos only.
  const isOpen = !isCancelled && t.status_key !== 'completed'
  const planned = t.today_allocation > 0
  const statusMeta = STATUS[t.status_key as keyof typeof STATUS]

  return (
    <Link
      to={`/project-item/${encodeURIComponent(t.name)}`}
      {...bind}
      onClick={(e) => { if (longFired.current) { e.preventDefault(); longFired.current = false } }}
      onContextMenu={(e) => { if (!menu) return; e.preventDefault(); menu.open(t, { x: e.clientX, y: e.clientY }) }}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm transition active:scale-[0.99] ${holding ? 'border-brand-400 ring-2 ring-brand-400/60' : 'border-slate-200 dark:border-slate-700'} ${isCancelled ? 'bg-slate-50 dark:bg-slate-900 opacity-60' : 'bg-white dark:bg-slate-800'}`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
        <FolderKanban className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${isCancelled ? 'text-slate-400 dark:text-slate-500 line-through' : t.is_overdue ? 'text-rose-700' : 'text-slate-800 dark:text-slate-100'}`}>
          {t.to_do}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          {statusMeta ? (
            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusMeta.pill}`}>
              {statusMeta.emoji} {statusMeta.label}
            </span>
          ) : (
            <span>{t.status}</span>
          )}
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
        {isOpen && (
          // Each pill preventDefaults: stopPropagation alone still lets the
          // browser follow the row's <a> href (full page load).
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            {/* Only the assignee sets the day-plan (backend enforces it too). */}
            {t.is_mine && (
              <button
                type="button"
                disabled={setAlloc.isPending}
                title={planned ? 'Remove from today' : 'Add to today'}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (setAlloc.isPending) return
                  const minutes = planned ? 0 : t.estimated > 0 ? t.estimated : 30
                  setAlloc.mutate(buildNext(t.allocations ?? [], todayISO(), minutes), {
                    onError: (err) => toast('error', (err as Error).message),
                  })
                }}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition active:scale-95 ${setAlloc.isPending ? 'opacity-50' : ''} ${
                  planned
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-stone-100 text-stone-600 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {planned ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {planned ? `${formatEstimate(t.today_allocation)} today` : 'Today'}
              </button>
            )}
            <button
              type="button"
              title={focusActive ? (focusMode === 'fullscreen' ? 'Open focus timer' : 'Stop focus timer') : 'Start focus timer'}
              onClick={(e) => { e.preventDefault(); onFocusPill(e) }}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition active:scale-95 ${
                focusActive
                  ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                  : 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300'
              }`}
            >
              {focusActive ? <Timer className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {focusActive ? 'Focusing' : 'Focus'}
            </button>
          </div>
        )}
        {isCancelled && (
          <div className="mt-1">
            <CancelledNote item={t} variant="line" />
          </div>
        )}
        {t.can_set_auto_approve && !!boot?.settings?.show_auto_approve && (
          <div onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
            <AutoApproveSegment
              mode={t.auto_approve_mode}
              effective={t.auto_approve_effective}
              projectDefault={projectAutoApprove}
              disabled={setAutoApprove.isPending}
              onChange={(mode) =>
                setAutoApprove.mutate(
                  { todoId: t.name, mode },
                  { onError: (e) => toast('error', (e as Error).message) },
                )
              }
            />
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
    </Link>
  )
}
