import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, AlertCircle, CalendarDays, ChevronRight, Layers } from 'lucide-react'
import { useMemberWorkload } from '@/hooks/useData'
import { Avatar, Spinner, EmptyState } from '@/components/ui'
import type { TeamMember } from '@/lib/types'

interface Props {
  open: boolean
  member: TeamMember | null
  project: string
  onClose: () => void
}

export function MemberWorkloadSheet({ open, member, project, onClose }: Props) {
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)
  useEffect(() => {
    if (open) setShowAll(false)
  }, [member?.user, open])
  const { data, isLoading } = useMemberWorkload(project, open ? member?.user ?? null : null, showAll)

  if (!open || !member) return null

  const role = member.is_owner && member.is_leader
    ? 'Owner · Leader'
    : member.is_owner
      ? 'Owner'
      : member.is_leader
        ? 'Leader'
        : null

  const goto = (projectDetail: string) => {
    onClose()
    navigate(`/project-detail/${encodeURIComponent(projectDetail)}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={member.name} image={member.image} size={40} />
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-slate-900">{member.name}</p>
              <p className="text-xs text-slate-500">
                {role ? `${role} · ` : ''}{member.open_todos} open
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Open / All toggle */}
        <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-0.5 text-sm font-semibold">
          <button
            onClick={() => setShowAll(false)}
            className={`rounded-lg px-4 py-1.5 ${!showAll ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            Open
          </button>
          <button
            onClick={() => setShowAll(true)}
            className={`rounded-lg px-4 py-1.5 ${showAll ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            All
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>
        ) : data && data.length ? (
          <div className="flex flex-col gap-2">
            {data.map((t) => (
              <button
                key={t.name}
                onClick={() => goto(t.project_detail)}
                className="w-full rounded-2xl border border-slate-200 p-3 text-left active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate font-medium text-slate-800">{t.to_do}</p>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
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
      </div>
    </div>
  )
}
