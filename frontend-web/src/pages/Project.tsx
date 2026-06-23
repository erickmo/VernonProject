import { useState } from 'react'
import { useParams, useNavigate, Outlet } from 'react-router-dom'
import {
  Target, Users, CalendarDays, AlertCircle, ChevronRight, Layers,
  Pencil, Trash2, Plus, ListPlus, BarChart3, List,
} from 'lucide-react'
import { useProject, useProjectDetail, useProjectGantt, permFlags, useBoot, useDeleteProject } from '@/hooks/useData'
import { GanttChart } from '@/components/GanttChart'
import { ProgressBar, Avatar, Spinner, EmptyState } from '@/components/ui'
import CommentThread from '@/components/CommentThread'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { formatDate } from '@/lib/format'
import { ProjectFormDialog } from '@web/components/ProjectFormDialog'
import { ProjectDetailFormDialog } from '@web/components/ProjectDetailFormDialog'
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'
import { TeamWorkloadDrawer } from '@web/components/TeamWorkloadDrawer'
import type { TeamMember } from '@/lib/types'

type View = 'list' | 'gantt'
type DetailFilter = 'all' | 'open' | 'completed'

export default function Project() {
  const { name = '', itemName } = useParams()
  const id = decodeURIComponent(name)
  const nav = useNavigate()
  const project = useProject(id)
  const boot = useBoot()
  const del = useDeleteProject()
  const confirm = useConfirm()
  const toast = useToast()

  const [view, setView] = useState<View>('list')
  const [detailFilter, setDetailFilter] = useState<DetailFilter>('all')
  const [editOpen, setEditOpen] = useState(false)
  const [detailFormOpen, setDetailFormOpen] = useState(false)
  const [createItemFor, setCreateItemFor] = useState<string | null>(null)
  const [workloadMember, setWorkloadMember] = useState<TeamMember | null>(null)

  const gantt = useProjectGantt(id, view === 'gantt')
  // Quick-add targets a single detail; load it so the create form can offer
  // the Blocked-by / Blocking pickers (siblings) like the detail-page add does.
  const itemDetail = useProjectDetail(createItemFor ?? '')

  if (project.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (!project.data) {
    return (
      <EmptyState icon={AlertCircle} title="Couldn't load project" />
    )
  }

  const p = project.data
  const perms = permFlags(p, boot.data)
  const itemSelected = !!itemName

  // A detail counts as "completed" when it has todos and all are done.
  const isDetailCompleted = (w: typeof p.project_details[number]) => w.total > 0 && w.done === w.total

  const filteredDetails = p.project_details.filter((w) =>
    detailFilter === 'all' ? true : detailFilter === 'completed' ? isDetailCompleted(w) : !isDetailCompleted(w),
  )

  const completedCount = p.project_details.filter(isDetailCompleted).length
  const totalTasks = p.project_details.reduce((s, w) => s + w.total, 0)
  const doneTasks = p.project_details.reduce((s, w) => s + w.done, 0)
  const overdue = p.project_details.reduce((s, w) => s + w.overdue, 0)
  const progress = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0

  const doDelete = async () => {
    if (!(await confirm({ title: 'Delete this project?', confirmLabel: 'Delete', destructive: true }))) return
    del.mutate(p.name, {
      onSuccess: () => { toast('success', 'Project deleted'); nav('/projects') },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-card">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-200">{p.brand}</p>
        <h1 className="mt-1 text-2xl font-bold leading-snug">{p.project_name}</h1>
        <div className="mt-4 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-sm font-semibold">{progress}%</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-100">
          <span>{doneTasks}/{totalTasks} todos done</span>
          {overdue > 0 && <span className="font-semibold text-rose-200">{overdue} overdue</span>}
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> {formatDate(p.deadline)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {p.owner_name}
            {p.leader_name && p.leader_name !== p.owner_name && ` · ${p.leader_name}`}
          </span>
        </div>

        {/* Hero actions */}
        {(perms.can_edit || perms.can_delete) && (
          <div className="mt-4 flex gap-2">
            {perms.can_edit && (
              <button
                onClick={() => setEditOpen(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2 text-sm font-semibold text-white hover:bg-white/25 transition"
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
            {perms.can_delete && (
              <button
                disabled={p.project_details.length > 0}
                title={p.project_details.length > 0 ? 'Remove all details before deleting this project' : undefined}
                onClick={doDelete}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/30 transition disabled:cursor-not-allowed disabled:text-white/30"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Blocked-by banner */}
      {p.blocked_by && (
        <button
          onClick={() => nav(`/project/${encodeURIComponent(p.blocked_by!)}`)}
          className="flex w-full items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 px-3 py-2.5 text-left text-sm font-medium text-amber-800 dark:text-amber-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Blocked by <b>{p.blocked_by_name ?? p.blocked_by}</b></span>
          <ChevronRight className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
        </button>
      )}

      {/* Goal */}
      {p.goal && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-card">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <Target className="h-3.5 w-3.5" /> Goal
          </p>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{p.goal}</p>
        </div>
      )}

      {/* Team workload row */}
      {p.team.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
              <Users className="h-4 w-4" /> Team workload
            </h3>
          </div>
          <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 md:flex-wrap">
            {p.team.map((m) => {
              const role = m.is_owner && m.is_leader ? 'Owner · Leader'
                : m.is_owner ? 'Owner' : m.is_leader ? 'Leader' : null
              return (
                <button
                  key={m.user}
                  onClick={() => setWorkloadMember(m)}
                  className="flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-2xl bg-white dark:bg-slate-900 p-3 text-center shadow-card hover:shadow-md transition"
                >
                  <Avatar name={m.name} image={m.image} size={42} />
                  <p className="w-full truncate text-xs font-medium text-slate-700 dark:text-slate-200">{m.name}</p>
                  {role && (
                    <span className="rounded-full bg-brand-50 dark:bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:text-brand-300">{role}</span>
                  )}
                  <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {m.open_todos} allocated
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Split pane: left (details) + right (outlet or comments) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Left pane: Details */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
              <Layers className="h-4 w-4" /> Details
            </h3>
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
          </div>

          {view === 'gantt' ? (
            gantt.isLoading ? (
              <div className="rounded-2xl bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-400 shadow-card">
                Loading timeline…
              </div>
            ) : (
              <GanttChart
                groups={gantt.data ?? []}
                title={p.project_name}
                onBarClick={(tid) => nav(`/project/${encodeURIComponent(id)}/item/${encodeURIComponent(tid)}`)}
              />
            )
          ) : p.project_details.length ? (
            <>
              {/* Detail filter */}
              <div className="flex gap-1.5 px-1">
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

              {filteredDetails.length ? (
                <div className="flex flex-col gap-3">
                  {[
                    { label: 'Open', items: filteredDetails.filter((w) => !isDetailCompleted(w)) },
                    { label: 'Completed', items: filteredDetails.filter((w) => isDetailCompleted(w)) },
                  ].filter((s) => s.items.length).map((s) => (
                    <div key={s.label}>
                      <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {s.label} ({s.items.length})
                      </p>
                      <div className="flex flex-col gap-2.5">
                        {s.items.map((w) => (
                          <div
                            key={w.name}
                            onClick={() => nav(`/project-detail/${encodeURIComponent(w.name)}`)}
                            role="button"
                            className="cursor-pointer rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-card hover:shadow-md transition"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="min-w-0 flex-1 truncate font-semibold text-slate-800 dark:text-slate-100">{w.title}</p>
                              <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" />
                            </div>
                            <div className="mt-2.5 flex items-center gap-2">
                              <ProgressBar value={w.progress} />
                              <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {w.done}/{w.total}
                              </span>
                            </div>
                            {w.overdue > 0 && (
                              <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                                <AlertCircle className="h-3.5 w-3.5" /> {w.overdue} overdue
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Layers} title="No matching details" />
              )}
            </>
          ) : (
            <EmptyState icon={Layers} title="No details yet" />
          )}
        </section>

        {/* Right pane: nested item outlet OR project comments */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-card p-5 min-h-[300px]">
          {itemSelected ? (
            <Outlet />
          ) : (
            <CommentThread referenceDoctype="Project" referenceName={id} />
          )}
        </div>
      </div>

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
    </div>
  )
}
