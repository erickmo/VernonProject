import { useEffect, useState, type ReactNode } from 'react'
import { useParams, useNavigate, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import { safeDecode } from '@web/lib/route'
import {
  Target, Users, CalendarDays, CalendarClock, AlertCircle, ChevronRight,
  Layers, Pencil, Trash2, Plus, BarChart3, List, Tag, MousePointerClick, Gift, Copy,
} from 'lucide-react'
import { useProject, useProjectGantt, permFlags, useBoot, useDeleteProject, useDeleteProjectDetail, useSetProjectAutoApprove, useDuplicateProject } from '@/hooks/useData'
import { GanttChart } from '@/components/GanttChart'
import { ProgressBar, Spinner, EmptyState } from '@/components/ui'
import { Button, OverflowMenu, ErrorState } from '@web/components/ui'
import CommentThread from '@/components/CommentThread'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { formatDate, formatEstimateRatio, progressPct, formatReward, rewardNet } from '@/lib/format'
import { ProjectFormDialog } from '@web/components/ProjectFormDialog'
import { PostponeDialog } from '@web/components/PostponeDialog'
import { ProjectDetailFormDialog } from '@web/components/ProjectDetailFormDialog'
import { TeamWorkloadDrawer } from '@web/components/TeamWorkloadDrawer'
import { TeamManagerDrawer } from '@web/components/TeamManagerDrawer'
import { Section } from '@web/components/Page'
import { PropertyRow, Property } from '@web/components/Property'
import { DataTable, type Column } from '@web/components/DataTable'
import { EntityChip } from '@web/components/EntityChip'
import { ProjectGroupPhoto } from '@/components/TeamWallCanvas'
import { ProjectAutoApproveSwitch } from '@web/components/ProjectAutoApproveSwitch'
import type { TeamMember, ProjectDetailSummary } from '@/lib/types'

type View = 'list' | 'gantt'
type DetailFilter = 'all' | 'open' | 'completed'

// ponytail: pure predicate, stable outside render
function isDetailCompleted(w: ProjectDetailSummary) {
  return w.total > 0 && w.done === w.total
}

// Status tint — matches the mobile ProjectCard mapping so a project reads the
// same colour wherever it appears.
const STATUS_TINT: Record<string, string> = {
  Ongoing: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Inbox: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Closed: 'bg-paper-line text-stone-500 dark:bg-slate-700 dark:text-slate-400',
}

// Stronger accent for the thin strip atop the hero (bg-*-50 tints are too faint there).
const STATUS_BAR: Record<string, string> = {
  Ongoing: 'bg-emerald-400',
  Inbox: 'bg-sky-400',
  Closed: 'bg-slate-300 dark:bg-slate-600',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_TINT[status] ?? STATUS_TINT.Closed)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  )
}

// Compact metric block for the project hero.
function MiniStat({ label, value, accent }: { label: string; value: ReactNode; accent?: 'rose' }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2 text-center">
      <div className={clsx('font-display text-lg font-semibold tabular-nums leading-none', accent === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-ink')}>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
    </div>
  )
}

// Shown in the right pane when no work-package is selected: project comments.
export function ProjectIndexPane() {
  const { name = '' } = useParams()
  const id = safeDecode(name)
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-10 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <MousePointerClick className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-ink">Pick a detail</p>
        <p className="text-xs text-muted">Select a work-package on the left to see its todos.</p>
      </div>
      <CommentThread referenceDoctype="Project" referenceName={id} />
    </div>
  )
}

export default function Project() {
  const { name = '', detailName } = useParams()
  const id = safeDecode(name)
  const nav = useNavigate()
  const project = useProject(id)
  const boot = useBoot()
  const del = useDeleteProject()
  const dup = useDuplicateProject()
  const delDetail = useDeleteProjectDetail()
  const setProjectAutoApprove = useSetProjectAutoApprove()
  const confirm = useConfirm()
  const toast = useToast()

  const [view, setView] = useState<View>('list')
  const [detailFilter, setDetailFilter] = useState<DetailFilter>('all')
  const [editOpen, setEditOpen] = useState(false)
  const [detailFormOpen, setDetailFormOpen] = useState(false)
  const [editDetail, setEditDetail] = useState<string | null>(null)
  const [teamOpen, setTeamOpen] = useState(false)
  const [workloadMember, setWorkloadMember] = useState<TeamMember | null>(null)
  const [postpone, setPostpone] = useState<
    { type: 'Project' | 'Project Detail'; name: string; label: string; anchor: string } | null
  >(null)

  const gantt = useProjectGantt(id, view === 'gantt')

  // Project is reused across /project/:name switches (rail stays visible), so
  // reset any open overlay when the project changes — else it lingers with the
  // previous project's props.
  useEffect(() => {
    setEditOpen(false)
    setDetailFormOpen(false)
    setEditDetail(null)
    setTeamOpen(false)
    setWorkloadMember(null)
    setPostpone(null)
  }, [id])

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
  const canAutoApprove = !!boot.data?.settings?.show_auto_approve
  // Owner/leader avatars live on their team rows (matched by user email) so the
  // meta chips render each person's real gamified avatar, not a name-seeded one.
  const ownerMember = p.team.find((m) => m.user === p.project_owner)
  const leaderMember = p.team.find((m) => m.user === p.project_leader)

  const filteredDetails = p.project_details
    .filter((w) =>
      detailFilter === 'all' ? true : detailFilter === 'completed' ? isDetailCompleted(w) : !isDetailCompleted(w),
    )
    // Finished details sink to the bottom (stable sort keeps original order within each group).
    .sort((a, b) => Number(isDetailCompleted(a)) - Number(isDetailCompleted(b)))

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

  const doDuplicate = async () => {
    if (!(await confirm({
      title: 'Duplikat proyek?',
      message: 'Work item dan pengelompokan ikut tersalin, progres direset ke nol. Todo TIDAK ikut disalin.',
      confirmLabel: 'Duplikat',
      cancelLabel: 'Batal',
    }))) return
    try {
      const res = await dup.mutateAsync({ project: p.name })
      toast('success', `Proyek disalin: "${res.project_name}"`)
      nav(`/project/${encodeURIComponent(res.name)}`)
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const doDeleteDetail = async (w: ProjectDetailSummary) => {
    if (w.total > 0) return
    if (!(await confirm({ title: 'Delete this detail?', message: `"${w.title}" will be removed.`, confirmLabel: 'Delete', destructive: true }))) return
    delDetail.mutate(w.name, {
      onSuccess: () => {
        toast('success', 'Project detail deleted')
        // if the deleted detail is the one open in the right pane, close it
        if (detailName === w.name) nav(`/project/${encodeURIComponent(id)}`)
      },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  // ponytail: columns defined here (not outside) because actions column closes over perms + state
  const detailColumns: Column<ProjectDetailSummary>[] = [
    {
      key: 'title',
      header: 'Detail',
      sortValue: (r) => r.title,
      render: (r) => (
        <span className="flex flex-col gap-0.5">
          <span className={`font-medium ${isDetailCompleted(r) ? 'text-muted line-through' : 'text-ink'}`}>
            {r.title}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted">
            <span>{r.done}/{r.total}</span>
            {r.overdue > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
                <AlertCircle className="h-3 w-3" /> {r.overdue}
              </span>
            )}
          </span>
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      width: 'w-32',
      render: (r) => (
        <div className="flex items-center gap-2">
          <ProgressBar value={r.progress} className="w-16" />
          <span className="shrink-0 whitespace-nowrap text-xs text-muted">
            {formatEstimateRatio(r.minutes_done, r.minutes_total)}
          </span>
        </div>
      ),
    },
    ...((perms.can_edit || perms.can_delete) ? [{
      key: 'actions',
      header: '',
      width: 'w-10',
      render: (r: ProjectDetailSummary) => (
        <span onClick={(e) => e.stopPropagation()}>
          <OverflowMenu
            size="sm"
            items={[
              ...(perms.can_edit ? [
                { label: 'Edit', icon: Pencil, onClick: () => setEditDetail(r.name) },
                { label: 'Postpone', icon: CalendarClock, onClick: () => setPostpone({ type: 'Project Detail', name: r.name, label: r.title, anchor: '' }) },
              ] : []),
              ...(perms.can_delete ? [
                { divider: true },
                { label: 'Delete', icon: Trash2, danger: true, disabled: r.total > 0, onClick: () => doDeleteDetail(r) },
              ] : []),
            ]}
          />
        </span>
      ),
    } as Column<ProjectDetailSummary>] : []),
  ]

  return (
    <div className="w-full">
      {/* Project hero */}
      <div className="mb-6 overflow-hidden rounded-3xl bg-surface shadow-card">
        <div className={clsx('h-1.5', STATUS_BAR[p.status] ?? STATUS_BAR.Closed)} />
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={p.status} />
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  <Tag className="h-3 w-3" /> {p.brand}
                </span>
                {p.bonus_amount > 0 && (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                    <Gift className="h-3.5 w-3.5" /> {formatReward(p.reward_type, rewardNet(p.reward_type, p.bonus_amount, p.discount))}
                  </span>
                )}
              </div>
              <h1 className="mt-2.5 truncate font-display text-3xl font-semibold tracking-tight text-ink">{p.project_name}</h1>
            </div>
            {(perms.can_edit || perms.can_delete) && (
              <div className="flex items-center gap-2">
                {perms.can_edit && (
                  <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                )}
                {perms.can_edit && (
                  <Button variant="secondary" size="sm" disabled={dup.isPending} onClick={doDuplicate}>
                    <Copy className="h-4 w-4" /> {dup.isPending ? 'Menyalin…' : 'Duplikat'}
                  </Button>
                )}
                {perms.can_edit && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPostpone({ type: 'Project', name: p.name, label: p.project_name, anchor: p.deadline ?? '' })}
                  >
                    <CalendarClock className="h-4 w-4" /> Postpone
                  </Button>
                )}
                {perms.can_delete && (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={p.project_details.some((w) => w.total > 0)}
                    title={p.project_details.some((w) => w.total > 0) ? 'Remove all todos before deleting this project' : undefined}
                    onClick={doDelete}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Progress + at-a-glance metrics */}
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-semibold tabular-nums text-ink">{progress}%</span>
                <span className="text-xs font-medium text-muted">complete · {doneTasks}/{totalTasks} todos</span>
              </div>
              <ProgressBar value={progress} className="mt-2" />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:flex">
              <MiniStat label="Todos" value={`${doneTasks}/${totalTasks}`} />
              <MiniStat label="Overdue" value={overdue} accent={overdue > 0 ? 'rose' : undefined} />
              <MiniStat label="Time" value={formatEstimateRatio(minutesDone, minutesTotal)} />
            </div>
          </div>
        </div>
      </div>

      {/* 3-col workspace: rail (col1, in ProjectsWorkspace) · project meta + details
          list (col2) · selected detail's todos (col3). */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,26rem)_1fr]">
        {/* COL 2: project meta (top) → details list → group photo */}
        <section className="min-w-0 space-y-5">
          {/* --- Project meta --- */}
          <div className="rounded-2xl bg-surface p-4 shadow-card">
          <PropertyRow>
            <Property label="Owner" icon={Users}>
              <EntityChip avatarName={p.owner_name} image={ownerMember?.image ?? undefined} config={ownerMember?.avatar_config} label={p.owner_name} />
            </Property>
            {p.leader_name && p.leader_name !== p.owner_name && (
              <Property label="Leader" icon={Users}>
                <EntityChip avatarName={p.leader_name} image={leaderMember?.image ?? undefined} config={leaderMember?.avatar_config} label={p.leader_name} />
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
            <Property label="Brand" icon={Tag}>
              <EntityChip icon={Tag} label={p.brand} />
            </Property>
          </PropertyRow>
          </div>

          {p.can_set_auto_approve && canAutoApprove && (
            <div className="max-w-sm">
              <ProjectAutoApproveSwitch
                enabled={p.auto_approve}
                disabled={setProjectAutoApprove.isPending}
                onToggle={() =>
                  setProjectAutoApprove.mutate(
                    { project: p.name, enabled: p.auto_approve ? 0 : 1 },
                    { onError: (e) => toast('error', (e as Error).message) },
                  )
                }
              />
            </div>
          )}

          {p.blocked_by && (
            <button
              onClick={() => nav(`/project/${encodeURIComponent(p.blocked_by!)}`)}
              className="flex w-full items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-left text-sm font-medium text-amber-800 shadow-card transition active:scale-[0.99] dark:bg-amber-500/15 dark:text-amber-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">Blocked by <b>{p.blocked_by_name ?? p.blocked_by}</b></span>
              <ChevronRight className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
            </button>
          )}

          {p.goal && (
            <Section title={<span className="inline-flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> Goal</span>}>
              <p className="text-sm leading-relaxed text-muted dark:text-slate-300">{p.goal}</p>
            </Section>
          )}

          {p.team.length > 0 && (
            <Section
              title="Team"
              actions={
                perms.can_edit ? (
                  <button
                    onClick={() => setTeamOpen(true)}
                    className="flex items-center gap-1 rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold text-muted dark:text-slate-300 hover:bg-hover/[0.04] transition"
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
                        config={m.avatar_config}
                        label={role ? `${m.name} (${role})` : m.name}
                      />
                    </button>
                  )
                })}
              </div>
            </Section>
          )}

          {/* --- Details list / gantt (pick a detail → its todos fill col 3) --- */}
          <div className="space-y-3 border-t border-line pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Details</h2>
              <div className="flex items-center gap-2">
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
                {perms.can_edit && (
                  <button
                    onClick={() => setDetailFormOpen(true)}
                    className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition"
                  >
                    <Plus className="h-3.5 w-3.5" /> Detail
                  </button>
                )}
              </div>
            </div>

            {view === 'gantt' ? (
              gantt.isError ? (
                <ErrorState onRetry={() => gantt.refetch()} />
              ) : gantt.isLoading ? (
                <div className="rounded-2xl bg-surface p-8 text-center text-sm text-muted shadow-card">
                  Loading timeline…
                </div>
              ) : (
                <GanttChart
                  groups={gantt.data ?? []}
                  title={p.project_name}
                  onBarClick={(tid) => nav(`/project-item/${encodeURIComponent(tid)}`)}
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
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${detailFilter === key ? 'bg-brand-600 text-white' : 'bg-canvas text-muted dark:text-slate-400 hover:bg-hover/[0.04]'}`}
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
                  activeKey={detailName}
                  rowClassName={(r) => (isDetailCompleted(r) ? 'bg-canvas dark:bg-slate-800/40' : undefined)}
                  onRowClick={(r) => nav(`/project/${encodeURIComponent(id)}/detail/${encodeURIComponent(r.name)}`)}
                  empty={
                    <EmptyState
                      icon={Layers}
                      title={p.project_details.length === 0 ? 'No details yet' : 'No matching details'}
                    />
                  }
                />
              </>
            )}
          </div>

          {/* Group photo last — decorative + tall */}
          {p.team.length > 0 && (
            <Section title={<span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Group Photo</span>}>
              <ProjectGroupPhoto team={p.team} />
            </Section>
          )}
        </section>

        {/* COL 3: selected detail's todos (or project comments when none selected) */}
        <section className="min-w-0">
          <Outlet />
        </section>
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
      <ProjectDetailFormDialog
        key={editDetail ?? 'edit'}
        open={!!editDetail}
        onClose={() => setEditDetail(null)}
        project={p.name}
        detail={editDetail ?? undefined}
      />
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
      <PostponeDialog
        open={!!postpone}
        onClose={() => setPostpone(null)}
        targetType={postpone?.type ?? 'Project'}
        targetName={postpone?.name ?? ''}
        targetLabel={postpone?.label ?? ''}
        anchorDate={postpone?.anchor ?? ''}
      />
    </div>
  )
}
