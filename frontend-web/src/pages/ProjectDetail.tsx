import { useState } from 'react'
import { Link, useParams, useNavigate, Outlet } from 'react-router-dom'
import { safeDecode } from '@web/lib/route'
import {
  ArrowLeft, CalendarClock, ListChecks, Plus, MousePointerClick, Pencil, Trash2, List, BarChart3,
} from 'lucide-react'
import { useProjectDetail, useDeleteProjectDetail } from '@/hooks/useData'
import { GanttChart } from '@/components/GanttChart'
import { groupFromItems } from '@/lib/gantt'
import { formatEstimateRatio } from '@/lib/format'
import { Spinner, EmptyState } from '@/components/ui'
import { Button, OverflowMenu, type MenuItem } from '@web/components/ui'
import { useSetCrumbs } from '@web/lib/crumbs'
import { useConfirm } from '@/components/Confirm'
import CommentThread from '@/components/CommentThread'
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'
import { ProjectDetailFormDialog } from '@web/components/ProjectDetailFormDialog'
import { Page, PageHeader, Section } from '@web/components/Page'
import { PropertyRow, Property } from '@web/components/Property'
import { DataTable } from '@web/components/DataTable'
import { DetailMeta } from '@web/components/DetailMeta'
import { TODO_COLUMNS, todoGroupsOf } from '@web/lib/todoTable'

export default function ProjectDetail() {
  const { name = '', itemName } = useParams()
  const id = safeDecode(name)
  const nav = useNavigate()
  const confirm = useConfirm()

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)
  const [view, setView] = useState<'list' | 'gantt'>('list')

  const detail = useProjectDetail(id, showCancelled)
  const deleteMutation = useDeleteProjectDetail()
  const itemSelected = !!itemName

  useSetCrumbs(
    detail.data
      ? [
          { label: 'Projects', to: '/projects' },
          { label: detail.data.project_name, to: `/project/${encodeURIComponent(detail.data.project)}` },
          { label: detail.data.title },
        ]
      : [],
  )

  if (detail.isLoading && !detail.data) {
    return (
      <div className="flex justify-center py-20">
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

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete project detail?',
      message: `"${d.title}" and all its todos will be permanently removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    deleteMutation.mutate(d.name, {
      onSuccess: () => nav(`/project/${encodeURIComponent(d.project)}`),
    })
  }

  const overflowItems: MenuItem[] = [
    ...(d.can_edit
      ? [{ label: 'Edit', icon: Pencil, onClick: () => setEditOpen(true) }]
      : []),
    ...(d.can_edit
      ? [{ label: 'Delete', icon: Trash2, danger: true, onClick: handleDelete }]
      : []),
  ]

  return (
    <Page>
      <PageHeader
        title={d.title}
        subtitle={
          <Link
            to={`/project/${encodeURIComponent(d.project)}`}
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {d.project_name}
          </Link>
        }
        actions={
          overflowItems.length > 0 ? <OverflowMenu items={overflowItems} /> : undefined
        }
      />

      {/* Properties */}
      <Section divider={false}>
        <PropertyRow>
          <Property label="Status" icon={undefined}>
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-muted dark:text-slate-300">
                {d.status}
              </span>
              {d.is_pending ? (
                <span className="rounded-full bg-amber-100 dark:bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  Pending
                </span>
              ) : null}
            </span>
          </Property>
          {d.deadline_human && (
            <Property label="Deadline" icon={CalendarClock}>
              <span
                className={
                  d.deadline_human
                    ? 'text-amber-700 dark:text-amber-400 font-medium'
                    : undefined
                }
              >
                {d.deadline_human}
              </span>
            </Property>
          )}
          <Property label="Progress" icon={ListChecks}>
            <span className="text-muted text-sm">
              {openCount} open · {completedCount} done · {formatEstimateRatio(minutesDone, minutesTotal)} est.
            </span>
          </Property>
        </PropertyRow>
      </Section>

      {/* Rich HTML meta sections */}
      <DetailMeta d={d} />

      {/* Todos — master/detail: table (left) + selected item pane (right) */}
      <Section
        title="Todos"
        actions={
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
        }
      >
        {view === 'gantt' ? (
          <GanttChart
            groups={[groupFromItems(d.title, items)]}
            title={d.title}
            onBarClick={(tid) => nav(`/project-detail/${encodeURIComponent(d.name)}/item/${encodeURIComponent(tid)}`)}
          />
        ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr,40%]">
          {/* Left: grouped tables */}
          <div className="min-w-0 space-y-5">
            {items.length === 0 ? (
              <EmptyState icon={ListChecks} title="No todos in this detail" />
            ) : visibleItems.length === 0 ? (
              <EmptyState icon={ListChecks} title="No visible todos" />
            ) : (
              todoGroups.map((g) => (
                <div key={g.label}>
                  <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted dark:text-slate-500">
                    {g.label} ({g.rows.length})
                  </p>
                  <DataTable
                    rows={g.rows}
                    columns={TODO_COLUMNS}
                    getKey={(r) => r.name}
                    activeKey={itemName}
                    onRowClick={(r) =>
                      nav(
                        `/project-detail/${encodeURIComponent(d.name)}/item/${encodeURIComponent(r.name)}`,
                      )
                    }
                  />
                </div>
              ))
            )}
          </div>

          {/* Right: selected item pane */}
          <div className="min-w-0 rounded-lg bg-surface border border-line p-5 min-h-[320px]">
            {itemSelected ? (
              <Outlet />
            ) : (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted dark:text-slate-500">
                <MousePointerClick className="h-8 w-8 opacity-50" />
                Select a todo to view its details here — or use the Status cell to advance it inline.
              </div>
            )}
          </div>
        </div>
        )}
      </Section>

      {/* Comments */}
      <Section title="Comments">
        <CommentThread referenceDoctype="Project Detail" referenceName={id} />
      </Section>

      {/* Dialogs */}
      <CreateProjectItemDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projectDetail={d.name}
        team={d.team.map((t) => ({ user: t.user, name: t.name }))}
        defaultGroup={d.default_group ?? null}
        siblings={d.project_items.map((t) => ({ name: t.name, to_do: t.to_do }))}
      />
      <ProjectDetailFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={d.project}
        detail={d.name}
      />
    </Page>
  )
}
