import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCheck } from 'lucide-react'
import { Avatar, ProgressBar } from './ui'
import { formatDate } from '@/lib/format'
import type { ProjectCard as ProjectCardType } from '@/lib/types'

export function ProjectCard({ p }: { p: ProjectCardType }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(`/project/${encodeURIComponent(p.name)}`)}
      className="w-full rounded-2xl bg-white p-4 text-left shadow-card transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">{p.project_name}</p>
          <span className="mt-1 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            {p.customer}
          </span>
        </div>
        {p.review > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
            <CheckCheck className="h-3.5 w-3.5" />
            {p.review} to review
          </span>
        ) : (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              p.status === 'Ongoing' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {p.status}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <ProgressBar value={p.progress} />
        <span className="shrink-0 text-xs font-semibold text-slate-500">{p.progress}%</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-slate-500">
            {p.todo_done}/{p.todo_total} tasks
          </span>
          {p.overdue > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-rose-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {p.overdue}
            </span>
          )}
        </div>
        <span className="text-slate-400">Due {formatDate(p.deadline)}</span>
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs">
        <span className="flex items-center gap-1.5 text-slate-500">
          <Avatar name={p.owner_name} size={20} />
          <span className="text-slate-400">Owner</span>
          <span className="font-medium text-slate-600">{p.owner_name}</span>
        </span>
        <span className="flex items-center gap-1.5 text-slate-500">
          <Avatar name={p.leader_name} size={20} />
          <span className="text-slate-400">Lead</span>
          <span className="font-medium text-slate-600">{p.leader_name}</span>
        </span>
      </div>
    </button>
  )
}
