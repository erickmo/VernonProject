import { useState } from 'react'
import { useParams, useNavigate, Outlet } from 'react-router-dom'
import {
  Target, Users, CalendarDays, AlertCircle, ChevronRight,
  Layers, Pencil, Trash2, Plus, ListPlus, BarChart3, List, Tag,
} from 'lucide-react'
import { useProject, useProjectDetail, useProjectGantt, permFlags, useBoot, useDeleteProject, useDeleteProjectDetail } from '@/hooks/useData'
import { GanttChart } from '@/components/GanttChart'
import { ProgressBar, Spinner, EmptyState } from '@/components/ui'
import { Button, OverflowMenu } from '@web/components/ui'
import { useSetCrumbs } from '@web/lib/crumbs'
import CommentThread from '@/components/CommentThread'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { formatDate, formatEstimateRatio, progressPct } from '@/lib/format'
import { ProjectFormDialog } from '@web/components/ProjectFormDialog'
import { ProjectDetailFormDialog } from '@web/components/ProjectDetailFormDialog'
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'
import { TeamWorkloadDrawer } from '@web/components/TeamWorkloadDrawer'
import { TeamManagerDrawer } from '@web/components/TeamManagerDrawer'
import { Page, PageHeader, Section } from '@web/components/Page'
import { PropertyRow, Property } from '@web/components/Property'
import { DataTable, type Column } from '@web/components/DataTable'
import { EntityChip } from '@web/components/EntityChip'
import { ProjectGroupPhoto } from '@/components/TeamWallCanvas'
import type { TeamMember, ProjectDetailSummary } from '@/lib/types'

type View = 'list' | 'gantt'
type DetailFilter = 'all' | 'open' | 'completed'

// ponytail: pure predicate, stable outside render
function isDetailCompleted(w: ProjectDetailSummary) {
  return w.total > 0 && w.done === w.total
}

export default function Project() {
  const { name = '', itemName } = useParams()
  const id = decodeURIComponent(name)
  const nav = useNavigate()
  const project = useProject(id)
  const boot = useBoot()
  const del = useDeleteProject()
  const delDetail = useDeleteProjectDetail()
  const confirm = useConfirm()
  const toast = useToast()

  const [view, setView] = useState<View>('list')
  const [detailFilter, setDetailFilter] = useState<DetailFilter>('all')
  const [editOpen, setEditOpen] = useState(false)
  const [detailFormOpen, setDetailFormOpen] = useState(false)
  const [editDetail, setEditDetail] = useState<string | null>(null)
  const [teamOpen, setTeamOpen] = useState(false)
  const [createItemFor, setCreateItemFor] = useState<string | null>(null)
  const [workloadMember, setWorkloadMember] = useState<TeamMember | null>(null)

  const gantt = useProjectGantt(id, view === 'gantt')
  const itemDetail = useProjectDetail(createItemFor ?? '')

  useSetCrumbs(project.data ? [{ label: 'Projects', to: '/projects' }, { label: project.data.project_name }] : [])

  if (project.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (!project.data) {
    return <EmptyState icon={AlertCircle} title="Couldn't load project" />
  }

  const p = project.data
  const perms = permFlags(p, boot.data)
  const itemSelected = !!itemName

  const filteredDetails = p.project_details.filter((w) =>
    detailFilter === 'all' ? true : detailFilter === 'completed' ? isDetailCompleted(w) : !isDetailCompleted(w),
  )

  const completedCount = p.project_details.filter(isDetailCompleted).length
  const totalTasks = p.project_details.reduce((s, w) => s + w.total, 0)
  const doneTasks = p.project_details.reduce((s, w) => s + w.done, 0)
  const overdue = p.project_details.reduce((s, w) => s + w.overdue, 0)
  const minutesTotal = p.project_details.reduce((s, w) => s + w.minutes_total, 0)
  const minutesDone = p.project_details.reduce((s, w) => s + w.minutes_done, 0)
  const progress = progressPct(minutesDone, minutesTotal, doneTasks, totalTasks)

  const doDelete = async () => {
    if (!(await confirm({ title: 'Delete this project?', confirmLabel: 'Delete', destructive: true }))) return
    del.mutate(p.name, {
      onSuccess: () => { toast('success', 'Project deleted'); nav('/projects') },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  const doDeleteDetail = async (w: ProjectDetailSummary) => {
    if (w.total > 0) return
    if (!(await confirm({ title: 'Delete this detail?', message: `"${w.title}" will be removed.`, confirmLabel: 'Delete', destructive: true }))) return
    delDetail.mutate(w.name, {
      onSuccess: () => toast('success', 'Project detail deleted'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  // ponytail: columns defined here (not outside) because actions column closes over perms + state
  const detailColumns: Column<ProjectDetailSummary>[] = [
    {
      key: 'title',
      header: 'Task',
      sortValue: (r) => r.title,
      render: (r) => (
        <span className="flex flex-col gap-0.5">
          <span className={`font-medium ${isDetailCompleted(r) ? 'text-muted line-through' : 'text-ink'}`}>
            {r.title}
          </span>
          {r.overdue > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-3 w-3" /> {r.overdue} overdue
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-28',
      render: (r) => (
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${isDetailCompleted(r) ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
          {isDetailCompleted(r) ? 'Completed' : 'Open'}
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (r) => (
        <div className="flex min-w-[10rem] items-center gap-2">
          <ProgressBar value={r.progress} />
          <span className="shrink-0 whitespace-nowrap text-xs text-muted">
            {formatEstimateRatio(r.minutes_done, r.minutes_total)} · {r.done}/{r.total}
          </span>
        </div>
      ),
    },
    ...(perms.can_edit ? [{
      key: 'actions',
      header: '',
      width: 'w-10',
      render: (r: ProjectDetailSummary) => (
        <span onClick={(e) => e.stopPropagation()}>
          <OverflowMenu
            size="sm"
            items={[
              { label: 'Edit', icon: Pencil, onClick: () => setEditDetail(r.name) },
              { divider: true },
              { label: 'Delete', icon: Trash2, danger: true, disabled: r.total > 0, onClick: () => doDeleteDetail(r) },
            ]}
          />
        </span>
      ),
    } as Column<ProjectDetailSummary>] : []),
  ]

  return (
    <Page>
      <PageHeader
        title={p.project_name}
        actions={
          (perms.can_edit || perms.can_delete) ? (
            <div className="flex items-center gap-2">
              {perms.can_edit && (
                <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}
              {perms.can_delete && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={p.project_details.length > 0}
                  title={p.project_details.length > 0 ? 'Remove all details before deleting this project' : undefined}
                  onClick={doDelete}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {/* Properties */}
      <Section divider={false}>
        <PropertyRow>
          <Property label="Owner" icon={Users}>
            <EntityChip avatarName={p.owner_name} label={p.owner_name} />
          </Property>
          {p.leader_name && p.leader_name !== p.owner_name && (
            <Property label="Leader" icon={Users}>
              <EntityChip avatarName={p.leader_name} label={p.leader_name} />
            </Property>
          )}
          {p.start_date && (
            <Property label="Start" icon={CalendarDays}>
              <span className="text-sm">{formatDate(p.start_date)}</span>
            </Property>
          )}
          {p.deadline && (
            <Property label="Deadline" icon={CalendarDays}>
              <span className="text-sm">{formatDate(p.deadline)}</span>
            </Property>
          )}
          <Property label="Progress">
            <div className="flex w-full max-w-xs items-center gap-2">
              <ProgressBar value={progress} />
              <span className="shrink-0 whitespace-nowrap text-xs font-medium text-muted">
                {progress}% · {doneTasks}/{totalTasks} todos
                {overdue > 0 && (
                  <span className="ml-1.5 text-rose-600 dark:text-rose-400">{overdue} overdue</span>
                )}
              </span>
            </div>
          </Property>
          <Property label="Brand" icon={Tag}>
            <EntityChip icon={Tag} label={p.brand} />
          </Property>
        </PropertyRow>
      </Section>

      {/* Blocked-by banner */}
      {p.blocked_by && (
        <Section divider={false}>
          <button
            onClick={() => nav(`/project/${encodeURIComponent(p.blocked_by!)}`)}
            className="flex w-full items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 px-3 py-2.5 text-left text-sm font-medium text-amber-800 dark:text-amber-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">Blocked by <b>{p.blocked_by_name ?? p.blocked_by}</b></span>
            <ChevronRight className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
          </button>
        </Section>
      )}

      {/* Goal */}
      {p.goal && (
        <Section title={<span className="inline-flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> Goal</span>}>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{p.goal}</p>
        </Section>
      )}

      {/* Team workload */}
      {p.team.length > 0 && (
        <Section
          title="Team"
          actions={
            perms.can_edit ? (
              <button
                onClick={() => setTeamOpen(true)}
                className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                <Users className="h-3.5 w-3.5" /> Manage
              </button>
            ) : undefined
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {p.team.map((m) => {
              const role = m.is_owner && m.is_leader ? 'Owner · Leader'
                : m.is_owner ? 'Owner' : m.is_leader ? 'Leader' : null
              return (
                <button key={m.user} onClick={() => setWorkloadMember(m)}>
                  <EntityChip
                    avatarName={m.name}
                    image={m.image ?? undefined}
                    label={role ? `${m.name} (${role})` : m.name}
                  />
                </button>
              )
            })}
          </div>
        </Section>
      )}

      {/* Group photo */}
      {p.team.length > 0 && (
        <Section title={<span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Group Photo</span>}>
          <ProjectGroupPhoto team={p.team} />
        </Section>
      )}

      {/* Details list + master-detail right pane */}
      <Section
        title="Details"
        actions={
          <div className="flex items-center gap-2">
            {/* List / Gantt toggle */}
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
            {perms.can_edit && (
              <>
                <button
                  onClick={() => setDetailFormOpen(true)}
                  className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition"
                >
                  <Plus className="h-3.5 w-3.5" /> Detail
                </button>
                {p.project_details.length > 0 && (
                  <button
                    onClick={() => setCreateItemFor(p.project_details[0].name)}
                    className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  >
                    <ListPlus className="h-3.5 w-3.5" /> Todo
                  </button>
                )}
              </>
            )}
          </div>
        }
      >
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Left pane: detail table or gantt */}
          <section className="space-y-3">
            {view === 'gantt' ? (
              gantt.isLoading ? (
                <div className="rounded-lg bg-surface border border-line p-8 text-center text-sm text-muted">
                  Loading timeline…
                </div>
              ) : (
                <GanttChart
                  groups={gantt.data ?? []}
                  title={p.project_name}
                  onBarClick={(tid) => nav(`/project/${encodeURIComponent(id)}/item/${encodeURIComponent(tid)}`)}
                />
              )
            ) : (
              <>
                {p.project_details.length > 0 && (
                  <div className="flex gap-1.5">
                    {([
                      ['all', `All ${p.project_details.length}`],
                      ['open', `Open ${p.project_details.length - completedCount}`],
                      ['completed', `Completed ${completedCount}`],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setDetailFilter(key)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${detailFilter === key ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <DataTable
                  rows={filteredDetails}
                  columns={detailColumns}
                  getKey={(r) => r.name}
                  onRowClick={(r) => nav(`/project-detail/${encodeURIComponent(r.name)}`)}
                  empty={
                    <EmptyState
                      icon={Layers}
                      title={p.project_details.length === 0 ? 'No details yet' : 'No matching details'}
                    />
                  }
                />
              </>
            )}
          </section>

          {/* Right pane: nested item outlet OR project comments */}
          <div className="rounded-lg bg-surface border border-line p-5 min-h-[300px]">
            {itemSelected ? (
              <Outlet />
            ) : (
              <CommentThread referenceDoctype="Project" referenceName={id} />
            )}
          </div>
        </div>
      </Section>

      {/* Overlays */}
      <ProjectFormDialog
        key={p.name}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={p}
      />
      <ProjectDetailFormDialog
        open={detailFormOpen}
        onClose={() => setDetailFormOpen(false)}
        project={p.name}
      />
      <ProjectDetailFormDialog
        key={editDetail ?? 'edit'}
        open={!!editDetail}
        onClose={() => setEditDetail(null)}
        project={p.name}
        detail={editDetail ?? undefined}
      />
      {createItemFor && (
        <CreateProjectItemDialog
          open={!!createItemFor}
          onClose={() => setCreateItemFor(null)}
          projectDetail={createItemFor}
          team={p.team.map((t) => ({ user: t.user, name: t.name }))}
          defaultGroup={itemDetail.data?.default_group ?? null}
          siblings={(itemDetail.data?.project_items ?? []).map((t) => ({ name: t.name, to_do: t.to_do }))}
        />
      )}
      <TeamWorkloadDrawer
        open={!!workloadMember}
        onClose={() => setWorkloadMember(null)}
        member={workloadMember}
        project={p.name}
      />
      <TeamManagerDrawer
        open={teamOpen}
        onClose={() => setTeamOpen(false)}
        project={p}
        canReassign={perms.can_reassign}
      />
    </Page>
  )
}
