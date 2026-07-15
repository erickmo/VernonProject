import { useState } from 'react'
import { useParams, useNavigate, Outlet } from 'react-router-dom'
import { safeDecode } from '@web/lib/route'
import { ListChecks, Plus, CalendarClock, List, BarChart3 } from 'lucide-react'
import { useProjectDetail, useSetAutoApprove, useSetProjectAutoApprove, useBoot } from '@/hooks/useData'
import { GanttChart } from '@/components/GanttChart'
import { groupFromItems } from '@/lib/gantt'
import { formatEstimateRatio } from '@/lib/format'
import { Spinner, EmptyState } from '@/components/ui'
import { Button } from '@web/components/ui'
import { useToast } from '@/components/Toast'
import CommentThread from '@/components/CommentThread'
import { Drawer } from '@web/components/overlays/Drawer'
import { DataTable, type Column } from '@web/components/DataTable'
import { DetailMeta } from '@web/components/DetailMeta'
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'
import { TODO_COLUMNS, todoGroupsOf, TodoProgress } from '@web/lib/todoTable'
import { AutoApproveSegment } from '@web/components/AutoApproveSegment'
import { ProjectAutoApproveSwitch } from '@web/components/ProjectAutoApproveSwitch'
import type { ProjectItem } from '@/lib/types'

// Right pane of a project's detail split: the selected work-package's todos.
// Todo detail opens in a slide-over so the columns stay two-pane.
export default function ProjectDetailPane() {
  const { name = '', detailName = '', itemName } = useParams()
  const projectId = safeDecode(name)
  const id = safeDecode(detailName)
  const nav = useNavigate()

  const [createOpen, setCreateOpen] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)
  const [view, setView] = useState<'list' | 'gantt'>('list')

  const detail = useProjectDetail(id, showCancelled)
  const setAutoApprove = useSetAutoApprove()
  const setProjectAutoApprove = useSetProjectAutoApprove()
  const { data: boot } = useBoot()
  const canAutoApprove = !!boot?.settings?.show_auto_approve
  const toast = useToast()
  const base = `/project/${encodeURIComponent(projectId)}/detail/${encodeURIComponent(id)}`

  if (detail.isLoading && !detail.data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }
  if (!detail.data) {
    return <EmptyState icon={ListChecks} title="Couldn't load detail" />
  }

  const d = detail.data
  const items = d.project_items
  const completedCount = items.filter((t) => t.status_key === 'completed').length
  const openCount = items.filter((t) => t.status_key !== 'completed' && t.status_key !== 'cancelled').length
  const notCancelled = items.filter((t) => t.status_key !== 'cancelled')
  const minutesTotal = notCancelled.reduce((s, t) => s + (t.estimated || 0), 0)
  const minutesDone = notCancelled
    .filter((t) => t.status_key === 'completed')
    .reduce((s, t) => s + (t.estimated || 0), 0)
  const { visibleItems, todoGroups } = todoGroupsOf(items, showCancelled)

  // Owner-only per-todo auto-approve control, appended to the shared todo
  // columns only when at least one visible row can use it.
  const autoApproveColumn: Column<ProjectItem> = {
    key: 'auto_approve',
    header: '',
    render: (t) =>
      t.can_set_auto_approve && canAutoApprove ? (
        <div onClick={(e) => e.stopPropagation()}>
          <AutoApproveSegment
            mode={t.auto_approve_mode}
            effective={t.auto_approve_effective}
            projectDefault={d.auto_approve}
            disabled={setAutoApprove.isPending}
            compact
            onChange={(mode) =>
              setAutoApprove.mutate(
                { todoId: t.name, mode },
                { onError: (e) => toast('error', (e as Error).message) },
              )
            }
          />
        </div>
      ) : null,
  }
  const todoColumns = items.some((t) => t.can_set_auto_approve) && canAutoApprove ? [...TODO_COLUMNS, autoApproveColumn] : TODO_COLUMNS

  return (
    <div className="min-w-0">
      {/* Detail header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-ink">{d.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span>{openCount} open · {completedCount} done · {formatEstimateRatio(minutesDone, minutesTotal)} est.</span>
            {d.deadline_human && (
              <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                <CalendarClock className="h-3.5 w-3.5" /> {d.deadline_human}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-full bg-canvas p-0.5">
            <button
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${view === 'list' ? 'bg-surface text-ink dark:text-slate-200 shadow-sm' : 'text-muted dark:text-slate-500'}`}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button
              onClick={() => setView('gantt')}
              aria-pressed={view === 'gantt'}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${view === 'gantt' ? 'bg-surface text-ink dark:text-slate-200 shadow-sm' : 'text-muted dark:text-slate-500'}`}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Gantt
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand-600"
            />
            Show cancelled
          </label>
          {d.can_create && (
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Todo
            </Button>
          )}
        </div>
      </div>

      {d.can_set_auto_approve && canAutoApprove && (
        <div className="mb-4 max-w-sm">
          <ProjectAutoApproveSwitch
            enabled={d.auto_approve}
            disabled={setProjectAutoApprove.isPending}
            onToggle={() =>
              setProjectAutoApprove.mutate(
                { project: d.project, enabled: d.auto_approve ? 0 : 1 },
                { onError: (e) => toast('error', (e as Error).message) },
              )
            }
          />
        </div>
      )}

      {/* Completion progress bar — mirrors the /w Home + Review lists */}
      {view === 'list' && visibleItems.length > 0 && (
        <div className="mb-4">
          <TodoProgress items={items} />
        </div>
      )}

      {/* Grouped todo tables */}
      {view === 'gantt' ? (
        <GanttChart
          groups={[groupFromItems(d.title, items)]}
          title={d.title}
          onBarClick={(tid) => nav(`${base}/item/${encodeURIComponent(tid)}`)}
        />
      ) : items.length === 0 ? (
        <EmptyState icon={ListChecks} title="No todos in this detail" />
      ) : visibleItems.length === 0 ? (
        <EmptyState icon={ListChecks} title="No visible todos" />
      ) : (
        <div className="space-y-5">
          {todoGroups.map((g) => (
            <div key={g.label}>
              <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted dark:text-slate-500">
                {g.label} ({g.rows.length})
              </p>
              <DataTable
                rows={g.rows}
                columns={todoColumns}
                getKey={(r) => r.name}
                activeKey={itemName}
                onRowClick={(r) => nav(`${base}/item/${encodeURIComponent(r.name)}`)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Rich work-package meta + detail-level comments */}
      <DetailMeta d={d} />
      <div className="mt-6 border-t border-line pt-5">
        <CommentThread referenceDoctype="Project Detail" referenceName={id} />
      </div>

      {/* Selected todo — slide-over. closeOnEscape=false: ProjectItem hosts its
          own nested dialogs/confirms; Escape there must not tear down this drawer. */}
      <Drawer open={!!itemName} onClose={() => nav(base)} title="Todo" widthClass="max-w-3xl" scrim="bg-black/30" closeOnEscape={false}>
        <Outlet />
      </Drawer>

      <CreateProjectItemDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projectDetail={d.name}
        team={d.team.map((t) => ({ user: t.user, name: t.name }))}
        defaultGroup={d.default_group ?? null}
        siblings={d.project_items.map((t) => ({ name: t.name, to_do: t.to_do }))}
      />
    </div>
  )
}
