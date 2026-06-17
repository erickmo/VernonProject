import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Target, Users, CalendarDays, AlertCircle, ChevronRight, Layers, Pencil, Trash2, Plus, ListPlus, UserPlus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Avatar, EmptyState, FullScreenLoader, ProgressBar } from '@/components/ui'
import { ProjectFormSheet } from '@/components/ProjectFormSheet'
import { ProjectDetailFormSheet } from '@/components/ProjectDetailFormSheet'
import { CreateTaskSheet } from '@/components/CreateTaskSheet'
import { GroupManagerSheet } from '@/components/GroupManagerSheet'
import { TeamManagerSheet } from '@/components/TeamManagerSheet'
import { MemberWorkloadSheet } from '@/components/MemberWorkloadSheet'
import { useToast } from '@/components/Toast'
import { useProject, useBoot, useDeleteProject, permFlags } from '@/hooks/useData'
import { formatDate } from '@/lib/format'
import type { TeamMember } from '@/lib/types'

export default function ProjectScreen() {
  const { name = '' } = useParams()
  const id = decodeURIComponent(name)
  const navigate = useNavigate()
  const { data, isLoading } = useProject(id)
  const { data: boot } = useBoot()
  const toast = useToast()
  const del = useDeleteProject()
  const [editOpen, setEditOpen] = useState(false)
  const [wiOpen, setWiOpen] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [taskFor, setTaskFor] = useState<string | null>(null)
  const [workloadMember, setWorkloadMember] = useState<TeamMember | null>(null)

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
  const progress = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0

  return (
    <DetailScreen title={data.project_name}>
      {/* Hero summary */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-card">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-200">{data.customer}</p>
        <h2 className="mt-1 text-xl font-bold leading-snug">{data.project_name}</h2>
        <div className="mt-4 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-sm font-semibold">{progress}%</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-100">
          <span>
            {doneTasks}/{totalTasks} project items done
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

      {(flags.can_edit || flags.can_delete) && (
        <div className="mt-3 flex gap-2">
          {flags.can_edit && (
            <button onClick={() => setEditOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-sm font-semibold text-slate-700 shadow-card active:scale-95">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
          {flags.can_edit && (
            <button onClick={() => setTeamOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-sm font-semibold text-slate-700 shadow-card active:scale-95">
              <Users className="h-4 w-4" /> Team
            </button>
          )}
          {flags.can_delete && (
            <button
              disabled={data.project_details.length > 0}
              title={data.project_details.length > 0 ? 'Remove all project details before deleting this project' : undefined}
              onClick={() => {
                if (!confirm('Delete this project?')) return
                del.mutate(data.name, {
                  onSuccess: () => { toast('success', 'Project deleted'); navigate('/projects') },
                  onError: (e) => toast('error', (e as Error).message),
                })
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-sm font-semibold text-rose-600 shadow-card active:scale-95 disabled:cursor-not-allowed disabled:text-slate-300 disabled:active:scale-100">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
      )}

      {data.goal && (
        <div className="mt-3 rounded-2xl bg-white p-4 shadow-card">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Target className="h-3.5 w-3.5" /> Goal
          </p>
          <p className="text-sm leading-relaxed text-slate-600">{data.goal}</p>
        </div>
      )}

      {/* Team workload */}
      {data.team.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
              <Users className="h-4 w-4" /> Team workload
            </h3>
            {flags.can_edit && (
              <button onClick={() => setTeamOpen(true)}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 active:scale-95">
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
                  className="flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-2xl bg-white p-3 text-center shadow-card active:scale-95"
                >
                  <Avatar name={m.name} image={m.image} size={42} />
                  <p className="w-full truncate text-xs font-medium text-slate-700">{m.name}</p>
                  {role && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">{role}</span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                    {m.open_todos} open
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Project Details */}
      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
            <Layers className="h-4 w-4" /> Project Details
          </h3>
          {flags.can_edit && (
            <div className="flex gap-2">
              <button onClick={() => setGroupsOpen(true)}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 active:scale-95">
                <Layers className="h-3.5 w-3.5" /> Groups
              </button>
              <button onClick={() => setWiOpen(true)}
                className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95">
                <Plus className="h-3.5 w-3.5" /> Project Detail
              </button>
              {data.project_details.length > 0 && (
                <button onClick={() => setTaskFor(data.project_details[0].name)}
                  className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 active:scale-95">
                  <ListPlus className="h-3.5 w-3.5" /> Project Item
                </button>
              )}
            </div>
          )}
        </div>
        {data.project_details.length ? (
          <div className="flex flex-col gap-2.5">
            {data.project_details.map((w) => (
              <button
                key={w.name}
                onClick={() => navigate(`/project-detail/${encodeURIComponent(w.name)}`)}
                className="w-full rounded-2xl bg-white p-4 text-left shadow-card transition active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate font-semibold text-slate-800">{w.title}</p>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <ProgressBar value={w.progress} />
                  <span className="shrink-0 text-xs font-semibold text-slate-500">
                    {w.done}/{w.total}
                  </span>
                </div>
                {w.overdue > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-600">
                    <AlertCircle className="h-3.5 w-3.5" /> {w.overdue} overdue
                  </p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={Layers} title="No project details yet" />
        )}
      </section>

      <ProjectFormSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={data}
        canReassign={flags.can_reassign}
      />
      <ProjectDetailFormSheet open={wiOpen} onClose={() => setWiOpen(false)} project={data.name} groupings={data.groupings ?? []} />
      <GroupManagerSheet open={groupsOpen} onClose={() => setGroupsOpen(false)} project={data.name} />
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
      {taskFor && (
        <CreateTaskSheet open={!!taskFor} onClose={() => setTaskFor(null)} workItem={taskFor} team={data.team} />
      )}
    </DetailScreen>
  )
}
