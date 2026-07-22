import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CalendarDays, ChevronRight, Layers } from 'lucide-react'
import { useMemberWorkload } from '@/hooks/useData'
import { Avatar, Spinner, EmptyState } from '@/components/ui'
import { Drawer } from '@web/components/overlays/Drawer'
import LeaderNotesSection from './LeaderNotesSection'
import type { TeamMember } from '@/lib/types'

interface Props {
  open: boolean
  member: TeamMember | null
  project: string
  onClose: () => void
}

export function TeamWorkloadDrawer({ open, member, project, onClose }: Props) {
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (open) setShowAll(false)
  }, [member?.user, open])

  const { data, isLoading } = useMemberWorkload(project, open ? member?.user ?? null : null, showAll)

  const role = member
    ? member.is_owner && member.is_leader
      ? 'Owner · Leader'
      : member.is_owner
        ? 'Owner'
        : member.is_leader
          ? 'Leader'
          : null
    : null

  const goto = (projectDetail: string) => {
    onClose()
    navigate(`/project-detail/${encodeURIComponent(projectDetail)}`)
  }

  const title = member ? member.name : 'Team member'

  return (
    <Drawer open={open} onClose={onClose} title={title}>
      {member && (
        <div className="flex flex-col gap-4">
          {/* Member header */}
          <div className="flex items-center gap-3">
            <Avatar name={member.name} image={member.image} config={member.avatar_config} size={40} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{member.name}</p>
              <p className="text-xs text-muted">
                {role ? `${role} · ` : ''}{member.open_todos} allocated
              </p>
            </div>
          </div>

          {/* Open / All toggle */}
          <div className="inline-flex rounded-xl bg-canvas p-0.5 text-sm font-semibold">
            <button
              onClick={() => setShowAll(false)}
              className={`rounded-lg px-4 py-1.5 ${!showAll ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
            >
              Open
            </button>
            <button
              onClick={() => setShowAll(true)}
              className={`rounded-lg px-4 py-1.5 ${showAll ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
            >
              All
            </button>
          </div>

          {/* Todo list */}
          {isLoading ? (
            <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>
          ) : data && data.length ? (
            <div className="flex flex-col gap-2">
              {data.map((t) => (
                <button
                  key={t.name}
                  onClick={() => goto(t.project_detail)}
                  className="w-full rounded-lg border border-line dark:border-slate-700 bg-surface p-3 text-left hover:bg-hover/[0.04] transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate font-medium text-ink">{t.to_do}</p>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted dark:text-slate-600" />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" /> {t.project_detail_title}
                    </span>
                    {t.deadline_human && (
                      <span className={`inline-flex items-center gap-1 ${t.is_overdue ? 'font-semibold text-rose-600' : ''}`}>
                        {t.is_overdue ? <AlertCircle className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
                        {t.deadline_human}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={Layers} title="No todos" />
          )}

          {/* Notes for this member, scoped to this project — self-gates to owner/leader/admin. */}
          <LeaderNotesSection user={member.user} project={project} />
        </div>
      )}
    </Drawer>
  )
}
