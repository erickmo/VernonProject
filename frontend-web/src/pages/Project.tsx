import { useState } from 'react'
import { useParams, useNavigate, Outlet } from 'react-router-dom'
import {
  Target, Users, CalendarDays, AlertCircle, ChevronRight, Layers,
  Pencil, Trash2, Plus, ListPlus, BarChart3, List,
} from 'lucide-react'
import { useProject, useProjectDetail, useProjectGantt, permFlags, useBoot, useDeleteProject, useDeleteProjectDetail } from '@/hooks/useData'
import { GanttChart } from '@/components/GanttChart'
import { ProgressBar, Avatar, Spinner, EmptyState } from '@/components/ui'
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
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
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
  // Quick-add targets a single detail; load it so the create form can offer
  // the Blocked-by / Blocking pickers (siblings) like the detail-page add does.
  const itemDetail = useProjectDetail(createItemFor ?? '')

  // Hook must run every render, so call it before the loading/error early returns.
  useSetCrumbs(project.data ? [{ label: 'Projects', to: '/projects' }, { label: project.data.project_name }] : [])

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

  const doDeleteDetail = async (w: typeof p.project_details[number]) => {
    if (w.total > 0) return // backend won't cascade — remove todos first
    if (!(await confirm({ title: 'Delete this detail?', message: `"${w.title}" will be removed.`, confirmLabel: 'Delete', destructive: true }))) return
    delDetail.mutate(w.name, {
      onSuccess: () => toast('success', 'Project detail deleted'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <div className="space-y-5">
      <BentoGrid>
        {/* Hero: gradient sky tile */}
        <BentoTile span="wide" tone="gradient" accent="sky">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide opacity-70">{p.brand}</p>
              <h1 className="mt-1 text-2xl font-bold leading-snug">{p.project_name}</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sky-200/50 dark:bg-sky-900/50">
                <div className="h-full rounded-full bg-sky-600 dark:bg-sky-400" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-sm font-semibold">{progress}%</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-80">
              <span className="font-semibold">{formatEstimateRatio(minutesDone, minutesTotal)}</span>
              <span>{doneTasks}/{totalTasks} todos done</span>
              {overdue > 0 && <span className="font-semibold text-rose-600 dark:text-rose-400">{overdue} overdue</span>}
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> {formatDate(p.deadline)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {p.owner_name}
                {p.leader_name && p.leader_name !== p.owner_name && ` · ${p.leader_name}`}
              </span>
            </div>
            {(perms.can_edit || perms.can_delete) && (
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
            )}
          </div>
        </BentoTile>

        {/* Progress stats */}
        <BentoTile span="sm" tone="tint" accent="sky">
          <BentoStat value={`${progress}%`} label="Progress" />
        </BentoTile>
        <BentoTile span="sm" tone="tint" accent="sky">
          <BentoStat value={doneTasks} label="Done" delta={`of ${totalTasks} todos`} />
        </BentoTile>
        {overdue > 0 && (
          <BentoTile span="sm" tone="tint" accent="rose">
            <BentoStat value={overdue} label="Overdue" />
          </BentoTile>
        )}
        <BentoTile span="sm" tone="tint" accent="sky">
          <BentoStat value={completedCount} label="Details done" delta={`of ${p.project_details.length}`} />
        </BentoTile>

        {/* Blocked-by banner */}
        {p.blocked_by && (
          <BentoTile span="full" tone="plain">
            <button
              onClick={() => nav(`/project/${encodeURIComponent(p.blocked_by!)}`)}
              className="flex w-full items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 px-3 py-2.5 text-left text-sm font-medium text-amber-800 dark:text-amber-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">Blocked by <b>{p.blocked_by_name ?? p.blocked_by}</b></span>
              <ChevronRight className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
            </button>
          </BentoTile>
        )}

        {/* Goal */}
        {p.goal && (
          <BentoTile span="full" tone="plain" icon={Target} title="Goal">
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{p.goal}</p>
          </BentoTile>
        )}

        {/* Team workload */}
        {p.team.length > 0 && (
          <BentoTile
            span="full" tone="tint" accent="slate" icon={Users} title="Team workload"
            actions={perms.can_edit ? (
              <button
                onClick={() => setTeamOpen(true)}
                className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                <Users className="h-3.5 w-3.5" /> Manage
              </button>
            ) : undefined}
          >
            <div className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto pb-1 md:flex-wrap">
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
          </BentoTile>
        )}

        {/* Items list (full width) — contains the details list + outlet split */}
        <BentoTile span="full" tone="plain">
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
                                  <div className="flex shrink-0 items-center gap-1">
                                    {perms.can_edit && (
                                      <span onClick={(e) => e.stopPropagation()}>
                                        <OverflowMenu
                                          size="sm"
                                          items={[
                                            { label: 'Edit', icon: Pencil, onClick: () => setEditDetail(w.name) },
                                            { divider: true },
                                            { label: 'Delete', icon: Trash2, danger: true, disabled: w.total > 0, onClick: () => doDeleteDetail(w) },
                                          ]}
                                        />
                                      </span>
                                    )}
                                    <ChevronRight className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                                  </div>
                                </div>
                                <div className="mt-2.5 flex items-center gap-2">
                                  <ProgressBar value={w.progress} />
                                  <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {formatEstimateRatio(w.minutes_done, w.minutes_total)} · {w.done}/{w.total}
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
        </BentoTile>
      </BentoGrid>

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
    </div>
  )
}
