import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Target, Users, CalendarDays, AlertCircle, ChevronRight, Layers, Pencil, Trash2, Plus, ListPlus, UserPlus, Ban, List, BarChart3, FolderKanban, Gift, CalendarClock } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Avatar, EmptyState, FullScreenLoader, ProgressBar } from '@/components/ui'
import CommentThread from '@/components/CommentThread'
import { ProjectFormSheet } from '@/components/ProjectFormSheet'
import { ProjectDetailFormSheet } from '@/components/ProjectDetailFormSheet'
import { ProjectDetailEditSheet } from '@/components/ProjectDetailEditSheet'
import { PostponeSheet } from '@/components/PostponeSheet'
import { CreateProjectItemSheet } from '@/components/CreateProjectItemSheet'
import { TeamManagerSheet } from '@/components/TeamManagerSheet'
import { MemberWorkloadSheet } from '@/components/MemberWorkloadSheet'
import { ProjectGroupPhoto } from '@/components/TeamWallCanvas'
import { ProjectAutoApproveSwitch } from '@/components/ProjectAutoApproveSwitch'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useProject, useProjectDetail, useProjectGantt, useBoot, useDeleteProject, useDeleteProjectDetail, useSetProjectAutoApprove, permFlags } from '@/hooks/useData'
import { GanttChart } from '@/components/GanttChart'
import { formatDate, formatEstimateRatio, progressPct, formatReward, rewardNet } from '@/lib/format'
import type { TeamMember } from '@/lib/types'

export default function ProjectScreen() {
  const { name = '' } = useParams()
  const id = decodeURIComponent(name)
  const navigate = useNavigate()
  const { data, isLoading } = useProject(id)
  const { data: boot } = useBoot()
  const toast = useToast()
  const confirm = useConfirm()
  const del = useDeleteProject()
  const delDetail = useDeleteProjectDetail()
  const setProjectAutoApprove = useSetProjectAutoApprove()
  const [editOpen, setEditOpen] = useState(false)
  const [wiOpen, setWiOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [editDetail, setEditDetail] = useState<string | null>(null)
  const [postpone, setPostpone] = useState<{ type: 'Project' | 'Project Detail'; name: string; label: string; anchor: string } | null>(null)
  const [itemFor, setItemFor] = useState<string | null>(null)
  const [workloadMember, setWorkloadMember] = useState<TeamMember | null>(null)
  const [view, setView] = useState<'list' | 'gantt'>('list')
  const [detailFilter, setDetailFilter] = useState<'all' | 'open' | 'completed'>('all')
  const { data: gantt, isLoading: ganttLoading } = useProjectGantt(id, view === 'gantt')
  // Quick-add targets a single detail; load it so the create form can offer
  // the Blocked-by / Blocking pickers (siblings) like the detail-page add does.
  const { data: itemDetailData } = useProjectDetail(itemFor ?? '')

  if (isLoading && !data) {
    return (
      <DetailScreen title="Project">
        <FullScreenLoader />
      </DetailScreen>
    )
  }
  if (!data) {
    return (
      <DetailScreen title="Project">
        <EmptyState icon={AlertCircle} title="Couldn't load project" />
      </DetailScreen>
    )
  }

  const flags = permFlags(data, boot)

  const totalTasks = data.project_details.reduce((s, w) => s + w.total, 0)
  const doneTasks = data.project_details.reduce((s, w) => s + w.done, 0)
  const overdue = data.project_details.reduce((s, w) => s + w.overdue, 0)
  const minutesTotal = data.project_details.reduce((s, w) => s + w.minutes_total, 0)
  const minutesDone = data.project_details.reduce((s, w) => s + w.minutes_done, 0)
  const progress = progressPct(minutesDone, minutesTotal, doneTasks, totalTasks)

  // A detail counts as "completed" when it has todos and all are done.
  const isDetailCompleted = (w: typeof data.project_details[number]) => w.total > 0 && w.done === w.total
  const filteredDetails = data.project_details.filter((w) =>
    detailFilter === 'all' ? true : detailFilter === 'completed' ? isDetailCompleted(w) : !isDetailCompleted(w),
  )
  const completedCount = data.project_details.filter(isDetailCompleted).length

  return (
    <DetailScreen title={data.project_name}>
      {/* Hero summary */}
      <div className="rounded-2xl bg-brand-600 border border-brand-700/50 p-5 text-white shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-200">{data.brand}</p>
        <h2 className="mt-1 text-xl font-bold leading-snug">{data.project_name}</h2>
        <div className="mt-4 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-sm font-semibold">{progress}%</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-100">
          <span className="font-semibold text-white">{formatEstimateRatio(minutesDone, minutesTotal)}</span>
          <span>
            {doneTasks}/{totalTasks} todos done
          </span>
          {overdue > 0 && <span className="font-semibold text-rose-200">{overdue} overdue</span>}
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> {formatDate(data.deadline)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {data.owner_name}
            {data.leader_name && data.leader_name !== data.owner_name && ` · ${data.leader_name}`}
          </span>
        </div>
      </div>

      {data.blocked_by && (
        <button
          onClick={() => navigate(`/project/${encodeURIComponent(data.blocked_by!)}`)}
          className="mt-3 flex w-full items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 px-3 py-2.5 text-left text-sm font-medium text-amber-800 dark:text-amber-300 active:scale-[0.99]"
        >
          <Ban className="h-4 w-4 shrink-0" />
          <span className="flex-1">Blocked by <b>{data.blocked_by_name ?? data.blocked_by}</b></span>
          <ChevronRight className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
        </button>
      )}

      {(flags.can_edit || flags.can_delete) && (
        <div className="mt-3 flex gap-2">
          {flags.can_edit && (
            <button onClick={() => setEditOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white dark:bg-slate-800 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm active:scale-95">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
          {flags.can_edit && (
            <button onClick={() => setTeamOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white dark:bg-slate-800 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm active:scale-95">
              <Users className="h-4 w-4" /> Team
            </button>
          )}
          {flags.can_edit && (
            <button onClick={() => setPostpone({ type: 'Project', name: data.name, label: data.project_name, anchor: data.deadline ?? '' })}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white dark:bg-slate-800 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm active:scale-95">
              <CalendarClock className="h-4 w-4" /> Postpone
            </button>
          )}
          {flags.can_delete && (
            <button
              disabled={data.project_details.length > 0}
              title={data.project_details.length > 0 ? 'Remove all details before deleting this project' : undefined}
              onClick={async () => {
                if (!(await confirm({ title: 'Delete this project?', confirmLabel: 'Delete', destructive: true })))
                  return
                del.mutate(data.name, {
                  onSuccess: () => { toast('success', 'Project deleted'); navigate('/projects') },
                  onError: (e) => toast('error', (e as Error).message),
                })
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white dark:bg-slate-800 py-2 text-sm font-semibold text-rose-600 shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:text-slate-300 disabled:active:scale-100">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
      )}

      {data.can_set_auto_approve && !!boot?.employee?.show_auto_approve && (
        <div className="mt-3">
          <ProjectAutoApproveSwitch
            enabled={data.auto_approve}
            disabled={setProjectAutoApprove.isPending}
            onToggle={() =>
              setProjectAutoApprove.mutate(
                { project: data.name, enabled: data.auto_approve ? 0 : 1 },
                { onError: (e) => toast('error', (e as Error).message) },
              )
            }
          />
        </div>
      )}

      {data.goal && (
        <div className="mt-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <Target className="h-3.5 w-3.5" /> Goal
          </p>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{data.goal}</p>
        </div>
      )}

      {data.bonus_amount > 0 && (
        <div className="mt-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <Gift className="h-3.5 w-3.5" /> Reward
          </p>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
            {formatReward(data.reward_type, rewardNet(data.reward_type, data.bonus_amount, data.discount))}
          </p>
          {data.reward_type !== 'Point' && data.discount > 0 && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Bonus {formatReward('Rupiah', data.bonus_amount)} − discount {formatReward('Rupiah', data.discount)}
            </p>
          )}
        </div>
      )}

      {/* Team workload */}
      {data.team.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
              <Users className="h-4 w-4" /> Team workload
            </h3>
            {flags.can_edit && (
              <button onClick={() => setTeamOpen(true)}
                className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 active:scale-95">
                <UserPlus className="h-3.5 w-3.5" /> Manage
              </button>
            )}
          </div>
          <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
            {data.team.map((m) => {
              const role = m.is_owner && m.is_leader ? 'Owner · Leader'
                : m.is_owner ? 'Owner' : m.is_leader ? 'Leader' : null
              return (
                <button
                  key={m.user}
                  onClick={() => setWorkloadMember(m)}
                  className="flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-center shadow-sm active:scale-95"
                >
                  <Avatar name={m.name} image={m.image} config={m.avatar_config} size={42} />
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

      {/* Group photo */}
      {data.team.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <Users className="h-4 w-4" /> Group Photo
          </h3>
          <ProjectGroupPhoto team={data.team} />
        </section>
      )}

      {/* Details */}
      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <Layers className="h-4 w-4" /> Details
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
            {flags.can_edit && (
              <>
                <button onClick={() => setWiOpen(true)}
                  className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95">
                  <Plus className="h-3.5 w-3.5" /> Detail
                </button>
                {data.project_details.length > 0 && (
                  <button onClick={() => setItemFor(data.project_details[0].name)}
                    className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 active:scale-95">
                    <ListPlus className="h-3.5 w-3.5" /> Todo
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {view === 'gantt' ? (
          ganttLoading ? (
            <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-slate-400 dark:text-slate-500 shadow-sm">Loading timeline…</div>
          ) : (
            <GanttChart
              groups={gantt ?? []}
              title={data.project_name}
              onBarClick={(tid) => navigate(`/project-item/${encodeURIComponent(tid)}`)}
            />
          )
        ) : data.project_details.length ? (
          <>
            <div className="mb-2.5 flex gap-1.5">
              {([
                ['all', `All ${data.project_details.length}`],
                ['open', `Open ${data.project_details.length - completedCount}`],
                ['completed', `Completed ${completedCount}`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDetailFilter(key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${detailFilter === key ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
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
                <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{s.label} ({s.items.length})</p>
                <div className="flex flex-col gap-2.5">
                  {s.items.map((w) => (
              <div
                key={w.name}
                onClick={() => navigate(`/project-detail/${encodeURIComponent(w.name)}`)}
                role="button"
                className="flex w-full cursor-pointer items-start gap-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 text-left shadow-sm transition active:scale-[0.99]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate font-semibold text-slate-800 dark:text-slate-100">{w.title}</p>
                  {flags.can_edit ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); setPostpone({ type: 'Project Detail', name: w.name, label: w.title, anchor: '' }) }}
                        className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 active:bg-slate-100 dark:active:bg-slate-700"
                      >
                        <CalendarClock className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditDetail(w.name) }}
                        className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 active:bg-slate-100 dark:active:bg-slate-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        disabled={w.total > 0}
                        title={w.total > 0 ? 'Remove all todos before deleting this detail' : undefined}
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (w.total > 0) return
                          if (!(await confirm({ title: 'Delete this detail?', message: `"${w.title}" will be removed.`, confirmLabel: 'Delete', destructive: true }))) return
                          delDetail.mutate(w.name, {
                            onSuccess: () => toast('success', 'Project detail deleted'),
                            onError: (err) => toast('error', (err as Error).message),
                          })
                        }}
                        className="rounded-lg p-1.5 text-rose-600 active:bg-rose-50 dark:active:bg-rose-500/15 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" />
                  )}
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

      <CommentThread referenceDoctype="Project" referenceName={id} />

      <ProjectFormSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={data}
        canReassign={flags.can_reassign}
      />
      <ProjectDetailFormSheet open={wiOpen} onClose={() => setWiOpen(false)} project={data.name} />
      <ProjectDetailEditSheet
        open={!!editDetail}
        onClose={() => setEditDetail(null)}
        projectDetailName={editDetail ?? ''}
      />
      {postpone && (
        <PostponeSheet
          open={!!postpone}
          onClose={() => setPostpone(null)}
          targetType={postpone.type}
          targetName={postpone.name}
          targetLabel={postpone.label}
          anchorDate={postpone.anchor}
        />
      )}
      <TeamManagerSheet
        open={teamOpen}
        onClose={() => setTeamOpen(false)}
        project={data}
        canReassign={flags.can_reassign}
      />
      <MemberWorkloadSheet
        open={!!workloadMember}
        member={workloadMember}
        project={data.name}
        onClose={() => setWorkloadMember(null)}
      />
      {itemFor && (
        <CreateProjectItemSheet
          open={!!itemFor}
          onClose={() => setItemFor(null)}
          projectDetail={itemFor}
          team={data.team}
          defaultGroup={itemDetailData?.default_group}
          siblings={(itemDetailData?.project_items ?? []).map((t) => ({ name: t.name, to_do: t.to_do }))}
        />
      )}
    </DetailScreen>
  )
}
